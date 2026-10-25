import type { DevServerInfo, FlowGetResult, SessionInfo } from '@alpine/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { showApp, useAppViewState } from '@/features/app-view/state';
import { showDockTab } from '@/features/dock/state';
import { blogBoard, type PlanMoment } from '@/features/product-map/planExample';
import { boardScript } from '@/features/product-map/testBoard';
import { LocaleProvider } from '@/shared/i18n';
import { useNavigation } from '@/shared/navigation';
import {
  mergeScripts,
  scriptedConnection,
  type Script,
  ServerProvider,
  sessionInfo,
  sessionScript,
  setUpScript,
} from '@/shared/server';
import { devServersScript } from '@/shared/server/devServersScript';

import { routeTree } from './routeTree.gen';

/**
 * The window around the map without the rail (flow-spec, 화면의 뼈대): the project's name ⌄, ⋯ with the developer
 * tools in the conversation's place, 지도 | 앱 once there is an app, and the app view beside its screens.
 */

vi.mock('@/features/terminal/TerminalScreen', () => ({
  default: ({ label }: { label: string }) => <textarea aria-label={label} />,
}));

const app = '/Users/me/alpine-code';
const docs = '/Users/me/docs-site';
const infra = '/Users/me/infra-terraform';
const q = (path: string) => `?project=${encodeURIComponent(path)}`;

/** A running app at a web address, so its screens' paths are opened in it. */
const RUNNING: DevServerInfo = {
  id: 'dev-1',
  cwd: app,
  command: 'npm run dev',
  port: 5173,
  status: 'running',
  url: 'http://localhost:5173/',
  external: false,
};
const running: Script = {
  results: { 'devServers/open': { server: RUNNING }, 'devServers/list': { servers: [RUNNING] } },
};

function mount(
  path: string,
  {
    moment = 'built',
    sessions = [],
    extra = {},
    board = (b) => b,
  }: {
    moment?: PlanMoment;
    sessions?: SessionInfo[];
    extra?: Script;
    board?: (b: FlowGetResult) => FlowGetResult;
  } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(),
      devServersScript({ upMs: 0 }),
      sessionScript({
        sessions: [
          { info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', title: '지도' }) },
          ...sessions.map((info) => ({ info })),
        ],
      }),
      boardScript(board(blogBoard(moment))),
      extra,
    ),
  );
  const request = vi.spyOn(connection, 'request');
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
  return { router, request };
}

const projectMenu = async () => {
  await screen.findByRole('main', { name: '제품 지도' });
  fireEvent.click(screen.getByRole('button', { name: /다른 프로젝트로/ }));
  return screen.findByRole('list', { name: '최근 프로젝트' });
};
const row = async (list: HTMLElement, name: string) =>
  (await within(list).findByRole('button', { name: new RegExp(`^${name}(?! 메뉴)`) })).parentElement!;
const side = () => screen.findByRole('complementary', { name: '오른쪽 창' });
const frame = () => screen.findByTitle('alpine-code 앱', {}, { timeout: 3000 }) as Promise<HTMLIFrameElement>;

