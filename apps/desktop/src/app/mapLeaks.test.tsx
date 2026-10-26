import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExternalSessionInfo, SessionInfo } from '@alpine/protocol';
import { LocaleProvider } from '@/shared/i18n';
import { useNavigation } from '@/shared/navigation';
import {
  EXAMPLE_MAP,
  flowScript,
  mergeScripts,
  scriptedConnection,
  ServerProvider,
  sessionInfo,
  sessionScript,
  setUpScript,
} from '@/shared/server';

import { routeTree } from './routeTree.gen';

/** The map's own conversations stay on the map: no other way in shows them as a chat, and the rail knows their state. */

const update = vi.hoisted(() => ({ ready: null as string | null, restart: vi.fn(async () => {}) }));
vi.mock('@/shared/platform', async (original) => ({
  ...(await original<typeof import('@/shared/platform')>()),
  useUpdateReady: () => update.ready,
  restartToUpdate: update.restart,
}));

const app = '/Users/me/alpine-code';
const docs = '/Users/me/docs-site';
const q = (path: string) => `?project=${encodeURIComponent(path)}`;

function mount(path: string, sessions: SessionInfo[], importable: ExternalSessionInfo[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(),
      sessionScript({ sessions: sessions.map((info) => ({ info })), importable }),
      flowScript(() => EXAMPLE_MAP),
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
  return { router, connection };
}
const rail = () => screen.findByRole('navigation', { name: '주 메뉴' });
const projectRow = async (name: string) =>
  (await within(await rail()).findByRole('button', { name: new RegExp(`^${name} 열기`) })).parentElement!;
/** A project's row in the project menu, where the rail's work went on the map: opens the menu if it is closed. */
const menuRow = async (name: string) => {
  if (!screen.queryByRole('list', { name: '최근 프로젝트' }))
    fireEvent.click(await screen.findByRole('button', { name: /다른 프로젝트로/ }));
  const list = await screen.findByRole('list', { name: '최근 프로젝트' });
  return (await within(list).findByRole('button', { name: new RegExp(`^${name}(?! 메뉴)`) })).parentElement!;
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
  update.ready = null;
  update.restart.mockReset();
  update.restart.mockImplementation(async () => {});
});

