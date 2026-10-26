import type { DevServerInfo, FlowGetResult, FlowNode } from '@alpine/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';
import { mergeScripts, scriptedConnection, ServerProvider, sessionInfo, sessionScript } from '@/shared/server';

import { ASK_AGAIN_MS, BLANK_AFTER_MS, missingButtons, plannedLinks, situationResult, useLiveLayouts, type LiveLayout } from './liveScreens';
import { ProductMap } from './ProductMap';
import { boardScript } from './testBoard';
import { toTreeMap } from './flowTreeData';

/**
 * The map shows the running app's own screens (planned ones are real code on made-up data): each frame opens the card's
 * address through the relay, the bridge in the page reports its buttons and promises, and the map checks its arrows
 * against those buttons, shows every situation of a screen, and pins promises to the elements that keep them.
 */

const cwd = '/project';
const RELAY = 'http://127.0.0.1:6100';

const node = (id: string, title: string, path: string, more: Partial<FlowNode> = {}): FlowNode => ({
  id,
  title,
  kind: 'screen',
  phase: 'planned',
  path,
  conditions: [{ id: `${id}-p`, expectation: `${title}이 열린다` }],
  ...more,
});

const NODES = [
  node('menu', '빵 고르기', '/order', {
    states: [{ id: 'empty', title: '빵이 없을 때' }],
    conditions: [
      { id: 'menu-p', expectation: '오늘 구운 빵만 보인다' },
      { id: 'menu-empty', expectation: '빵이 없으면 사장님이 올리면 보인다고 알려 준다', state: 'empty' },
    ],
  }),
  node('time', '찾으러 올 시간', '/order/time'),
  node('contact', '연락처 남기기', '/order/contact'),
];

const board: FlowGetResult = {
  revision: 'r1',
  etag: 'e1',
  exists: true,
  document: {
    nodes: NODES,
    flows: [
      {
        id: 'order',
        title: '빵 미리 예약하기',
        actor: '손님',
        device: 'phone',
        nodeIds: NODES.map((one) => one.id),
      },
    ],
    edges: [],
  },
};

const running: DevServerInfo = {
  id: 's1',
  cwd,
  command: 'npm run dev',
  port: 5173,
  url: 'http://localhost:5173',
  boardUrl: RELAY,
  status: 'running',
  external: false,
};

function mount(
  app: DevServerInfo | null | (() => DevServerInfo | null) = running,
  packageJson = '{ "name": "bakery" }',
  shown = board,
) {
  const current = () => (typeof app === 'function' ? app() : app);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      boardScript(shown),
      sessionScript({
        sessions: [{ info: sessionInfo({ id: 'map-1', cwd, purpose: 'map', title: '지도' }), items: [] }],
      }),
      {
        results: {
          'devServers/open': () => ({ server: current() }),
          'devServers/restart': () => ({ server: current() }),
          'devServers/list': () => {
            const now = current();
            return { servers: now ? [now] : [] };
          },
          'files/read': ({ path }) => ({
            path: `${cwd}/${path}`,
            relativePath: path,
            content: packageJson,
            startLine: 1,
            totalLines: 1,
            line: 1,
            truncated: false,
          }),
        },
      },
    ),
  );
  const request = vi.spyOn(connection, 'request');
  render(
    <QueryClientProvider client={client}>
      <ServerProvider connection={connection}>
        <LocaleProvider locale="ko">
          <div style={{ height: 900 }}>
            <ProductMap cwd={cwd} onSession={vi.fn()} onPublish={vi.fn()} onOpenInApp={vi.fn()} />
          </div>
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
  return { request };
}

const layout = (
  targets: LiveLayout['targets'],
  promises: LiveLayout['promises'] = [],
  screen: string | null = 'marked',
): LiveLayout => ({
  screen,
  targets,
  promises,
  href: '',
  at: Date.now(),
});

/** What the bridge in a frame says, as the page would post it. */
function report(frame: HTMLIFrameElement, data: LiveLayout) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'alpine:layout', ...data }, source: frame.contentWindow }),
    );
  });
}

