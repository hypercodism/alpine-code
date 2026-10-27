import type { SessionInfo } from '@alpine/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConnectPrompt } from '@/shared/components/connect';
import { LocaleProvider } from '@/shared/i18n';
import { useNavigation } from '@/shared/navigation';
import { useUpdateCheck } from '@/shared/platform';
import {
  EXAMPLE_MAP,
  firstRunScript,
  flowScript,
  mergeScripts,
  scriptedConnection,
  ServerError,
  ServerProvider,
  sessionInfo,
  sessionScript,
  setUpScript,
  type Item,
  type Notification,
  type Script,
} from '@/shared/server';

import { routeTree } from './routeTree.gen';

/** Model connection, failures and notices (bundle E): every one of them says what happened and leads somewhere. */

const platform = vi.hoisted(() => ({
  notify: vi.fn(async () => {}),
  dropped: null as ((paths: string[]) => void) | null,
  restartApp: vi.fn(async () => {}),
}));
vi.mock('@/shared/platform', async (original) => ({
  ...(await original<typeof import('@/shared/platform')>()),
  notify: platform.notify,
  restartApp: platform.restartApp,
  onPathsDropped: (listener: (paths: string[]) => void) => {
    platform.dropped = listener;
    return () => {};
  },
}));

const app = '/Users/me/alpine-code';
const docs = '/Users/me/docs-site';
const q = (path: string) => `?project=${encodeURIComponent(path)}`;

/** Nothing connected: as after deleting the last connection, or before the first. */
const nothingConnected: Script = { results: { 'connections/list': firstRunScript().results!['connections/list'] } };

function mount(path: string, script: Script, sessions: { info: SessionInfo; items?: Item[] }[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(),
      sessionScript({ sessions }),
      flowScript(() => EXAMPLE_MAP),
      script,
    ),
  );
  // The server speaks without being asked: events pushed here reach the app as the server's would.
  const listeners = new Set<(notification: Notification) => void>();
  const subscribe = connection.subscribe;
  connection.subscribe = (listener) => {
    listeners.add(listener);
    const stop = subscribe(listener);
    return () => {
      listeners.delete(listener);
      stop();
    };
  };
  const push = (notification: Notification) => act(() => listeners.forEach((listener) => listener(notification)));
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
  return { router, connection, push };
}

const rail = () => screen.findByRole('navigation', { name: '주 메뉴' });
const projectRow = async (name: string) =>
  (await within(await rail()).findByRole('button', { name: new RegExp(`^${name} 열기`) })).parentElement!;
/** A project's row in the project menu (the map has no rail): opens the menu if it is closed. */
const menuRow = async (name: string) => {
  if (!screen.queryByRole('list', { name: '최근 프로젝트' }))
    fireEvent.click(await screen.findByRole('button', { name: /다른 프로젝트로/ }));
  const list = await screen.findByRole('list', { name: '최근 프로젝트' });
  return (await within(list).findByRole('button', { name: new RegExp(`^${name}(?! 메뉴)`) })).parentElement!;
};

beforeEach(() => {
  localStorage.clear();
  useConnectPrompt.setState({ dismissed: false, asked: false });
  useUpdateCheck.setState({ phase: null });
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
  vi.restoreAllMocks();
  platform.notify.mockClear();
  platform.restartApp.mockClear();
  platform.dropped = null;
});