describe('the rail knows the map (#25, #39, #66, #90)', () => {
  it('shows one word for a waiting map and a running build, and counts them in the filters', async () => {
    mount('/session/readme', [
      sessionInfo({ id: 'readme', cwd: docs, title: 'README 다시 쓰기' }),
      sessionInfo({ id: 'plan', cwd: app, purpose: 'map', status: 'waiting' }),
      sessionInfo({ id: 'build', cwd: '/Users/me/infra-terraform', purpose: 'build', status: 'running' }),
    ]);
    expect(within(await projectRow('alpine-code')).getByText('내 확인 필요')).toBeTruthy();
    expect(within(await projectRow('infra-terraform')).getByText('만드는 중')).toBeTruthy();
    const filters = within(await rail()).getByRole('group', { name: '대화 보기' });
    fireEvent.click(within(filters).getByRole('button', { name: '작업 중 1' }));
    expect(await within(await rail()).findByRole('button', { name: /^infra-terraform 열기/ })).toBeTruthy();
    expect(within(await rail()).queryByRole('button', { name: /^docs-site 열기/ })).toBeNull();
    // A map's answers are read on the map, so they never count as unread here.
    expect(within(filters).getByRole('button', { name: '새 결과 0' })).toBeTruthy();
  });

  it('says the same words in the project menu on the map, with the orange dot for the one that waits', async () => {
    mount('/board' + q(docs), [
      sessionInfo({ id: 'readme', cwd: docs, title: 'README 다시 쓰기' }),
      sessionInfo({ id: 'plan', cwd: app, purpose: 'map', status: 'waiting' }),
      sessionInfo({ id: 'build', cwd: '/Users/me/infra-terraform', purpose: 'build', status: 'running' }),
    ]);
    expect(
      await screen.findByRole('button', { name: 'docs-site · 다른 프로젝트로 · 다른 프로젝트가 기다려요' }),
    ).toBeTruthy();
    expect(within(await menuRow('alpine-code')).getByText('확인을 기다려요')).toBeTruthy();
    expect(within(await menuRow('infra-terraform')).getByText('만드는 중')).toBeTruthy();
    expect(within(await menuRow('docs-site')).queryByText(/확인을 기다려요|만드는 중|질문 대기/)).toBeNull();
  });

  it('has nothing to unfold for a project whose conversations are all on its map', async () => {
    mount('/settings', [sessionInfo({ id: 'plan', cwd: app, purpose: 'map' })]);
    await projectRow('alpine-code');
    expect(within(await rail()).queryByRole('button', { name: /alpine-code (펼치기|접기)/ })).toBeNull();
  });

  it('keeps a build as a record that opens on the map, beside it', async () => {
    const { router } = mount('/settings', [
      sessionInfo({ id: 'plan', cwd: app, purpose: 'map' }),
      sessionInfo({ id: 'build-1', cwd: app, purpose: 'build', title: 'Build the planned product' }),
    ]);
    const record = await within(await rail()).findByRole('link', { name: /만든 기록/ });
    fireEvent.click(record);
    await waitFor(() => expect(router.state.location.search).toEqual({ project: app, session: 'build-1' }));
    expect(router.state.location.pathname).toBe('/board');
  });

  it('will not archive or delete a project while its build runs', async () => {
    mount('/board' + q(app), [sessionInfo({ id: 'build', cwd: app, purpose: 'build', status: 'running' })]);
    fireEvent.click(within(await menuRow('alpine-code')).getByRole('button', { name: 'alpine-code 메뉴' }));
    const archive = await screen.findByRole('menuitem', { name: '보관' });
    const remove = screen.getByRole('menuitem', { name: '삭제…' });
    expect(archive.getAttribute('aria-disabled')).toBe('true');
    expect(remove.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('deleting (#22, #43, #68, #62, #56)', () => {
  it('says what really goes, and leaves the deleted project for another map', async () => {
    const { router } = mount('/board' + q(app), [sessionInfo({ id: 'readme', cwd: docs })]);
    fireEvent.click(within(await menuRow('alpine-code')).getByRole('button', { name: 'alpine-code 메뉴' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '삭제…' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/나만 보는 기억/)).toBeTruthy();
    expect(within(dialog).getByText(/같은 폴더를 다시 열면 대화가 다시 보여요/)).toBeTruthy();
    expect(within(dialog).queryByText(/세션/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: /^삭제/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
    await waitFor(() => expect(router.state.location.search.project).not.toBe(app));
  });

  it("goes to the project's map after deleting the open conversation, not to 새 프로젝트", async () => {
    const { router } = mount('/session/cart', [sessionInfo({ id: 'cart', cwd: app, title: '장바구니 고치기' })]);
    fireEvent.click(await screen.findByRole('button', { name: '장바구니 고치기 메뉴' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '삭제…' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^삭제/ }));
    await waitFor(() => expect(router.state.location.href).toBe('/board' + q(app)));
  });
});

describe("a map's conversations open on the map (#24, #41, #64)", () => {
  it('opens a map conversation reached by its old address on its map', async () => {
    const { router } = mount('/session/plan', [sessionInfo({ id: 'plan', cwd: app, purpose: 'map' })]);
    await waitFor(() => expect(router.state.location.href).toBe('/board' + q(app)));
  });

  it('opens a build beside its map', async () => {
    const { router } = mount('/session/build-1', [sessionInfo({ id: 'build-1', cwd: app, purpose: 'build' })]);
    await waitFor(() => expect(router.state.location.search).toEqual({ project: app, session: 'build-1' }));
    expect(router.state.location.pathname).toBe('/board');
  });

  it('names the project, not a chat, for a map at work on the agents screen', async () => {
    mount('/agents', [sessionInfo({ id: 'build-1', cwd: app, purpose: 'build', status: 'running', title: 'Build' })]);
    const working = await screen.findByText('지금 일하는 중');
    const link = within(working.parentElement!).getByRole('link', { name: 'alpine-code' });
    expect(link.getAttribute('href')).toBe('/board' + q(app) + '&session=build-1');
  });

  it("opens the project's own map from a conversation's 제품 지도", async () => {
    mount('/session/cart', [sessionInfo({ id: 'cart', cwd: app, title: '장바구니 고치기' })]);
    const link = await screen.findByRole('link', { name: '제품 지도' });
    expect(link.getAttribute('href')).toBe('/board' + q(app));
  });
});

describe('going back after opening a project (#19)', () => {
  it('goes back to the map before it instead of bouncing to the opened one', async () => {
    const { router } = mount('/board' + q(docs), []);
    await screen.findByRole('main', { name: '제품 지도' });
    void router.navigate({ to: '/', search: { project: app } });
    await waitFor(() => expect(router.state.location.href).toBe('/board' + q(app)));
    router.history.back();
    await waitFor(() => expect(router.state.location.href).toBe('/board' + q(docs)));
  });
});

describe('the agents screen (#28)', () => {
  it('says the button starts a new project, which is where it goes', async () => {
    mount('/agents', []);
    const start = await screen.findByRole('link', { name: '이 에이전트로 새 프로젝트' });
    expect(start.getAttribute('href')).toMatch(/^\/\?agent=/);
  });
});

describe("another app's conversations on the map (#42, #71)", () => {
  it('promises reading, and closes the list once one is picked', async () => {
    mount(
      '/board' + q(app),
      [sessionInfo({ id: 'plan', cwd: app, purpose: 'map' })],
      [
        {
          source: 'claude_code',
          id: 'cc-1',
          title: '로그인 고치기',
          updatedAt: new Date().toISOString(),
          imported: null,
        },
      ],
    );
    fireEvent.click(await screen.findByRole('button', { name: /Claude Code에서 하던 대화 1개 가져와서 보기/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /로그인 고치기/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Beside the map it only reads, so the note says where it came from and promises nothing more.
    expect(await screen.findByText('여기까지 Claude Code에서 하던 대화예요')).toBeTruthy();
    expect(screen.queryByText(/이어서 말하면/)).toBeNull();
  });
});

describe('Ctrl+Tab and search with a map (#24, #41)', () => {
  const sessions = [
    sessionInfo({ id: 'plan', cwd: app, purpose: 'map', createdAt: '2026-10-01T00:00:00Z' }),
    sessionInfo({ id: 'cart', cwd: app, title: '장바구니 고치기', createdAt: '2026-10-02T00:00:00Z' }),
    sessionInfo({ id: 'readme', cwd: docs, title: 'README 다시 쓰기', createdAt: '2026-10-03T00:00:00Z' }),
    sessionInfo({ id: 'build-1', cwd: app, purpose: 'build', createdAt: '2026-10-04T00:00:00Z' }),
  ];
  const ctrlTab = () => fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });

  it("goes round the conversations of their own, past the map's, from the map too", async () => {
    const { router } = mount('/board' + q(app), sessions);
    await screen.findByRole('main', { name: '제품 지도' });
    ctrlTab();
    await waitFor(() => expect(router.state.location.pathname).toBe('/session/cart'));
    ctrlTab();
    await waitFor(() => expect(router.state.location.pathname).toBe('/session/readme'));
    ctrlTab();
    await waitFor(() => expect(router.state.location.pathname).toBe('/session/cart'));
  });

  it("names the map's conversations as the rail does, and opens the one picked on the map", async () => {
    const { router } = mount('/board' + q(docs), sessions);
    await screen.findByRole('main', { name: '제품 지도' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const list = await screen.findByRole('listbox', { name: '프로젝트와 대화 찾기' });
    expect(within(list).getByRole('option', { name: /^지도 대화/ })).toBeTruthy();
    fireEvent.click(within(list).getByRole('option', { name: /^만든 기록/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ project: app, session: 'build-1' }));
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.click(
      within(await screen.findByRole('listbox', { name: '프로젝트와 대화 찾기' })).getByRole('option', {
        name: /^지도 대화/,
      }),
    );
    // The conversation picked shows, even when the map's input goes elsewhere right then.
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ project: app, session: expect.any(String) }),
    );
  });
});

describe('a map whose project is gone (#62, #56)', () => {
  it('says why and opens the folder again', async () => {
    const gone = '/Users/me/old-shop';
    mount('/board' + q(gone), []);
    expect(await screen.findByText('old-shop 프로젝트가 목록에 없어요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다시 열기' }));
    expect(await screen.findByRole('button', { name: 'old-shop · 다른 프로젝트로' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('old-shop 프로젝트가 목록에 없어요')).toBeNull());
  });

  it('offers to restore an archived one, or to start something new', async () => {
    const { router } = mount('/board' + q(docs), []);
    fireEvent.click(within(await menuRow('docs-site')).getByRole('button', { name: 'docs-site 메뉴' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '보관' }));
    // Archiving the open project moves on; an old link leads back to it.
    await waitFor(() => expect(router.state.location.search.project).not.toBe(docs));
    void router.navigate({ to: '/board', search: { project: docs } });
    expect(await screen.findByText('docs-site 프로젝트는 보관했어요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '복원' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '새 프로젝트' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('restarting to update (#18)', () => {
  it('asks first while the AI works, and waits when I say later', async () => {
    update.ready = '0.2.0';
    mount('/board' + q(app), [sessionInfo({ id: 'build', cwd: app, purpose: 'build', status: 'running' })]);
    await within(await menuRow('alpine-code')).findByText('만드는 중');
    fireEvent.keyDown(screen.getByRole('list', { name: '최근 프로젝트' }), { key: 'Escape' });
    fireEvent.click(await screen.findByRole('button', { name: '다시 시작해서 업데이트' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/하던 작업이 멈춰요/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '나중에' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(update.restart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '다시 시작해서 업데이트' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '멈추고 다시 시작' }));
    expect(update.restart).toHaveBeenCalledOnce();
  });

  it('restarts at once when nothing works, and says so when it could not', async () => {
    update.ready = '0.2.0';
    update.restart.mockImplementation(async () => {
      throw new Error('install failed');
    });
    mount('/board' + q(app), []);
    await screen.findByRole('main', { name: '제품 지도' });
    fireEvent.click(await screen.findByRole('button', { name: '다시 시작해서 업데이트' }));
    expect(update.restart).toHaveBeenCalledOnce();
    expect((await screen.findByRole('alert')).textContent).toMatch(/업데이트하지 못했어요/);
  });
});
