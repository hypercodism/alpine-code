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
 * tools in the conversation's place, the tabs 보드 · 문서 · 앱 · 코드 (앱 once there is an app), and the app view beside
 * its screens.
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
          { info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', title: '보드' }) },
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
  await screen.findByRole('main', { name: '제품 보드' });
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
    await screen.findByRole('main', { name: '제품 보드' });
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

describe('the rail beside the conversation', () => {
  const rail = () => screen.findByRole('navigation', { name: '도구' });

  it('ends with 더 보기: 설정, 에이전트, 기억, 지난 대화, and no developer tools any more', async () => {
    const { router } = mount('/board' + q(app));
    fireEvent.click(within(await rail()).getByRole('button', { name: '더 보기' }));
    for (const name of [/설정/, '에이전트', '기억', '지난 대화'])
      expect(await screen.findByRole('menuitem', { name })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '개발 도구' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: '지난 대화' }));
    expect(await screen.findByRole('dialog', { name: '프로젝트와 대화 찾기' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(within(await rail()).getByRole('button', { name: '더 보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '기억' }));
    await waitFor(() => expect(router.state.location.href).toBe('/memory' + q(app)));
    // Away from the map, its name leads back.
    fireEvent.click(await screen.findByRole('link', { name: 'alpine-code' }));
    await waitFor(() => expect(router.state.location.href).toBe('/board' + q(app)));
  });

  it('opens 터미널 in the conversation’s place, and 대화 brings the conversation back', async () => {
    mount('/board' + q(app));
    const right = await side();
    expect(within(right).queryByRole('tablist')).toBeNull();
    fireEvent.click(within(await rail()).getByRole('button', { name: '터미널' }));
    expect(await within(right).findByRole('heading', { name: '터미널' })).toBeTruthy();
    // The map's input stays under the place.
    expect(within(right).getByRole('textbox', { name: '보드에 부탁하기' })).toBeTruthy();
    fireEvent.click(within(await rail()).getByRole('button', { name: '대화' }));
    expect(within(right).queryByRole('heading', { name: '터미널' })).toBeNull();
  });
});

const TABS = '보드, 문서, 앱, 코드';

/** The project's files, for the 코드 tab. */
const files: Script = {
  results: {
    'files/list': ({ path = '' }) => ({
      entries:
        path === ''
          ? [{ name: 'src', path: 'src', kind: 'directory' }]
          : [{ name: 'write.tsx', path: 'src/routes/write.tsx', kind: 'file' }],
      nextOffset: 1,
      hasMore: false,
    }),
    'files/read': ({ path }) => ({
      path: `${app}/${path}`,
      relativePath: path,
      content: 'export function Write() {}',
      startLine: 1,
      totalLines: 1,
      line: 1,
      truncated: false,
    }),
  },
};

describe('보드 · 문서 · 앱 · 코드', () => {
  it.each([['asking'], ['building']] as const)('are there while the plan is %s, without 앱', async (moment) => {
    mount('/board' + q(app), { moment });
    const tabs = await screen.findByRole('group', { name: TABS });
    expect(
      within(tabs)
        .getAllByRole('button')
        .map((tab) => tab.textContent),
    ).toEqual(['보드', '문서', '코드']);
  });

  it('shows 앱 once the plan is built, which puts the app where the map was, and the map stays for coming back', async () => {
    mount('/board' + q(app), { extra: running });
    const toggle = await screen.findByRole('group', { name: TABS });
    fireEvent.click(within(toggle).getByRole('button', { name: '앱' }));
    expect((await frame()).src).toBe('http://localhost:5173/');
    expect(screen.getByText('앱이 열려 있어요 · 이 컴퓨터에서만 보여요')).toBeTruthy();
    // The map is still there, out of sight, for 보드.
    expect(screen.getByRole('main', { name: '제품 보드', hidden: true })).toBeTruthy();
    fireEvent.click(within(toggle).getByRole('button', { name: '보드' }));
    expect(screen.queryByTitle('alpine-code 앱')).toBeNull();
    expect(screen.getByRole('main', { name: '제품 보드' })).toBeTruthy();
  });

  it('reads the board as a planning document: people, journeys with their screens, promises, decisions', async () => {
    mount('/board' + q(app));
    fireEvent.click(within(await screen.findByRole('group', { name: TABS })).getByRole('button', { name: '문서' }));
    const doc = await screen.findByRole('article', { name: '문서' });
    expect(within(doc).getByRole('heading', { name: '누가 쓰나요' })).toBeTruthy();
    expect(within(doc).getByRole('heading', { name: '글 찾아 읽기' })).toBeTruthy();
    expect(within(doc).getByRole('heading', { name: '글 써서 올리기' })).toBeTruthy();
    // Every promise, each with the screen it is on and how it stands.
    expect(within(doc).getByRole('heading', { name: '약속 9개' })).toBeTruthy();
    const promise = within(doc).getByText('마크다운으로 쓰면 바로 미리 보여요').closest('li')!;
    expect(promise.textContent).toContain('글 쓰기');
    expect(promise.textContent).toContain('통과');
    // What was decided, without who decided it.
    expect(within(doc).getByRole('heading', { name: '결정 2개' })).toBeTruthy();
    expect(within(doc).getByText('같이 지워요').closest('li')!.textContent).not.toContain('정함');
    // The contents lead to each part.
    const contents = screen.getByRole('navigation', { name: '목차' });
    expect(within(contents).getByRole('button', { name: '글 써서 올리기' })).toBeTruthy();
  });

  it('opens a screen pressed in the document on the board', async () => {
    mount('/board' + q(app));
    const tabs = await screen.findByRole('group', { name: TABS });
    fireEvent.click(within(tabs).getByRole('button', { name: '문서' }));
    expect(within(tabs).getByRole('button', { name: '문서', pressed: true })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '글 쓰기 보드에서 보기' }));
    // The card opens over the board (the window behind it is out of reach while it is open).
    const card = await screen.findByRole('dialog');
    expect(within(card).getByRole('heading', { name: '글 쓰기' })).toBeTruthy();
    expect(within(tabs).getByRole('button', { name: '보드', pressed: true, hidden: true })).toBeTruthy();
    expect(screen.queryByRole('article', { name: '문서', hidden: true })).toBeNull();
  });

  it('lists what is still to decide while the plan is asking', async () => {
    mount('/board' + q(app), { moment: 'asking' });
    fireEvent.click(within(await screen.findByRole('group', { name: TABS })).getByRole('button', { name: '문서' }));
    const doc = await screen.findByRole('article', { name: '문서' });
    expect(within(doc).getByRole('heading', { name: '정할 것 2개' })).toBeTruthy();
    expect(within(doc).getByText('댓글을 받을까요')).toBeTruthy();
  });

  it('shows the files as an editor does, and opens one there without leaving the conversation', async () => {
    const { request } = mount('/board' + q(app), { extra: files });
    fireEvent.click(within(await screen.findByRole('group', { name: TABS })).getByRole('button', { name: '코드' }));
    expect(await screen.findByText('왼쪽에서 파일을 고르면 여기 보여요.')).toBeTruthy();
    const tree = await screen.findByRole('tree');
    fireEvent.click(within(tree).getByRole('treeitem', { name: 'src' }));
    fireEvent.click(await within(tree).findByRole('treeitem', { name: 'write.tsx' }));
    expect(await screen.findByText('export function Write() {}')).toBeTruthy();
    expect(request).toHaveBeenCalledWith('files/read', expect.objectContaining({ path: 'src/routes/write.tsx' }));
    // The tree stays beside the file, and the conversation beside both.
    expect(screen.getByRole('tree')).toBeTruthy();
    expect(within(await side()).getByRole('textbox', { name: '보드에 부탁하기' })).toBeTruthy();
  });
});

describe('the 코드 tab', () => {
  it('shows 바뀐 파일 as git diff shows it', async () => {
    mount('/board' + q(app), {
      extra: {
        results: {
          ...files.results,
          'projects/diff': {
            git: true,
            truncated: false,
            files: [
              {
                path: 'src/routes/write.tsx',
                status: 'modified',
                added: 1,
                deleted: 1,
                binary: false,
                patch: 'diff --git a/src/routes/write.tsx b/src/routes/write.tsx\n@@ -1 +1 @@\n-old\n+new',
              },
              { path: 'notes.md', status: 'untracked', added: 2, deleted: 0, binary: false, patch: '' },
            ],
          },
        },
      },
    });
    fireEvent.click(within(await screen.findByRole('group', { name: TABS })).getByRole('button', { name: '코드' }));
    fireEvent.click(await screen.findByRole('button', { name: '바뀐 파일 2' }));
    const changes = await screen.findByRole('list', { name: '바뀐 파일' });
    expect(within(changes).getByRole('button', { name: /notes\.md/ }).textContent).toContain('+2');
    fireEvent.click(within(changes).getByRole('button', { name: /write\.tsx/ }));
    const diff = await screen.findByRole('region', { name: 'src/routes/write.tsx' });
    expect(within(diff).getByText('+new')).toBeTruthy();
    expect(within(diff).getByText('-old')).toBeTruthy();
    expect(within(diff).getByText('바뀜')).toBeTruthy();
  });

  it('says so when the project has no git', async () => {
    mount('/board' + q(app), { extra: { results: { ...files.results, 'projects/diff': { git: false, files: [] } } } });
    fireEvent.click(within(await screen.findByRole('group', { name: TABS })).getByRole('button', { name: '코드' }));
    fireEvent.click(await screen.findByRole('button', { name: '바뀐 파일' }));
    expect(await screen.findByText('이 프로젝트는 git을 쓰지 않아서 바뀐 것을 비교할 수 없어요.')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: '보드' }));
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
    // At a computer's size the page is a computer's width, scaled to the room beside the strip (dogfood 16).
    expect((await frame()).style.width).toBe('1280px');
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