describe('nothing connected (#14, #26, #15)', () => {
  it('opens the connect sheet from a conversation when I send', async () => {
    mount('/session/old', nothingConnected, [
      { info: sessionInfo({ id: 'old', cwd: app, title: '예전 대화' }), items: [] },
    ]);
    const input = await screen.findByPlaceholderText('무엇을 할까요?');
    fireEvent.change(input, { target: { value: '이어서 해 줘' } });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByText('AI를 어떻게 쓸까요?')).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toBe('이어서 해 줘');
  });

  it('opens it from the agents screen’s 모델 연결 chip', async () => {
    mount('/agents', nothingConnected);
    fireEvent.click((await screen.findAllByRole('button', { name: '모델 연결' }))[0]!);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('opens it from the map input, and the words stay', async () => {
    const created = vi.fn();
    mount('/board' + q(docs), {
      results: {
        ...nothingConnected.results,
        'session/new': () => {
          created();
          throw new ServerError(-32000, 'No model is set.', { reason: 'invalid_config' });
        },
      },
    });
    const input = await screen.findByRole('textbox', { name: '보드에 부탁하기' });
    fireEvent.change(input, { target: { value: '결제 흐름을 더해 줘' } });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(created).not.toHaveBeenCalled();
    expect((input as HTMLTextAreaElement).value).toBe('결제 흐름을 더해 줘');
  });

  it('says in plain words when map work fails for the model, leads to the connection, and the line closes', async () => {
    const { router } = mount('/board' + q(docs), {
      results: {
        'session/new': () => {
          throw new ServerError(-32000, 'No model is set.\nConnect a model in ~/.alpine-code/config.toml', {
            reason: 'invalid_config',
          });
        },
      },
    });
    const input = await screen.findByRole('textbox', { name: '보드에 부탁하기' });
    fireEvent.change(input, { target: { value: '결제 흐름을 더해 줘' } });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    const line = await screen.findByText('AI가 일할 모델이 준비되지 않았어요. 모델 연결을 확인해 주세요.');
    const banner = line.closest('[role="alert"]') as HTMLElement;
    expect(
      within(banner)
        .queryByText(/config\.toml/)
        ?.closest('details'),
    ).toBeTruthy();
    fireEvent.click(within(banner).getByRole('button', { name: '닫기' }));
    expect(screen.queryByText('AI가 일할 모델이 준비되지 않았어요. 모델 연결을 확인해 주세요.')).toBeNull();
    fireEvent.change(input, { target: { value: '결제 흐름을 더해 줘' } });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    const again = (await screen.findByText(/모델이 준비되지 않았어요/)).closest('[role="alert"]') as HTMLElement;
    fireEvent.click(within(again).getByRole('button', { name: '모델 연결 열기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
    expect(router.state.location.search).toEqual({ tab: 'connection' });
  });
});

describe('the map follows the default safety (#16)', () => {
  it('shows the default from Settings before the map has a conversation', async () => {
    mount('/board' + q(docs), { results: { 'settings/get': { mode: 'auto', reviewModel: null, cloneFolder: '/x' } } });
    expect(await screen.findByRole('button', { name: '안전: 알아서 하기' })).toBeTruthy();
  });
});

describe('the app engine stops (#21)', () => {
  it('fails what waited, says so across the window, and restarts', async () => {
    const { connection } = mount('/settings?tab=connection', {
      results: { 'connections/list': () => new Promise<never>(() => {}) },
    });
    expect(await screen.findByText('연결 정보를 불러오는 중…')).toBeTruthy();
    act(() => connection.exit());
    // What waited for the server has failed, rather than waiting for ever.
    expect(await screen.findByText('연결 정보를 불러오지 못했어요.')).toBeTruthy();
    const banner = (await screen.findByText('앱 엔진이 멈췄어요.')).closest('[role="alert"]') as HTMLElement;
    fireEvent.click(within(banner).getByRole('button', { name: '다시 시작' }));
    expect(platform.restartApp).toHaveBeenCalledOnce();
  });
});

describe('Settings › 모델 연결 while it cannot be read (#51)', () => {
  it('says so and asks again', async () => {
    let fails = true;
    const list = setUpScript().results!['connections/list'] as () => unknown;
    mount('/settings?tab=connection', {
      results: {
        'connections/list': () => {
          if (fails) throw new ServerError(-32000, 'boom');
          return list() as never;
        },
      },
    });
    expect(await screen.findByText('연결 정보를 불러오지 못했어요.')).toBeTruthy();
    fails = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('button', { name: '연결 추가' })).toBeTruthy();
  });
});

describe('a conversation that stopped (#83, #86)', () => {
  const failed: Item[] = [
    { id: 'u1', kind: 'user_message', text: '테스트를 고쳐 줘' },
    { id: 'r1', kind: 'run_stopped', reason: 'failed', message: 'APIConnectionError: Connection error.' },
  ];

  it('asks again with what I last sent, and folds the technical words', async () => {
    const sent = vi.fn();
    mount(
      '/session/old',
      {
        results: {
          'session/send': ({ text }) => {
            sent(text);
            return {};
          },
        },
      },
      [{ info: sessionInfo({ id: 'old', cwd: app, title: '예전 대화' }), items: failed }],
    );
    expect(await screen.findByText('작업이 실패했어요')).toBeTruthy();
    expect(screen.getByText('APIConnectionError: Connection error.').closest('details')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(sent).toHaveBeenCalledWith('테스트를 고쳐 줘'));
  });

  it('opens the connect sheet instead of asking again when nothing is connected', async () => {
    const sent = vi.fn();
    mount(
      '/session/old',
      {
        results: {
          ...nothingConnected.results,
          'session/send': ({ text }) => {
            sent(text);
            return {};
          },
        },
      },
      [{ info: sessionInfo({ id: 'old', cwd: app, title: '예전 대화' }), items: failed }],
    );
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(within(await screen.findByRole('dialog')).getByText('AI를 어떻게 쓸까요?')).toBeTruthy();
    expect(sent).not.toHaveBeenCalled();
  });

  it('leads to the model connection when the model sign-in ended', async () => {
    const { router } = mount('/session/old', {}, [
      {
        info: sessionInfo({ id: 'old', cwd: app, title: '예전 대화' }),
        items: [failed[0]!, { id: 'r1', kind: 'run_stopped', reason: 'signed_out', message: 'expired' }],
      },
    ]);
    fireEvent.click(await screen.findByRole('link', { name: '모델 연결 열기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
  });

  it('says it is loading, and offers to ask again when the agents cannot be read', async () => {
    let fails = true;
    const list = setUpScript().results!['agents/list'] as () => unknown;
    mount('/agents', {
      results: {
        'agents/list': () => {
          if (fails) throw new ServerError(-32000, 'boom');
          return list() as never;
        },
      },
    });
    expect(await screen.findByText('에이전트를 불러오지 못했어요')).toBeTruthy();
    fails = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.queryByText('에이전트를 불러오지 못했어요')).toBeNull());
  });
});

describe('a question the AI asked on a map (#63, #73, #8, #25, #39)', () => {
  const asked = (seq: number): Notification => ({
    method: 'session/event',
    params: {
      sessionId: 'map-1',
      seq,
      event: {
        type: 'item_completed',
        item: {
          id: 'ask',
          kind: 'tool_call',
          name: 'ask_user',
          args: { question: '누가 쓰나요?', options: [{ label: '혼자' }] },
          status: 'done',
          result: null,
          images: 0,
          commandResult: null,
          fileChanges: null,
        },
      },
    },
  });
  const status = (seq: number, value: SessionInfo['status']): Notification => ({
    method: 'session/event',
    params: {
      sessionId: 'map-1',
      seq,
      event: { type: 'info_changed', info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', status: value }) },
    },
  });

  it('tells me it has a question, the project menu marks it, and coming back opens that map', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { router, push } = mount('/board' + q(docs), {}, [
      { info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', status: 'running' }) },
    ]);
    await menuRow('alpine-code');
    push(asked(50));
    push(status(51, 'idle'));
    await waitFor(() =>
      expect(platform.notify).toHaveBeenCalledWith(
        'alpine-code',
        'AI가 물어볼 게 있어요. 열어서 답해 주면 이어서 해요.',
      ),
    );
    expect(await within(await menuRow('alpine-code')).findByText('질문 대기')).toBeTruthy();
    // The name in the top bar has the orange dot: another project waits for me.
    expect(screen.getByRole('button', { name: 'docs-site · 다른 프로젝트로 · 다른 프로젝트가 기다려요' })).toBeTruthy();
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(router.state.location.search).toEqual({ project: app }));
  });

  it('tells me when the map waits for my yes while I look at another project', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { push } = mount('/board' + q(docs), {}, [
      { info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', status: 'running' }) },
    ]);
    await menuRow('alpine-code');
    push(status(50, 'waiting'));
    await waitFor(() =>
      expect(platform.notify).toHaveBeenCalledWith('alpine-code', 'AI가 허락을 기다려요. 열어서 확인해 주세요.'),
    );
  });

  it('leaves me where I am when the window comes forward after a notice I got while working in it', async () => {
    const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { router, push } = mount('/session/old', {}, [
      { info: sessionInfo({ id: 'old', cwd: docs, title: '예전 대화' }) },
      { info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', status: 'running' }) },
    ]);
    await projectRow('alpine-code');
    push(status(50, 'waiting'));
    await waitFor(() => expect(platform.notify).toHaveBeenCalled());
    // A Finder dialog, or another app, takes the window's focus for a while and gives it back.
    focused.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('blur')));
    focused.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('focus')));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.state.location.pathname).toBe('/session/old');
  });

  it('does not move me to a map whose work only ended while I was away', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { router, push } = mount('/session/old', {}, [
      { info: sessionInfo({ id: 'old', cwd: docs, title: '예전 대화' }) },
      { info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', status: 'running' }) },
    ]);
    await projectRow('alpine-code');
    push(status(50, 'idle'));
    await waitFor(() => expect(platform.notify).toHaveBeenCalled());
    act(() => void window.dispatchEvent(new Event('focus')));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.state.location.pathname).toBe('/session/old');
  });

  it('says nothing about the map I am looking at while the window is in front', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const { push } = mount('/board' + q(app), {}, [
      { info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', status: 'running' }) },
    ]);
    await menuRow('alpine-code');
    push(status(50, 'waiting'));
    push(asked(51));
    push(status(52, 'idle'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(platform.notify).not.toHaveBeenCalled();
  });
});

describe('dropping something on the window (#85)', () => {
  it('says a file is not taken, and what can be dropped', async () => {
    platform.dropped = () => {};
    mount('/board' + q(docs), {});
    await waitFor(() => expect(platform.dropped).not.toBeNull());
    await act(async () => platform.dropped!(['/Users/me/Desktop/photo.png']));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('이 파일은 받을 수 없어요')).toBeTruthy();
    expect(within(dialog).getByText(/photo\.png: 파일을 대화에 붙이는 건 아직 안 돼요/)).toBeTruthy();
  });

  it('does not call a folder a file when it could not be opened for another reason', async () => {
    platform.dropped = () => {};
    mount('/board' + q(docs), {
      results: {
        'skills/add': () => {
          throw new ServerError(-32000, 'not found', { reason: 'not_found' });
        },
        'projects/open': () => {
          throw new ServerError(-32000, 'boom');
        },
      },
    });
    await waitFor(() => expect(platform.dropped).not.toBeNull());
    await act(async () => platform.dropped!(['/Users/me/shop']));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('폴더를 열지 못했어요')).toBeTruthy();
    expect(within(dialog).queryByText('이 파일은 받을 수 없어요')).toBeNull();
  });
});