beforeEach(() => {
  localStorage.clear();
  useNavigation.setState({ lastProject: null, searchOpen: false, pinnedProjects: [] });
  useAppViewState.setState({ views: {}, cards: {}, sizes: {} });
  act(() => showDockTab('summary'));
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

describe('the project menu, where the rail was', () => {
  it('has no rail on the map, and switches projects from the name', async () => {
    const { router } = mount('/board' + q(app));
    const list = await projectMenu();
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect((await row(list, 'alpine-code')).querySelector('[aria-current="page"]')).not.toBeNull();
    fireEvent.click(within(await row(list, 'docs-site')).getByRole('button', { name: /^docs-site(?! 메뉴)/ }));
    await waitFor(() => expect(router.state.location.href).toBe('/board' + q(docs)));
    expect(await screen.findByRole('button', { name: 'docs-site · 다른 프로젝트로' })).toBeTruthy();
  });

  it('says each project in one word, and puts the orange dot by the name when another waits for me', async () => {
    mount('/board' + q(app), {
      sessions: [
        sessionInfo({ id: 'docs-map', cwd: docs, purpose: 'map', status: 'waiting' }),
        sessionInfo({ id: 'infra-build', cwd: infra, purpose: 'build', status: 'running' }),
      ],
    });
    const list = await projectMenu();
    // Every project of this script has the built blog's map; work going on says more than that.
    expect(within(await row(list, 'alpine-code')).getByText('다 만들었어요')).toBeTruthy();
    expect(within(await row(list, 'docs-site')).getByText('확인을 기다려요')).toBeTruthy();
    expect(within(await row(list, 'infra-terraform')).getByText('만드는 중')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'alpine-code · 다른 프로젝트로 · 다른 프로젝트가 기다려요' }),
    ).toBeTruthy();
  });

  it('has no orange dot when only the project on screen waits', async () => {
    mount('/board' + q(app), { sessions: [sessionInfo({ id: 'app-build', cwd: app, status: 'waiting' })] });
    await screen.findByRole('main', { name: '제품 지도' });
    expect(screen.getByRole('button', { name: 'alpine-code · 다른 프로젝트로' })).toBeTruthy();
  });

  it('opens 새 프로젝트, which keeps the name ⌄ and ⋯ without a rail', async () => {
    const { router } = mount('/board' + q(app));
    await projectMenu();
    fireEvent.click(screen.getByRole('button', { name: /새 프로젝트\s*⌘N/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { name: '무엇을 만들어 볼까요?' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.getByRole('button', { name: '새 프로젝트 · 다른 프로젝트로' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '더 보기' })).toBeTruthy();
  });

  it('opens 프로젝트 추가… and 보관함, and restores an archived project onto its map', async () => {
    const { router } = mount('/board' + q(app));
    const list = await projectMenu();
    fireEvent.click(within(await row(list, 'infra-terraform')).getByRole('button', { name: 'infra-terraform 메뉴' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '보관' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^infra-terraform(?! 메뉴)/ })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /보관함/ }));
    const archive = await screen.findByRole('dialog', { name: '보관함' });
    fireEvent.click(within(archive).getByRole('button', { name: '복원' }));
    await waitFor(() => expect(router.state.location.href).toBe('/board' + q(infra)));
    await projectMenu();
    fireEvent.click(screen.getByRole('button', { name: '프로젝트 추가…' }));
    expect(await screen.findByRole('button', { name: /내 컴퓨터의 프로젝트 열기/ })).toBeTruthy();
  });
});

describe('⋯ beside the conversation', () => {
  it('holds 설정, 에이전트, 기억, 지난 대화 and the developer tools', async () => {
    const { router } = mount('/board' + q(app));
    fireEvent.click(within(await side()).getByRole('button', { name: '더 보기' }));
    for (const name of [/설정/, '에이전트', '기억', '지난 대화', '개발 도구'])
      expect(await screen.findByRole('menuitem', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: '지난 대화' }));
    expect(await screen.findByRole('dialog', { name: '프로젝트와 대화 찾기' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(within(await side()).getByRole('button', { name: '더 보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '기억' }));
    await waitFor(() => expect(router.state.location.href).toBe('/memory' + q(app)));
    // Away from the map, its name leads back.
    fireEvent.click(await screen.findByRole('link', { name: 'alpine-code' }));
    await waitFor(() => expect(router.state.location.href).toBe('/board' + q(app)));
  });

  it('opens a developer tool in the conversation’s place, and ← 대화 brings the conversation back', async () => {
    mount('/board' + q(app));
    const right = await side();
    expect(within(right).queryByRole('tablist')).toBeNull();
    fireEvent.click(within(right).getByRole('button', { name: '더 보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '개발 도구' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '터미널' }));
    expect(within(right).getByRole('heading', { name: '터미널' })).toBeTruthy();
    // The map's input stays under the tool.
    expect(within(right).getByRole('textbox', { name: '지도에 부탁하기' })).toBeTruthy();
    fireEvent.click(within(right).getByRole('button', { name: '대화' }));
    expect(within(right).queryByRole('heading', { name: '터미널' })).toBeNull();
  });
});

describe('지도 | 앱', () => {
  it.each([['asking'], ['building']] as const)('is not there while the plan is %s', async (moment) => {
    mount('/board' + q(app), { moment });
    await screen.findByRole('main', { name: '제품 지도' });
    expect(screen.queryByRole('group', { name: '지도와 앱' })).toBeNull();
  });

  it('shows once the plan is built, and 앱 puts the app where the map was, which stays for coming back', async () => {
    mount('/board' + q(app), { extra: running });
    const toggle = await screen.findByRole('group', { name: '지도와 앱' });
    fireEvent.click(within(toggle).getByRole('button', { name: '앱' }));
    expect((await frame()).src).toBe('http://localhost:5173/');
    expect(screen.getByText('앱이 열려 있어요 · 이 컴퓨터에서만 보여요')).toBeTruthy();
    // The map is still there, out of sight, for 지도.
    expect(screen.getByRole('main', { name: '제품 지도', hidden: true })).toBeTruthy();
    fireEvent.click(within(toggle).getByRole('button', { name: '지도' }));
    expect(screen.queryByTitle('alpine-code 앱')).toBeNull();
    expect(screen.getByRole('main', { name: '제품 지도' })).toBeTruthy();
  });
});

describe('the app view', () => {
  it('opens each screen at its address, and the conversation says which screen I look at', async () => {
    mount('/board' + q(app), { extra: running });
    fireEvent.click(await screen.findByRole('button', { name: '앱' }));
    const strip = await screen.findByRole('complementary', { name: '지금 보는 화면' });
    // The first page is the screen at `/`.
    expect(await within(strip).findByRole('heading', { name: '글 목록 보기' })).toBeTruthy();
    expect(within(strip).getByText('방문자 · 휴대폰 · 글 찾아 읽기')).toBeTruthy();
    expect(within(await side()).getByText('글 목록 보기 화면을 보면서 말하는 중')).toBeTruthy();
    fireEvent.click(within(strip).getByRole('button', { name: '글 쓰기' }));
    await waitFor(async () => expect((await frame()).src).toBe('http://localhost:5173/write'));
    expect(within(strip).getByRole('heading', { name: '글 쓰기' })).toBeTruthy();
    expect(within(strip).getByText('마크다운으로 쓰면 바로 미리 보여요')).toBeTruthy();
    expect(within(await side()).getByText('글 쓰기 화면을 보면서 말하는 중')).toBeTruthy();
    // The map's 앱에서 보기 goes through the same place (showApp with the card).
    fireEvent.click(screen.getByRole('button', { name: '지도' }));
    act(() => showApp(app, 'read'));
    await waitFor(async () => expect((await frame()).src).toBe('http://localhost:5173/posts/d1-batch'));
  });

  it('shows a screen at its journey’s size, and the switch changes it', async () => {
    mount('/board' + q(app), { extra: running });
    fireEvent.click(await screen.findByRole('button', { name: '앱' }));
    await frame();
    // 글 목록 보기 is on the visitor's phone journey.
    expect(screen.getByRole('button', { name: '휴대폰 크기', pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '글 쓰기' }));
    expect(await screen.findByRole('button', { name: '컴퓨터 크기', pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '휴대폰 크기' }));
    expect(screen.getByRole('button', { name: '휴대폰 크기', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: '컴퓨터 크기', pressed: false })).toBeTruthy();
  });

  it('opens the first page for a screen with no address, and says so', async () => {
    mount('/board' + q(app), {
      extra: running,
      board: (b) => ({
        ...b,
        document: {
          ...b.document!,
          nodes: b.document!.nodes!.map((node) => (node.id === 'publish' ? { ...node, path: null } : node)),
        },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: '앱' }));
    await frame();
    fireEvent.click(screen.getByRole('button', { name: '발행' }));
    expect(await screen.findByText('이 화면은 앱 안 주소가 아직 없어서 앱 첫 화면을 열었어요.')).toBeTruthy();
    expect((await frame()).src).toBe('http://localhost:5173/');
  });

  it('says it could not open the app, with the AI’s fix and 다시 열기', async () => {
    const { request } = mount('/board' + q(app), { extra: devServersScript({ upMs: 0, fails: true }) });
    fireEvent.click(await screen.findByRole('button', { name: '앱' }));
    expect(await screen.findByText('앱을 열지 못했어요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다시 열기' }));
    await waitFor(() =>
      expect(request.mock.calls.filter(([method]) => method === 'devServers/open').length).toBeGreaterThan(1),
    );
    expect(await screen.findByRole('button', { name: 'AI에게 고쳐 달라고 하기' })).toBeTruthy();
  });

  it('says a phone app is seen on a phone, and starts nothing', async () => {
    const pkg = '{ "name": "shop", "dependencies": { "expo": "~54.0.0" } }';
    const { request } = mount('/board' + q(app), {
      extra: {
        results: {
          'files/read': ({ cwd, path }) => ({
            path: `${cwd}/${path}`,
            relativePath: path,
            content: pkg,
            startLine: 1,
            totalLines: 1,
            line: 1,
            truncated: false,
          }),
        },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: '앱' }));
    expect(await screen.findByText('휴대폰 앱은 이 화면에서 바로 볼 수 없어요')).toBeTruthy();
    expect(screen.getByText('휴대폰으로 보는 법')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '터미널 열기' }));
    expect(within(await side()).getByRole('heading', { name: '터미널' })).toBeTruthy();
    expect(request.mock.calls.some(([method]) => method === 'devServers/open')).toBe(false);
  });
});
