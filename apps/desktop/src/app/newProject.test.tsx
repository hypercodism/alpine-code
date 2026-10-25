import type { ProjectInfo } from '@alpine/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNavigation } from '@/shared/navigation';
import { LocaleProvider } from '@/shared/i18n';
import { chatScript, mergeScripts, PROJECTS, scriptedConnection, ServerProvider } from '@/shared/server';

import { routeTree } from './routeTree.gen';

const MADE: ProjectInfo = {
  path: '/Users/me/AlpineCode/craft-booking',
  name: 'craft-booking',
  branch: 'main',
  lastUsedAt: new Date().toISOString(),
  archived: false,
  lastAgent: null,
};

/**
 * The scripted server, whose list of projects gains a new project once a session exists in its folder. It starts at
 * `path` (새 프로젝트 by default); `known` are the projects it has to begin with. `sent` lists the requests made.
 */
function mount(path = '/', known: ProjectInfo[] = PROJECTS) {
  const sent: { method: string; params: Record<string, unknown> }[] = [];
  const script = mergeScripts(chatScript({ newProject: { judgeMs: 0, createMs: 0 } }), {
    results: {
      'projects/list': async () => {
        const { sessions } = await connection.request('session/list', {});
        const made = [...new Set(sessions.map((s) => s.cwd))]
          .filter((cwd) => !known.some((p) => p.path === cwd))
          .map((cwd) => ({ ...MADE, path: cwd, name: cwd.split('/').at(-1)! }));
        return { projects: [...made, ...known], clones: [] };
      },
    },
  });
  const base = scriptedConnection(script);
  const connection: typeof base = {
    ...base,
    request: (method, params) => {
      sent.push({ method, params: params as Record<string, unknown> });
      return base.request(method, params);
    },
  };
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ServerProvider connection={connection}>
        <LocaleProvider locale="ko">
          <RouterProvider router={router} />
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
  return { router, sent };
}

const IDEA = '동네 공방 원데이 클래스를 예약받는 페이지를 만들어 줘';
const send = async () => {
  fireEvent.input(await screen.findByLabelText('메시지'), { target: { value: IDEA } });
  fireEvent.click(screen.getByRole('button', { name: '보내기' }));
};

beforeEach(() => {
  localStorage.clear();
  useNavigation.setState({
    expanded: {},
    lastSessions: {},
    lastProject: null,
    seen: {},
    since: new Date().toISOString(),
    pinnedProjects: [],
    sort: 'recent',
    searchOpen: false,
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('새 프로젝트', () => {
  it('is the start screen, even when there are no projects at all', async () => {
    mount('/', []);
    expect(await screen.findByRole('heading', { name: '무엇을 만들어 볼까요?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '만들 곳: 새 폴더' })).toBeTruthy();
  });

  it('makes the project in a new folder and ends on its map, where the AI plans the idea', async () => {
    const { router, sent } = mount();
    await send();
    fireEvent.click(await screen.findByRole('button', { name: '만들기' }));
    fireEvent.click(await screen.findByRole('button', { name: '지도로 가기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
    expect(router.state.location.search).toEqual({ project: MADE.path });
    expect(sent.find((r) => r.method === 'projects/create')?.params.folder).toBeUndefined();
  });

  it('makes it in an empty folder the person made, when the map of that folder asked for it', async () => {
    const mine = '/Users/me/Developments/devlog';
    const { router, sent } = mount(`/?folder=${encodeURIComponent(mine)}`);
    expect(await screen.findByRole('button', { name: '만들 곳: devlog' })).toBeTruthy();
    await send();
    fireEvent.click(await screen.findByRole('button', { name: '만들기' }));
    fireEvent.click(await screen.findByRole('button', { name: '지도로 가기' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ project: mine }));
    expect(sent.find((r) => r.method === 'projects/create')?.params.folder).toBe(mine);
  });

  it('opens the map of a project that is already there, rather than starting anything in it', async () => {
    const { router } = mount(`/?project=${encodeURIComponent(PROJECTS[0]!.path)}`);
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
  });
});