describe('a project whose folder moved', () => {
  it('says so in plain words and offers to pick the folder where it is now', async () => {
    const gone = '/Users/me/.Trash/old-shop';
    mount('/board' + q(gone), {});
    fireEvent.click(await screen.findByRole('button', { name: '다시 열기' }));
    expect(await screen.findByText(/원래 있던 자리에 폴더가 없어요/)).toBeTruthy();
    expect(screen.queryByText(/Not a folder/)).toBeNull();
    expect(screen.getByRole('button', { name: '폴더 고르기' })).toBeTruthy();
  });
});

describe('archiving the open conversation', () => {
  it('goes to the project map, not to a build record', async () => {
    const { router } = mount('/session/old', {}, [
      { info: sessionInfo({ id: 'build-1', cwd: app, purpose: 'build', title: '만들기' }) },
      { info: sessionInfo({ id: 'old', cwd: app, title: '예전 대화' }) },
    ]);
    const row = (await within(await rail()).findByRole('link', { name: /예전 대화/ })).parentElement!;
    fireEvent.click(within(row).getByRole('button', { name: /메뉴/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '보관' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
    expect(router.state.location.search).toEqual({ project: app });
  });
});

describe('checking for updates by hand (#50)', () => {
  it('says at once that it checks, then that it downloads', async () => {
    mount('/settings', {});
    await screen.findByRole('button', { name: '뒤로' });
    act(() => useUpdateCheck.setState({ phase: 'checking' }));
    expect(screen.getByText('업데이트 확인하는 중…')).toBeTruthy();
    act(() => useUpdateCheck.setState({ phase: 'downloading' }));
    expect(screen.getByText('새 버전 내려받는 중…')).toBeTruthy();
  });
});
