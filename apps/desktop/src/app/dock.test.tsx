import type { ApprovalItem, ToolCallItem, TerminalProcess } from '@alpine/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDockOpen, useDockTab } from '@/features/dock/state';
import { LocaleProvider } from '@/shared/i18n';
import {
  EXAMPLE_MAP,
  flowScript,
  mergeScripts,
  PROJECTS,
  scriptedConnection,
  type Script,
  ServerProvider,
  sessionInfo,
  sessionScript,
  setUpScript,
  STUDIO_MAP,
} from '@/shared/server';

import { routeTree } from './routeTree.gen';

vi.mock('@/features/terminal/TerminalScreen', () => ({
  default: ({ label }: { label: string }) => <textarea aria-label={label} />,
}));

const cwd = '/Users/me/alpine-code';
const edit: ToolCallItem = {
  id: 'e1',
  kind: 'tool_call',
  name: 'edit',
  args: { path: 'src/Cart.tsx' },
  status: 'done',
  result: null,
  images: 0,
  commandResult: null,
  fileChanges: [{ path: 'src/Cart.tsx', added: 1, removed: 1, diff: ['@@ -1 +1 @@', '-x', '+y'] }],
};
const approval: ApprovalItem = {
  id: 'e1a',
  kind: 'approval',
  callId: 'e1',
  title: 'Edit src/Cart.tsx',
  preview: '@@ -1 +1 @@\n-x\n+y\n',
  previewKind: 'diff',
  reason: null,
  remember: null,
  decision: 'allow',
  feedback: null,
  review: null,
  reviewError: null,
  askedBy: [],
  tool: 'edit',
  args: { path: 'src/Cart.tsx' },
};

