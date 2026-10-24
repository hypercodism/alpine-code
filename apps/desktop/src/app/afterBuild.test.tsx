import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppViewState } from '@/features/app-view/state';
import { showDockTab, useDockOpen, useDockTab } from '@/features/dock/state';
import { blogBoard, blogConversation, type PlanMoment } from '@/features/product-map/planExample';
import { boardScript } from '@/features/product-map/testBoard';
import { LocaleProvider } from '@/shared/i18n';
import {
  mergeScripts,
  scriptedConnection,
  type CloudScriptOptions,
  type Item,
  type Script,
  ServerProvider,
  sessionInfo,
  sessionScript,
  setUpScript,
} from '@/shared/server';
import { devServersScript } from '@/shared/server/devServersScript';

import type { FlowGetResult } from '@alpine/protocol';

import { routeTree } from './routeTree.gen';

/**
 * After a plan is built (audit theme 3): the app opens at once from a built screen, the completion card has its way to
 * 올리기, and the top bar says where the map stands.
 */

vi.mock('@/features/terminal/TerminalScreen', () => ({
  default: ({ label }: { label: string }) => <textarea aria-label={label} />,
}));

const cwd = '/Users/me/alpine-code';

function mount(
  moment: PlanMoment,
  extra: Script = {},
  {
    cloud = true,
    build = {},
    account = {},
    board = (b) => b,
    mapItems = [],
  }: {
    cloud?: boolean;
    build?: Parameters<typeof sessionInfo>[0];
    account?: CloudScriptOptions;
    board?: (b: FlowGetResult) => FlowGetResult;
    mapItems?: Item[];
  } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(undefined, { enabled: cloud, ...account }),
      devServersScript({ upMs: 0 }),
      sessionScript({
        sessions: [
          { info: sessionInfo({ id: 'map-1', cwd, purpose: 'map', title: '지도' }), items: mapItems },
          { info: sessionInfo({ id: 'build-1', cwd, purpose: 'build', title: '만들기', ...build }) },
        ],
      }),
      boardScript(board(blogBoard(moment))),
      extra,
    ),
  );
  const request = vi.spyOn(connection, 'request');
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/board?project=${encodeURIComponent(cwd)}`] }),
  });
  render(
    <QueryClientProvider client={client}>
      <ServerProvider connection={connection}>
        <LocaleProvider locale="ko">
          <RouterProvider router={router} />
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
  return { request };
}

/** Opens the app from a built screen's card (앱에서 보기). */
async function openApp() {
  await screen.findByRole('main', { name: '제품 지도' });
  fireEvent.click(await screen.findByRole('button', { name: '글 쓰기 열기' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '앱에서 보기' }));
}

/** The completion card under the conversation. */
const done = () => screen.findByRole('region', { name: '다 만들었어요' });

beforeEach(() => {
  // The app view is remembered per project for the window's life: each test starts on the map.
  useAppViewState.setState({ views: {}, cards: {}, sizes: {} });
  localStorage.clear();
  localStorage.setItem('alpine.rail.open', 'false');
  // The map's input and bars sit under its conversation in the dock (map-first 43).
  const open = renderHook(() => useDockOpen());
  act(() => open.result.current[1](true));
  open.unmount();
  const selection = renderHook(() => useDockTab());
  act(() => selection.result.current[1](''));
  selection.unmount();
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

describe('앱 열기 (#7)', () => {
  it('starts the project the way it runs and shows it in the app view, with no command to type', async () => {
    const { request } = mount('built');
    fireEvent.click(await screen.findByRole('button', { name: '앱' }));
    // The app takes the map's place, large, with the top bar's 지도 | 앱 on 앱.
    expect(await screen.findByTitle('alpine-code 앱', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('앱이 열려 있어요 · 이 컴퓨터에서만 보여요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '앱', pressed: true })).toBeTruthy();
    expect(request).toHaveBeenCalledWith('devServers/open', expect.objectContaining({ cwd }));
    expect(request.mock.calls.some(([method]) => method === 'devServers/start')).toBe(false);
  });

  it('hands it to the AI, not me, when nothing in the project says how it runs', async () => {
    const { request } = mount('built', { results: { 'devServers/open': { server: null } } });
    fireEvent.click(await screen.findByRole('button', { name: '앱' }));
    expect(await screen.findByText(/여는 방법을 아직 몰라요/)).toBeTruthy();
    const app = screen.getByRole('region', { name: '앱' });
    // Once the AI has made it ready, the app is opened again from here.
    expect(within(app).getByRole('button', { name: '다시 열기' })).toBeTruthy();
    fireEvent.click(within(app).getByRole('button', { name: 'AI에게 열 수 있게 해 달라고 하기' }));
    await vi.waitFor(() => {
      const sent = request.mock.calls.find(([, params]) => JSON.stringify(params ?? {}).includes('PORT 환경변수'));
      expect(sent?.[0]).toBe('flow/prepare');
    });
    // The conversation is what the right side shows, not a tool.
    const dock = screen.getByRole('complementary', { name: '오른쪽 창' });
    expect(within(dock).queryByRole('button', { name: '대화' })).toBeNull();
  });
});

describe('a built screen opened from its card', () => {
  it('shows that screen in the app view, and words sent now are about it', async () => {
    const { request } = mount('built');
    await openApp();
    expect(await screen.findByText('앱이 열려 있어요 · 이 컴퓨터에서만 보여요', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: '앱', pressed: true })).toBeTruthy();
    expect(await screen.findByText(/화면을 보면서 말하는 중/)).toBeTruthy();
    expect(request).toHaveBeenCalledWith('devServers/open', expect.objectContaining({ cwd }));
  });
});

describe('the app that fails to open (#7)', () => {
  it('hands the AI what went wrong, as words to the map, and shows its conversation', async () => {
    const failed = {
      id: 'dev-1',
      cwd,
      command: 'npm run dev',
      port: 5173,
      status: 'failed' as const,
      url: null,
      external: false,
    };
    const log = "\u001b[31mError: Cannot find module 'vite'\u001b[39m\n";
    const { request } = mount('built', {
      results: {
        'devServers/open': { server: failed },
        'devServers/list': { servers: [failed] },
        'devServers/logs': ({ offset }) => ({ text: offset ? '' : log, nextOffset: log.length, total: log.length }),
      },
    });
    act(() => showDockTab('terminal'));
    fireEvent.click(await screen.findByRole('button', { name: '앱' }));
    expect(await screen.findByText('앱을 열지 못했어요')).toBeTruthy();
    const app = screen.getByRole('region', { name: '앱' });
    expect(within(app).getByRole('button', { name: '다시 열기' })).toBeTruthy();
    // The output has arrived before the button is pressed.
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('devServers/logs', expect.anything()));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    fireEvent.click(within(app).getByRole('button', { name: 'AI에게 고쳐 달라고 하기' }));
    await vi.waitFor(() => {
      const sent = request.mock.calls.find(([, params]) => JSON.stringify(params ?? {}).includes('Cannot find module'));
      // A request to the map, as if typed into its input.
      expect(sent?.[0]).toBe('flow/prepare');
      // The command and the output, without the terminal's colour codes.
      expect(JSON.stringify(sent![1])).toContain('npm run dev');
      expect(JSON.stringify(sent![1])).not.toContain('\\u001b');
    });
    // The terminal that was open gives way to the conversation, where the fixing shows.
    const dock = screen.getByRole('complementary', { name: '오른쪽 창' });
    expect(within(dock).queryByRole('button', { name: '대화' })).toBeNull();
  });
});

describe('올리기 from the map (#13, #23)', () => {
  it('offers 인터넷에 올리기 on the completion card, which opens the top bar sheet', async () => {
    mount('built');
    fireEvent.click(within(await done()).getByRole('button', { name: '인터넷에 올리기' }));
    // Signed out, the sheet asks for the account first.
    expect(await screen.findByText('인터넷에 올리려면 Alpine 계정이 필요해요. 무료예요.')).toBeTruthy();
    // The completion card holds 인터넷에 올리기, so the top bar has no button of its own for a plan.
    expect(screen.queryByRole('button', { name: /^올리기/ })).toBeNull();
  });

  it('promises nothing online when Alpine Cloud is off', async () => {
    mount('built', {}, { cloud: false });
    await done();
    expect(screen.queryByRole('button', { name: '인터넷에 올리기' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^올리기/ })).toBeNull();
  });
});

describe('a plan stays quiet until it is built', () => {
  it.each([['asking'], ['building']] as const)('offers no 올리기 while it is %s', async (moment) => {
    mount(moment, {}, { build: moment === 'building' ? { status: 'running' } : {} });
    await screen.findByRole('button', { name: /다른 프로젝트로/ });
    // The top bar's word comes from the map, so once it shows the map has been read.
    await screen.findAllByText(moment === 'asking' ? '기획 중' : '만드는 중');
    expect(screen.queryByRole('button', { name: /^올리기/ })).toBeNull();
  });

  it("never counts the code a built plan leaves off its cards (the template's server)", async () => {
    mount(
      'built',
      {},
      {
        board: (b) => ({
          ...b,
          coverage: { git: true, uncoveredCount: 13, uncovered: ['worker/db.ts'], outOfScope: 0, excluded: 0 },
          unmapped: [{ title: '서버', paths: ['worker'] }],
        }),
      },
    );
    await done();
    expect(screen.queryByText('지도에 아직 담기지 않은 코드')).toBeNull();
  });

  it('shows no 바뀐 카드 while it is being built: every card is the AI changing it', async () => {
    mount(
      'building',
      {},
      {
        build: { status: 'running' },
        board: (b) => ({
          ...b,
          states: {
            ...b.states,
            list: {
              ...b.states!.list!,
              promises: { [Object.keys(b.states!.list!.promises ?? {})[0]!]: { status: 'recheck' } },
            },
          },
        }),
      },
    );
    await screen.findAllByText('만드는 중');
    expect(screen.queryByText(/^바뀐 카드/)).toBeNull();
  });
});

describe('one place to talk (map-first 43)', () => {
  it('asks its question once, under the conversation, and the map keeps none of it', async () => {
    mount('asking', {}, { mapItems: blogConversation('asking') });
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    // The bar under the conversation holds the answers; the conversation keeps the question in one line.
    expect((await within(dock).findAllByRole('button', { name: /^누구나/ })).length).toBe(1);
    expect(
      within(dock)
        .getAllByRole('textbox')
        .map((box) => box.getAttribute('aria-label')),
    ).toEqual(['지도에 부탁하기']);
    const map = screen.getByRole('main', { name: '제품 지도' });
    expect(within(map).queryByRole('button', { name: /^누구나/ })).toBeNull();
    expect(within(map).queryByRole('textbox')).toBeNull();
  });
});

describe('a plan stopped before its first card', () => {
  it('stays a plan: no code-reading screen, the bar offers to draw on', async () => {
    mount(
      'asking',
      {},
      {
        board: (b) => ({ ...b, document: { nodes: [], flows: [], edges: [] }, screens: {}, undecided: [] }),
      },
    );
    expect(await screen.findByText('지도를 그리다 멈췄어요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '이어서 그려 줘' })).toBeTruthy();
    expect(screen.queryByText('이 프로젝트를 지도로 펼쳐볼게요')).toBeNull();
    expect(screen.queryByPlaceholderText('어떤 지도를 그릴까요? 비워 두고 보내면 바로 그려요')).toBeNull();
  });
});

describe('the top bar on the map (#10)', () => {
  it.each([
    ['asking', {}, '기획 중'],
    ['building', { status: 'running' }, '만드는 중'],
    ['building', { status: 'waiting' }, '확인을 기다려요'],
    ['built', {}, '다 만들었어요'],
  ] as const)('says where a plan stands: %s %o is %s', async (moment, build, word) => {
    mount(moment, {}, { build });
    await screen.findByRole('main', { name: '제품 지도' });
    const bar = screen.getByRole('button', { name: /다른 프로젝트로/ }).parentElement!;
    expect(await within(bar).findByText(word)).toBeTruthy();
  });

  it("keeps the map's conversation on the right with no row of tabs (#88)", async () => {
    mount('built');
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    expect(within(dock).queryByRole('tablist')).toBeNull();
    expect(within(dock).queryByRole('tab', { name: '요약' })).toBeNull();
  });
});

describe('되돌리기 from the data (#49)', () => {
  it('opens the restore points from the live data, and goes back to the data', async () => {
    mount('built', {}, { account: { signedIn: true, data: 'live' } });
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    fireEvent.click(await within(dock).findByRole('button', { name: '더 보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '개발 도구' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '데이터' }));
    fireEvent.click(await within(dock).findByRole('button', { name: '되돌리기 지점' }));
    expect(await within(dock).findByRole('radiogroup', { name: '되돌리기 지점' })).toBeTruthy();
    fireEvent.click(within(dock).getByRole('button', { name: '데이터' }));
    expect(await within(dock).findByRole('button', { name: '되돌리기 지점' })).toBeTruthy();
  });
});