const frameOf = async (title: string, inside: HTMLElement = document.body) =>
  (await within(inside).findAllByTitle(title)).find((element) => element.tagName === 'IFRAME') as HTMLIFrameElement;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  useLiveLayouts.setState({ byKey: {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('the links the map plans', () => {
  it('go screen to screen, and a seen screen without the button is said', () => {
    const map = toTreeMap(board, new Set(), 'bakery', {
      unnamed: { ko: '', en: '' },
      unnamedRole: { ko: '', en: '' },
    });
    expect([...(plannedLinks(map).get('menu') ?? [])]).toEqual(['time']);
    expect(missingButtons(map, 'time', undefined)).toEqual([]); // not seen yet: nothing is claimed
    expect(missingButtons(map, 'time', layout([]))).toEqual(['contact']);
    // A page still loading, or an app without the marks, is never accused of a missing button.
    expect(missingButtons(map, 'time', layout([], [], null))).toEqual([]);
    expect(missingButtons(map, 'menu', layout([{ to: 'time', label: '다음', x: 0, y: 0, w: 1, h: 1 }]))).toEqual([]);
  });
});

describe('the live map', () => {
  it('opens each screen of the running app through the relay', async () => {
    const { request } = mount();
    const menu = await frameOf('빵 고르기');
    expect(menu.getAttribute('src')).toBe(`${RELAY}/order`);
    expect(request.mock.calls.some(([method]) => method === 'devServers/open')).toBe(true);
  });

  it('draws the arrow from the real button, and says when the plan has a way the screen has no button for', async () => {
    mount();
    report(
      await frameOf('빵 고르기'),
      layout([{ to: 'time', label: '3개 골랐어요 · 다음', x: 20, y: 700, w: 350, h: 56 }]),
    );
    expect(await screen.findByRole('img', { name: '3개 골랐어요 · 다음' })).toBeTruthy();
    report(await frameOf('찾으러 올 시간'), layout([]));
    expect(await screen.findByRole('img', { name: '연락처 남기기로 가는 버튼이 없어요' })).toBeTruthy();
    expect(screen.getAllByText('연락처 남기기로 가는 버튼이 없어요').length).toBeGreaterThan(0);
  });

  it('shows every situation of a screen as the real screen, with its promises pinned where they are kept', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '빵이 없을 때' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '빵이 없을 때', pressed: true })).toBeTruthy();
    const empty = await frameOf('빵 고르기', dialog);
    expect(empty.getAttribute('src')).toBe(`${RELAY}/order?alpine-state=empty`);
    // The situation's promise reads with its situation, once, in the card's promises.
    expect(within(dialog).getByText('빵이 없으면 사장님이 올리면 보인다고 알려 준다')).toBeTruthy();
    expect(within(dialog).getAllByText('빵이 없을 때').length).toBe(2); // the situation's button, and above its promise
    report(empty, layout([], [{ id: 'menu-empty', x: 20, y: 300, w: 350, h: 40 }]));
    await waitFor(() =>
      expect(within(dialog).getByTitle('빵이 없으면 사장님이 올리면 보인다고 알려 준다')).toBeTruthy(),
    );
    expect(within(dialog).getByText('약속 1개를 화면 위에 표시했어요')).toBeTruthy();
    // The usual day has its own promise; one the screen has no place for says so.
    fireEvent.click(within(dialog).getByRole('button', { name: '보통 때' }));
    report(await frameOf('빵 고르기', dialog), layout([]));
    expect(await within(dialog).findByText('화면에서 자리를 못 찾았어요')).toBeTruthy();
  });

  it('goes to the screen a button leads to, from a screen in its details', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '빵 고르기 열기' }));
    const dialog = await screen.findByRole('dialog');
    const menu = await frameOf('빵 고르기', dialog);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'alpine:go', to: 'time' }, source: menu.contentWindow }),
      );
    });
    expect(await frameOf('찾으러 올 시간', await screen.findByRole('dialog'))).toBeTruthy();
  });

  it('asks for the app again while none runs, so one that can start later shows without reopening the map', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // Nothing to run yet when the map opens (the project is still being set up); the second ask starts it.
      let opens = () => 0;
      const { request } = mount(() => (opens() >= 2 ? running : null));
      opens = () => request.mock.calls.filter(([method]) => method === 'devServers/open').length;
      await screen.findAllByText('빵 고르기');
      expect(document.querySelector('iframe[src^="http://127.0.0.1"]')).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(ASK_AGAIN_MS + 100);
      });
      await waitFor(() => expect(opens()).toBe(2));
      expect((await frameOf('빵 고르기')).getAttribute('src')).toBe(`${RELAY}/order`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says when the app stays blank, and restarts it fresh', async () => {
    const { request } = mount();
    const menu = await frameOf('빵 고르기');
    // The page loaded (the bridge spoke) but nothing drew: no marks, no words, for longer than a page takes.
    report(menu, { ...layout([], [], null), fingerprint: '0:0', at: Date.now() - BLANK_AFTER_MS - 1000 });
    expect(await screen.findByText('앱 화면이 하얗게 비어 있어요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '앱 다시 띄우기' }));
    await waitFor(() => expect(request.mock.calls.some(([method]) => method === 'devServers/restart')).toBe(true));
    expect(screen.queryByText('앱 화면이 하얗게 비어 있어요')).toBeNull();
  });

  it('keeps pictures and starts nothing for a phone app, or while the app is not running', async () => {
    const { request } = mount(running, '{ "dependencies": { "expo": "~54.0.0" } }');
    await screen.findAllByText('빵 고르기');
    expect(document.querySelector('iframe[src^="http://127.0.0.1"]')).toBeNull();
    expect(request.mock.calls.some(([method]) => method === 'devServers/open')).toBe(false);
  });
});