/** `extra` answers after the defaults, so a test can change one result (e.g. an archived project). */
function mount(path: string, extra: Script = {}, running = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(),
      { results: { 'devServers/list': { servers: [] } } },
      sessionScript({
        sessions: [
          {
            info: sessionInfo({ id: 'work', cwd, title: '장바구니 고치기', status: running ? 'running' : 'idle' }),
            items: [approval, edit],
          },
          { info: sessionInfo({ id: 'elsewhere', cwd: '/Users/me/docs-site' }), items: [approval, edit] },
        ],
      }),
      flowScript(() => EXAMPLE_MAP),
      extra,
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
const toggle = () => screen.findByRole('button', { name: '오른쪽 창 닫기', pressed: true });
/** The dock's open state is shared across a test file: set it for each test (it is remembered, as in the app). */
function setDock(value: boolean) {
  const { result, unmount } = renderHook(() => useDockOpen());
  act(() => result.current[1](value));
  unmount();
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alpine.rail.open', 'false');
  setDock(false);
  // Each test starts on the route's first tab; another test may have selected a project tool.
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

describe('right dock on the routes', () => {
  it('stops without opening the dock, and leads to the commands only while some still run', async () => {
    const command: TerminalProcess = {
      id: 'dev',
      command: 'pnpm dev',
      cwd,
      sessionId: 'work',
      title: 'pnpm dev',
      pty: false,
      pid: 42,
      status: 'running',
      exitCode: null,
      cancelled: false,
      createdAt: 1,
      outputSize: 0,
    };
    mount('/session/work', { results: { 'processes/list': { processes: [command] } } }, true);
    fireEvent.click(await screen.findByRole('button', { name: '멈추기' }));
    // Not while the stop ends the run's own commands, only a moment after: an ordinary stop shows nothing by.
    expect(screen.queryByText('멈춘 뒤에도 실행 중인 명령이 1개 있어요')).toBeNull();
    expect(await screen.findByText('멈춘 뒤에도 실행 중인 명령이 1개 있어요', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: '오른쪽 창' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '보기' }));
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    // A rarer place, under ⋮: the ⋮ button stands for it while it is shown.
    expect(within(dock).queryByRole('tab', { name: 'AI가 실행한 명령' })).toBeNull();
    expect(await within(dock).findByRole('region', { name: 'AI가 실행한 명령' })).toBeTruthy();
  });

  it('says nothing after a stop when no command is left', async () => {
    mount('/session/work', { results: { 'processes/list': { processes: [] } } }, true);
    fireEvent.click(await screen.findByRole('button', { name: '멈추기' }));
    await waitFor(() => expect(screen.queryByText(/실행 중인 명령이/)).toBeNull());
    expect(screen.queryByRole('complementary', { name: '오른쪽 창' })).toBeNull();
  });

  it('opens the actual source viewer from a changed file and exposes the project execution tools', async () => {
    let shell: TerminalProcess | null = null;
    let launches = 0;
    mount('/session/work', {
      results: {
        'files/read': ({ cwd: project, path, line = 1 }) => ({
          path: `${project}/${path}`,
          relativePath: path,
          line,
          content: 'export const cart = true;',
          startLine: 1,
          totalLines: 1,
          truncated: false,
        }),
        'terminals/list': () => ({ processes: shell ? [shell] : [] }),
        'terminals/start': ({ command, title, kind, sessionId }) => {
          launches++;
          shell = {
            id: 'default-shell',
            command,
            title: title!,
            kind,
            sessionId,
            cwd,
            pty: true,
            pid: 42,
            status: 'running',
            createdAt: 1,
            outputSize: 0,
            cancelled: false,
          };
          return { process: shell };
        },
        'devServers/list': { servers: [] },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: '오른쪽 창 열기, 바뀐 파일 1개' }));
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    fireEvent.click(within(dock).getByRole('tab', { name: '바뀐 파일' }));
    fireEvent.click(await within(dock).findByRole('button', { name: /Cart\.tsx/ }));
    expect(within(dock).getByRole('tab', { name: '바뀐 파일', selected: true })).toBeTruthy();
    expect(within(dock).getByRole('region', { name: 'Cart.tsx 바뀐 내용' })).toBeTruthy();
    fireEvent.click(await within(dock).findByRole('button', { name: '전체 파일 보기' }));
    expect(within(dock).getByRole('tab', { name: '파일', selected: true })).toBeTruthy();
    expect(await within(dock).findByText('export const cart = true;')).toBeTruthy();
    fireEvent.click(within(dock).getByRole('button', { name: '바뀐 파일로 돌아가기' }));
    expect(within(dock).getByRole('region', { name: 'Cart.tsx 바뀐 내용' })).toBeTruthy();
    expect(within(dock).getByRole('tab', { name: '바뀐 파일', selected: true })).toBeTruthy();
    fireEvent.click(within(dock).getByRole('tab', { name: '터미널' }));
    expect(await within(dock).findByRole('textbox', { name: '터미널 입력: 셸 1' })).toBeTruthy();
    expect(launches).toBe(1);
    fireEvent.click(within(dock).getByRole('button', { name: '터미널 메뉴' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '앱 미리보기 열기…' }));
    expect(await within(dock).findByRole('tab', { name: '앱 미리보기', selected: true })).toBeTruthy();
    expect(await within(dock).findByRole('button', { name: '서버 실행' })).toBeTruthy();
    fireEvent.click(within(dock).getByRole('tab', { name: '터미널' }));
    expect(await within(dock).findByRole('textbox', { name: '터미널 입력: 셸 1' })).toBeTruthy();
    expect(launches).toBe(1);
  });

  it('opens from the top bar on a session on its summary, which leads to its work result', async () => {
    mount('/session/work');
    fireEvent.click(await screen.findByRole('button', { name: '오른쪽 창 열기, 바뀐 파일 1개' }));
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    expect(within(dock).getByRole('tab', { name: '요약', selected: true })).toBeTruthy();
    fireEvent.click(await within(dock).findByRole('button', { name: /바뀐 파일/ }));
    expect(within(dock).getByRole('tab', { name: '바뀐 파일', selected: true })).toBeTruthy();
    expect(await within(dock).findByRole('button', { name: /Cart\.tsx/ })).toBeTruthy();
    fireEvent.click(await toggle());
    await waitFor(() => expect(screen.queryByRole('complementary', { name: '오른쪽 창' })).toBeNull());
  });

  it("keeps the map's conversation on the right, and opens a developer tool in its place with the way back", async () => {
    mount(board('work'));
    expect(await screen.findByText('alpine-code', { selector: 'span' })).toBeTruthy();
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    // No row of tabs: the right side is the conversation (flow-spec, 화면의 뼈대).
    expect(within(dock).queryByRole('tablist')).toBeNull();
    // One place to type (map-first 43): the map's input, under the conversation; the map itself has none.
    expect(
      within(dock)
        .getAllByRole('textbox')
        .map((box) => box.getAttribute('aria-label')),
    ).toEqual(['지도에 부탁하기']);
    expect(
      within(screen.getByRole('main', { name: '제품 지도' })).queryByRole('textbox', { name: '지도에 부탁하기' }),
    ).toBeNull();
    fireEvent.click(within(dock).getByRole('button', { name: '더 보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '개발 도구' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '바뀐 파일' }));
    expect(await within(dock).findByRole('button', { name: /Cart\.tsx/ })).toBeTruthy();
    expect(within(dock).getByRole('heading', { name: '바뀐 파일' })).toBeTruthy();
    // The input stays under the tool; ← 대화 brings the conversation back.
    expect(within(dock).getByRole('textbox', { name: '지도에 부탁하기' })).toBeTruthy();
    fireEvent.click(within(dock).getByRole('button', { name: '대화' }));
    await waitFor(() => expect(within(dock).queryByRole('button', { name: /Cart\.tsx/ })).toBeNull());
    expect(within(dock).queryByRole('heading', { name: '바뀐 파일' })).toBeNull();
  });

  it('says plainly that no work is connected when the product map has no session', async () => {
    mount(board());
    fireEvent.click(
      await within(await screen.findByRole('complementary', { name: '오른쪽 창' })).findByRole('button', {
        name: '더 보기',
      }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: '개발 도구' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '바뀐 파일' }));
    const dock = screen.getByRole('complementary', { name: '오른쪽 창' });
    expect(await within(dock).findByText('아직 연결된 작업이 없어요')).toBeTruthy();
  });

  it('does not show the work of a session from another project on the map', async () => {
    mount(board('elsewhere'));
    fireEvent.click(
      await within(await screen.findByRole('complementary', { name: '오른쪽 창' })).findByRole('button', {
        name: '더 보기',
      }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: '개발 도구' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '바뀐 파일' }));
    const dock = screen.getByRole('complementary', { name: '오른쪽 창' });
    expect(await within(dock).findByText('아직 연결된 작업이 없어요')).toBeTruthy();
  });

  it('shows the conversation beside the map even when the dock was closed on a conversation page', async () => {
    setDock(false);
    mount(board());
    expect(await screen.findByRole('complementary', { name: '오른쪽 창' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /오른쪽 창 (열기|닫기)/ })).toBeNull();
  });

  it('shows no dock button for a project that is not listed', async () => {
    mount('/board?project=' + encodeURIComponent('/Users/me/gone'));
    expect(await screen.findByText('gone 프로젝트가 목록에 없어요')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /오른쪽 창/ })).toBeNull();
  });

  it('shows no dock button for an archived project, which the board renders without a dock', async () => {
    const archived = PROJECTS.map((p) => (p.path === cwd ? { ...p, archived: true } : p));
    mount(board('work'), { results: { 'projects/list': { projects: archived, clones: [] } } });
    expect(await screen.findByText('alpine-code 프로젝트는 보관했어요')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /오른쪽 창/ })).toBeNull();
  });

  it.each([
    [700, true],
    [1400, false],
  ])('with the map area %ipx wide, the open change history overlays the dock: %s', async (width, overlaid) => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private callback: (entries: unknown[]) => void) {}
        observe() {
          this.callback([{ contentRect: { width } }]);
        }
        disconnect() {}
      },
    );
    setDock(true);
    // A map with a change history, which opens beside the map from its menu.
    mount(
      board(),
      flowScript(() => STUDIO_MAP),
    );
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^지도 기록/ }));
    const panel = await screen.findByRole('complementary', { name: '지도 기록' });
    expect(panel.closest('[data-overlay]') !== null).toBe(overlaid);
    expect(screen.getByRole('complementary', { name: '오른쪽 창' })).toBeTruthy();
  });
});

it('shows a discovered server under 미리보기', async () => {
  mount('/session/work', {
    results: {
      'devServers/list': {
        servers: [
          {
            id: 'web',
            cwd,
            command: 'pnpm dev',
            port: 5173,
            status: 'running',
            url: 'http://localhost:5173',
            external: false,
          },
        ],
      },
    },
  });
  fireEvent.click(await screen.findByRole('button', { name: '오른쪽 창 열기, 바뀐 파일 1개' }));
  fireEvent.click(await screen.findByRole('tab', { name: '앱 미리보기' }));
  expect(await screen.findByTitle('미리보기')).toBeTruthy();
});
