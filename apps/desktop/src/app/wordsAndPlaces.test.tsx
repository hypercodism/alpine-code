import type { ExternalSessionInfo, SessionInfo, TaskForceItem } from '@alpine/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDockOpen, useDockTab } from '@/features/dock/state';
import { blogBoard, type PlanMoment } from '@/features/product-map/planExample';
import { boardScript } from '@/features/product-map/testBoard';
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
  type Item,
  type Script,
} from '@/shared/server';

import { routeTree } from './routeTree.gen';

/**
 * Names and the features left over (audit theme 7): what can not start says why, a plan shows only what fits a plan,
 * the conversation beside the map points at the map's input, the AI 팀 opens beside the map, memory is reached from
 * the map, a deleted map is drawn again from the code, and the words are the same everywhere.
 */

vi.mock('@/features/terminal/TerminalScreen', () => ({
  default: ({ label }: { label: string }) => <textarea aria-label={label} />,
}));

const app = '/Users/me/alpine-code';
const q = (path: string) => `?project=${encodeURIComponent(path)}`;

interface Mount {
  sessions?: { info: SessionInfo; items?: Item[] }[];
  importable?: ExternalSessionInfo[];
  /** The project's map: the example map, or the blog plan at one moment. */
  plan?: PlanMoment;
  extra?: Script;
}

function mount(path: string, { sessions = [], importable = [], plan, extra = {} }: Mount = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(),
      sessionScript({ sessions, importable }),
      plan ? boardScript(blogBoard(plan)) : flowScript(() => EXAMPLE_MAP),
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
  return { router, connection, request };
}

const calls = (request: { mock: { calls: unknown[][] } }, method: string) =>
  request.mock.calls.filter(([name]) => name === method).map(([, params]) => params as Record<string, unknown>);
const mapMenu = async () => {
  // The map's menu is the "지도" part of the window's ⋯: the map's page has one ⋯.
  fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
  return screen.findByRole('menu');
};
const mapInput = () => screen.getByRole('textbox', { name: '지도에 부탁하기' });
const write = (text: string) => {
  fireEvent.change(mapInput(), { target: { value: text } });
  fireEvent.keyDown(mapInput(), { key: 'Enter' });
};

