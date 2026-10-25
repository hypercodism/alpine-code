import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDockOpen, useDockTab } from '@/features/dock/state';
import { blogBoard, blogBuild } from '@/features/product-map/planExample';
import { boardScript } from '@/features/product-map/testBoard';
import { LocaleProvider } from '@/shared/i18n';
import {
  mergeScripts,
  scriptedConnection,
  ServerProvider,
  sessionInfo,
  sessionScript,
  setUpScript,
} from '@/shared/server';

import { routeTree } from './routeTree.gen';

vi.mock('@/features/terminal/TerminalScreen', () => ({
  default: ({ label }: { label: string }) => <textarea aria-label={label} />,
}));

const cwd = '/Users/me/alpine-code';

/** A plan being built in a project: its map conversation, the build's, and one conversation from before. */
function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(),
      { results: { 'devServers/list': { servers: [] } } },
      sessionScript({
        sessions: [
          {
            info: sessionInfo({ id: 'map-1', cwd, purpose: 'map', title: '지도' }),
            items: [{ id: 'u1', kind: 'user_message', text: '개발 블로그 만들어 줘' }],
          },
          {
            info: sessionInfo({ id: 'build-1', cwd, purpose: 'build', title: '만들기' }),
            items: blogBuild('building'),
          },
          {
            info: sessionInfo({ id: 'old', cwd, title: '예전 대화' }),
            items: [{ id: 'o1', kind: 'user_message', text: '예전에 한 부탁' }],
          },
        ],
      }),
      boardScript({ ...blogBoard('building'), build: 'ended' }),
    ),
  );
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  render(
    <QueryClientProvider client={client}>
      <ServerProvider connection={connection}>
        <LocaleProvider locale="ko">
          <RouterProvider router={router} />
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
}

const board = (session?: string) => `/board?project=${encodeURIComponent(cwd)}${session ? `&session=${session}` : ''}`;
const dock = () => screen.findByRole('complementary', { name: '오른쪽 창' });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alpine.rail.open', 'false');
  const open = renderHook(() => useDockOpen());
  act(() => open.result.current[1](true));
  open.unmount();
  const tab = renderHook(() => useDockTab());
  act(() => tab.result.current[1](''));
  tab.unmount();
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

describe("the map's conversation beside it (#6)", () => {
  it('is the build while a plan is built: where the map input goes', async () => {
    mount(board());
    expect(await within(await dock()).findByText('이대로 만들어 주세요.')).toBeTruthy();
    expect(within(await dock()).queryByText('개발 블로그 만들어 줘')).toBeNull();
  });

  it('says when another conversation is open, and leads back to the one the map talks to', async () => {
    mount(board('old'));
    const side = await dock();
    expect(await within(side).findByText('예전에 한 부탁')).toBeTruthy();
    expect(within(side).getByText('지금 지도 대화가 아닌 다른 대화를 보고 있어요')).toBeTruthy();
    fireEvent.click(within(side).getByRole('button', { name: '지도 대화로 돌아가기' }));
    expect(await within(await dock()).findByText('이대로 만들어 주세요.')).toBeTruthy();
    expect(screen.queryByText('지금 지도 대화가 아닌 다른 대화를 보고 있어요')).toBeNull();
  });
});