/** The bakery with situations of every kind: one that shows, a proposal the code does not handle, one of the journey. */
const situated: FlowGetResult = {
  ...board,
  document: {
    ...board.document!,
    nodes: [
      node('menu', '빵 고르기', '/order', {
        states: [
          { id: 'empty', title: '빵이 없을 때' },
          { id: 'offline', title: '연결이 끊겼을 때', why: '지금은 빈 화면만 보여요', handled: false },
        ],
      }),
      node('time', '찾으러 올 시간', '/order/time'),
      node('contact', '연락처 남기기', '/order/contact', { states: [{ id: 'taken', title: '먼저 예약됐을 때' }] }),
    ],
    flows: [
      {
        ...board.document!.flows![0]!,
        situations: [{ id: 'taken', title: '마지막 빵을 다른 사람이 먼저 예약했을 때', screen: 'contact' }],
      },
    ],
  },
};

const marked = (screen: string, fingerprint: string): LiveLayout => ({ ...layout([], [], screen), fingerprint });

describe('a situation, as Alpine finds it', () => {
  it('shows when its screen has words of its own, and is not made when it looks like the usual day', () => {
    const layouts = {
      'menu|': marked('menu', 'a'),
      'menu|empty': marked('menu', 'b'),
      'menu|offline': marked('menu', 'a'),
      'menu|other': marked('time', 'c'),
    };
    expect(situationResult(layouts, 'menu', 'empty')).toBe('shows');
    expect(situationResult(layouts, 'menu', 'offline')).toBe('same');
    expect(situationResult(layouts, 'menu', 'other')).toBe('elsewhere');
    expect(situationResult(layouts, 'menu', 'later')).toBe('unseen');
    // An app without the marks cannot be told.
    expect(situationResult({ 'menu|': marked('', 'a'), 'menu|empty': marked('', 'b') }, 'menu', 'empty')).toBe(
      'unseen',
    );
  });
});

describe('situations on the live map', () => {
  it('opens every situation out of sight, one at a time, to see that it shows', async () => {
    mount(running, '{ "name": "bakery" }', situated);
    const checker = () => document.querySelector<HTMLIFrameElement>('iframe[aria-hidden="true"]');
    await waitFor(() => expect(checker()?.getAttribute('src')).toBe(`${RELAY}/order`));
    report(checker()!, marked('menu', 'usual'));
    await waitFor(() => expect(checker()?.getAttribute('src')).toBe(`${RELAY}/order?alpine-state=empty`));
    report(checker()!, marked('menu', 'usual'));
    // The proposal is not in the code: nothing to open for it. The journey's situation is on 연락처 남기기.
    await waitFor(() => expect(checker()?.getAttribute('src')).toBe(`${RELAY}/order/contact`));
    // Looking the same as the usual day: not made yet, and the journey says how many really show.
    expect(await screen.findByTitle('보통 때와 같아요')).toBeTruthy();
    expect(screen.getByText(/상황 2개 중 0개가 실제 화면으로 떠요/)).toBeTruthy();
  });

  it('asks the AI to fix a situation that looks the same as the usual day', async () => {
    const { request } = mount(running, '{ "name": "bakery" }', situated);
    act(() => {
      useLiveLayouts.getState().report('menu|', marked('menu', 'usual'));
      useLiveLayouts.getState().report('menu|empty', marked('menu', 'usual'));
    });
    fireEvent.click(await screen.findByRole('button', { name: /빵이 없을 때/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('보통 때와 똑같이 보여요. 이 상황이 아직 화면에 없어요.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '고쳐 달라고 하기' }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([method, params]) =>
            method === 'flow/prepare' &&
            (params as { request?: string }).request?.includes('"빵이 없을 때" 상황이 보통 때와 똑같이 보여요'),
        ),
      ).toBe(true),
    );
  });

  it('offers a situation the code does not handle yet as a proposal to make or drop', async () => {
    const { request } = mount(running, '{ "name": "bakery" }', situated);
    fireEvent.click(await screen.findByRole('button', { name: /연결이 끊겼을 때/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('지금은 빈 화면만 보여요')).toBeTruthy();
    expect(within(dialog).getByText('아직 만들지 않은 상황이라 보여 줄 화면이 없어요')).toBeTruthy();
    expect(within(dialog).queryByTitle('빵 고르기')).toBeNull(); // no frame opened for it
    fireEvent.click(within(dialog).getByRole('button', { name: '필요 없어요' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'flow/edit',
        expect.objectContaining({ nodeId: 'menu', field: 'state', conditionId: 'offline', value: '' }),
      ),
    );
  });

  it("lists a journey's situations by the journey, each opening the screen where it is seen", async () => {
    mount(running, '{ "name": "bakery" }', situated);
    const group = await screen.findByRole('group', { name: '흐름 상황' });
    fireEvent.click(within(group).getByRole('button', { name: /먼저 예약됐을 때/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /먼저 예약됐을 때/, pressed: true })).toBeTruthy();
    expect((await frameOf('연락처 남기기', dialog)).getAttribute('src')).toBe(
      `${RELAY}/order/contact?alpine-state=taken`,
    );
  });
});