beforeEach(() => {
  localStorage.clear();
  // The map's input and bars sit under its conversation in the dock (map-first 43).
  const open = renderHook(() => useDockOpen());
  act(() => open.result.current[1](true));
  open.unmount();
  const selection = renderHook(() => useDockTab());
  act(() => selection.result.current[1](''));
  selection.unmount();
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

describe('what can not start now says why (#30)', () => {
  it('turns off 기능 더 찾기 while another conversation works, and says why a press does nothing', async () => {
    const { request } = mount('/board' + q(app), {
      sessions: [{ info: sessionInfo({ id: 'other', cwd: app, title: 'README 다시 쓰기', status: 'running' }) }],
    });
    expect(await screen.findByText(/다른 대화에서 AI가 일하는 중이에요/)).toBeTruthy();
    const menu = await mapMenu();
    expect(within(menu).getByRole('menuitem', { name: '기능 더 찾기' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(menu, { key: 'Escape' });
    // A check from a person's panel: it used to be ignored without a word.
    const map = screen.getByRole('main', { name: '제품 지도' });
    // A person's name over their rows opens their details.
    const first = within(map)
      .getAllByRole('region')
      .find((region) => region.dataset.person)!;
    fireEvent.click(within(first).getAllByRole('button')[0]!);
    const person = await screen.findByRole('dialog');
    // The details say it before anything is pressed, since they lie over the map's own line.
    expect(within(person).getByText(/확인이나 고치기는 그 일이 끝나면 할 수 있어요/)).toBeTruthy();
    fireEvent.click(within(person).getAllByRole('button', { name: /AI에게 확인 맡기기|다시 확인 맡기기/ })[0]!);
    expect(await screen.findByText(/AI가 이 프로젝트에서 일하는 중이라 지금은 시작할 수 없어요/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 시도', hidden: true }).hasAttribute('disabled')).toBe(true);
    expect(calls(request, 'flow/prepare')).toEqual([]);
  });
});

describe('a plan shows only what fits a plan (#32)', () => {
  it('has no code checks, and puts a new journey to the plan in planning words', async () => {
    const { request } = mount('/board' + q(app), {
      plan: 'asking',
      sessions: [{ info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', title: '지도' }) }],
    });
    const menu = await mapMenu();
    for (const name of ['기능 더 찾기', '매일 자동으로 확인', '지도 범위 바꾸기'])
      expect(within(menu).queryByRole('menuitem', { name })).toBeNull();
    expect(within(menu).queryByRole('menuitemcheckbox')).toBeNull();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /AI에게 확인 맡기기|맞춰 보기/ })).toBeNull();
    // 여정 추가 goes to the plan's conversation, never to code.
    fireEvent.click((await screen.findAllByRole('button', { name: '여정 추가' }))[0]!);
    fireEvent.change(await screen.findByPlaceholderText('여정 이름 (예: 비밀번호 잊었을 때)'), {
      target: { value: '구독하기' },
    });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await waitFor(() =>
      expect(calls(request, 'session/send')).toContainEqual(
        expect.objectContaining({ sessionId: 'map-1', text: expect.stringContaining('기획에 새 여정 "구독하기"') }),
      ),
    );
    expect(calls(request, 'flow/prepare')).toEqual([]);
  });
});

describe('a plan once its build began is code (#32)', () => {
  it('keeps the code checks after a build stopped halfway', async () => {
    mount('/board' + q(app), {
      plan: 'stopped',
      sessions: [{ info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', title: '지도' }) }],
    });
    expect(await screen.findByText('만들기가 멈췄어요')).toBeTruthy();
    const menu = await mapMenu();
    for (const name of ['기능 더 찾기', '지도 범위 바꾸기'])
      expect(within(menu).getByRole('menuitem', { name })).toBeTruthy();
  });
});

const building = (items: Item[] = []) => [
  { info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', title: '지도' }) },
  { info: sessionInfo({ id: 'build-1', cwd: app, purpose: 'build', title: 'Build the planned product' }), items },
];

describe('the conversation beside the map points at the map (#35)', () => {
  it('says to write in the map’s input, which skips the call and says what to do instead', async () => {
    const { connection, request } = mount('/board' + q(app), { plan: 'building', sessions: building() });
    await connection.request('session/send', { sessionId: 'build-1', text: '이대로 만들어 주세요.' });
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    const card = await within(dock).findByRole('region', { name: '승인 요청' });
    expect(within(card).getByText('다르게 하려면 아래 입력창에 적어 주세요')).toBeTruthy();
    expect(mapInput().getAttribute('placeholder')).toBe('건너뛰고 대신 할 일을 적어 주세요');
    write('그건 하지 말고 테스트만 돌려 줘');
    await waitFor(() =>
      expect(calls(request, 'session/answer')).toContainEqual(
        expect.objectContaining({
          sessionId: 'build-1',
          decision: 'deny',
          feedback: '그건 하지 말고 테스트만 돌려 줘',
        }),
      ),
    );
  });
});

describe('another conversation beside the map is answered where it is shown (#35)', () => {
  it('gets an input of its own while it waits, since the map’s input does not reach it', async () => {
    const open = renderHook(() => useDockOpen());
    act(() => open.result.current[1](true));
    open.unmount();
    const { connection, request, router } = mount('/board' + q(app), {
      sessions: [
        { info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', title: '지도' }) },
        { info: sessionInfo({ id: 'old', cwd: app, title: 'README 다시 쓰기' }) },
      ],
    });
    await connection.request('session/send', { sessionId: 'old', text: 'README를 고쳐 줘' });
    await router.navigate({ to: '/board', search: { project: app, session: 'old' } });
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    expect(await within(dock).findByText('지금 지도 대화가 아닌 다른 대화를 보고 있어요')).toBeTruthy();
    const card = await within(dock).findByRole('region', { name: '승인 요청' });
    expect(within(card).getByText('다르게 하려면 아래 입력창에 적어 주세요')).toBeTruthy();
    const own = within(dock).getByPlaceholderText('어떻게 다르게 할지 적어 주세요');
    fireEvent.change(own, { target: { value: '고치지 말고 읽기만 해 줘' } });
    fireEvent.keyDown(own, { key: 'Enter' });
    await waitFor(() =>
      expect(calls(request, 'session/answer')).toContainEqual(
        expect.objectContaining({ sessionId: 'old', decision: 'deny', feedback: '고치지 말고 읽기만 해 줘' }),
      ),
    );
    // Answered, it is only read here again: the map's input is the one input.
    await waitFor(() => expect(within(dock).queryByPlaceholderText('어떻게 다르게 할지 적어 주세요')).toBeNull());
  });
});

const team: TaskForceItem = {
  id: 'tf-1',
  kind: 'taskforce',
  title: '블로그 만들기',
  steps: [{ title: '화면 만들기', count: 2, model: 'm' }],
  minutes: 30,
  status: 'running',
  members: [],
  step: '',
  log: null,
  needed: null,
  error: null,
  startedAt: new Date().toISOString(),
};

describe('the AI 팀 opens beside the map (#38, #81)', () => {
  it('shows the team in the conversation’s place, by one name, with the way back', async () => {
    mount('/board' + q(app), { plan: 'building', sessions: building([team]) });
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    fireEvent.click(await within(dock).findByRole('button', { name: 'AI 팀 보기' }));
    expect(await within(dock).findByRole('button', { name: '← 대화로 돌아가기' })).toBeTruthy();
    expect(within(dock).queryByText(/TF/)).toBeNull();
    fireEvent.click(within(dock).getByRole('button', { name: '← 대화로 돌아가기' }));
    expect(await within(dock).findByRole('button', { name: 'AI 팀 보기' })).toBeTruthy();
  });
});

describe('memory is reached from the map (#69, #82)', () => {
  it('says suggestions wait, opens the memory from the map, and leads back to the map', async () => {
    const { router } = mount('/board' + q(app));
    // alpine-code has two suggestions waiting in the scripted memory.
    fireEvent.click(await screen.findByRole('button', { name: '기억할까요? 2' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/memory'));
    expect(await screen.findByText('기다리는 제안')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← 지도로' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
    expect(router.state.location.search).toEqual({ project: app });
    // The map's menu has it too, and the memory page's project name goes back to the map.
    fireEvent.click(within(await mapMenu()).getByRole('menuitem', { name: '기억' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/memory'));
    fireEvent.click(await screen.findByRole('link', { name: 'alpine-code' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
  });

  it('offers to try again when the memory could not be read', async () => {
    let fails = true;
    mount('/memory' + q(app), {
      extra: {
        results: {
          'memory/list': () => {
            if (fails) throw new Error('down');
            return { memories: [], pending: [] };
          },
        },
      },
    });
    expect(await screen.findByText('기억을 불러오지 못했어요')).toBeTruthy();
    fails = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('아직 기억한 게 없어요')).toBeTruthy();
  });
});

describe('a deleted map starts over from the code (#72)', () => {
  it('says what goes, draws the map again from the code, and leads to 새 프로젝트 for something new', async () => {
    const { request, router } = mount('/board' + q(app), {
      plan: 'built',
      sessions: [{ info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', title: '지도' }) }],
    });
    fireEvent.click(within(await mapMenu()).getByRole('menuitem', { name: '지도 삭제' }));
    const strip = await screen.findByRole('region', { name: '지도 삭제' });
    expect(within(strip).getByText(/기획 때 정한 답과 화면 스케치/)).toBeTruthy();
    expect(within(strip).getByText(/폴더의 코드와 파일은 그대로 남아요/)).toBeTruthy();
    fireEvent.click(within(strip).getByRole('button', { name: '삭제' }));
    expect(await screen.findByText(/지도를 지웠어요/)).toBeTruthy();
    // No second way to start something new here (map-first 39): the folder has code, so the map is drawn from it.
    expect(screen.queryByRole('button', { name: '처음부터 다시 기획하기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '새 프로젝트로 시작하기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await router.navigate({ to: '/board', search: { project: app } });
    await screen.findByRole('heading', { name: '이 프로젝트를 지도로 펼쳐볼게요' });
    write('');
    await waitFor(() =>
      expect(calls(request, 'flow/prepare')).toContainEqual(expect.objectContaining({ action: 'discover' })),
    );
  });
});

describe("the map's page has one ⋯", () => {
  it("puts the map's own items in the window's ⋯, under 지도", async () => {
    mount('/board' + q(app), {
      plan: 'built',
      sessions: [{ info: sessionInfo({ id: 'map-1', cwd: app, purpose: 'map', title: '지도' }) }],
    });
    const menu = await mapMenu();
    expect(within(menu).getByText('지도')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /^설정/ })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: '지도 삭제' })).toBeTruthy();
    expect(within(menu).getAllByRole('menuitem', { name: '기억' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '지도 메뉴' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '더 보기' })).toHaveLength(1);
  });
});

describe('the same words everywhere (#47, #54, #67, #74, #77, #80, #84, #89)', () => {
  it('says there is no project yet in a first project menu', async () => {
    mount('/', { extra: { results: { 'projects/list': { projects: [], clones: [] } } } });
    fireEvent.click(await screen.findByRole('button', { name: /다른 프로젝트로/ }));
    const list = await screen.findByRole('list', { name: '최근 프로젝트' });
    expect(await within(list).findByText('아직 프로젝트가 없어요.')).toBeTruthy();
    expect(screen.queryByText('이곳에 표시할 대화가 없어요.')).toBeNull();
  });

  it('names the connection settings one way, shows the version plainly, and asks for a missing key with a button', async () => {
    mount('/settings?tab=connection');
    expect(await screen.findByRole('heading', { name: '연결한 곳' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '연결 추가' })).toBeTruthy();
    // A provider whose key is missing: no environment variable name, a button to the key form.
    expect(screen.queryByText(/ZAI_API_KEY/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '키 넣기' }));
    expect(await screen.findByText('API 키로 연결')).toBeTruthy();
    expect(screen.getByText('공급자')).toBeTruthy();
  });

  it('shows the version without the protocol', async () => {
    mount('/settings?tab=general');
    expect(await screen.findByText('버전')).toBeTruthy();
    expect(await screen.findByText(/^Alpine Code /)).toBeTruthy();
    expect(screen.queryByText(/프로토콜/)).toBeNull();
  });

  it('names the developer tools in plain words under ⋯ beside the map', async () => {
    mount('/board' + q(app));
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    fireEvent.click(within(dock).getByRole('button', { name: '더 보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '개발 도구' }));
    for (const name of ['터미널', '바뀐 파일', '파일', 'AI가 실행한 명령'])
      expect(await screen.findByRole('menuitem', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'AI가 실행한 명령' }));
    expect(await within(dock).findByText('AI가 실행한 명령이 없어요.')).toBeTruthy();
  });

  it('shows no 준비 중 places on the agents screen', async () => {
    mount('/agents');
    expect(await screen.findByRole('button', { name: '스킬 쓰기' })).toBeTruthy();
    expect(screen.queryByText('준비 중')).toBeNull();
    expect(screen.queryByText('MCP')).toBeNull();
    expect(screen.queryByText('서브에이전트')).toBeNull();
  });

  it('calls a conversation 대화, and its build record by plain words', async () => {
    mount('/session/plain', {
      sessions: [
        { info: sessionInfo({ id: 'plain', cwd: app, title: '' }) },
        { info: sessionInfo({ id: 'build-1', cwd: app, purpose: 'build', title: 'Build the planned product' }) },
      ],
    });
    const rail = await screen.findByRole('navigation', { name: '주 메뉴' });
    expect(await within(rail).findByText('제목 없는 대화')).toBeTruthy();
    const record = within(rail).getByRole('link', { name: /만든 기록/ });
    expect(record.getAttribute('title')).toMatch(/^만든 기록 · .+에 시작$/);
  });
});

describe('where a new project is made (bundle F)', () => {
  it('says where the usual place is changed, and goes there', async () => {
    const { router } = mount('/');
    fireEvent.click(await screen.findByRole('button', { name: '만들 곳: 새 폴더' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /새 폴더를 만들 곳 바꾸기/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
    expect(router.state.location.search).toEqual({ tab: 'general' });
  });
});

describe('words kept for a conversation that is gone (#34, edge)', () => {
  it('go to the map as a request when the page still names that conversation and the map has none', async () => {
    localStorage.setItem(
      `alpine.product-map.later:${app}`,
      JSON.stringify([{ id: 'w1', to: 'gone', text: '지운 대화에 할 말', failed: true }]),
    );
    const { request } = mount('/board' + q(app) + '&session=gone');
    await waitFor(() =>
      expect(calls(request, 'flow/prepare')).toContainEqual(
        expect.objectContaining({ action: 'request', request: '지운 대화에 할 말' }),
      ),
    );
    expect(calls(request, 'session/send').filter((params) => params.sessionId === 'gone')).toEqual([]);
  });
});
