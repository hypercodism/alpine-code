import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNavigation } from '@/shared/navigation';
import { LocaleProvider } from '@/shared/i18n';
import {
  chatScript,
  cloudScript,
  flowScript,
  mergeScripts,
  PROJECTS,
  scriptedConnection,
  ServerProvider,
  type NewProjectScript,
  type Script,
} from '@/shared/server';

import { routeTree } from './routeTree.gen';

const picked = vi.hoisted(() => ({ folder: null as string | null }));
vi.mock('@/shared/platform', async (original) => ({
  ...(await original<typeof import('@/shared/platform')>()),
  pickFolder: () => Promise.resolve(picked.folder),
}));

/**
 * The whole app on the scripted server, from 새 프로젝트 to the map, the way the user-flow audit of 2026-10-24 walked
 * it (theme 1). `newProject` is how judging and making answer; `extra` overrides the server (Alpine Cloud off, a slow
 * project list). `sent` lists the requests made.
 */
function mount({
  path = '/',
  newProject = {},
  extra = {},
}: { path?: string; newProject?: NewProjectScript; extra?: Script } = {}) {
  const sent: { method: string; params: Record<string, unknown> }[] = [];
  const base = scriptedConnection(
    mergeScripts(
      chatScript({ newProject: { judgeMs: 0, createMs: 0, ...newProject } }),
      flowScript(() => ({})),
      extra,
    ),
  );
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
  return { router, sent: (method: string) => sent.filter((r) => r.method === method).map((r) => r.params) };
}

const IDEA = '동네 공방 원데이 클래스를 예약받는 페이지를 만들어 줘';
const send = async (text = IDEA) => {
  fireEvent.input(await screen.findByLabelText('메시지'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '보내기' }));
};
const go = (router: ReturnType<typeof mount>['router'], to: string) => act(() => router.navigate({ to }));
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 150)));

beforeEach(() => {
  localStorage.clear();
  picked.folder = null;
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

describe('새 프로젝트, as the audit walked it', () => {
  it('#2: when the setups cannot be fetched it says why before any setup, and 다시 해 보기 asks again', async () => {
    const { sent } = mount({ newProject: { judgeFails: 'unreachable' } });
    await send();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', { name: '구성을 받지 못했어요' })).toBeTruthy();
    expect(alert.textContent).toContain('인터넷 연결을 확인한 뒤 다시 해 보세요');
    expect(screen.queryByRole('radiogroup', { name: '구성' })).toBeNull();
    expect(screen.queryByRole('button', { name: '만들기' })).toBeNull();
    // What git said is in English: folded away, for whoever has to look into it.
    const detail = alert.querySelector('details')!;
    expect(detail.open).toBe(false);
    expect(within(detail).getByText('자세한 내용')).toBeTruthy();
    expect(detail.textContent).toContain('git clone failed');
    fireEvent.click(screen.getByRole('button', { name: '다시 해 보기' }));
    await waitFor(() => expect(sent('projects/judge')).toHaveLength(2));
    expect(sent('projects/judge')[1]).toEqual(sent('projects/judge')[0]);
  });

  it('#2: without git it offers to install it, and with nowhere to fetch from it says to update', async () => {
    mount({ newProject: { judgeFails: 'no_git_tools' } });
    await send();
    expect((await screen.findByRole('alert')).textContent).toContain('Apple 개발 도구가 필요해요');
    expect(screen.getByRole('button', { name: '설치하기' })).toBeTruthy();
    cleanup();
    mount({ newProject: { judgeFails: 'not_found' } });
    await send();
    expect((await screen.findByRole('alert')).textContent).toContain('최신 버전으로 업데이트');
  });

  it('#3: with Alpine Cloud off there is no paid realtime web app, no sign-in and no promise of the internet', async () => {
    const { sent } = mount({
      newProject: { templates: ['blank', 'web-lite', 'web-pro'] },
      extra: cloudScript({ enabled: false }),
    });
    await send('동호회 사람들이 실시간 채팅으로 모임 장소를 정하는 앱을 만들고 싶어');
    const setups = await screen.findByRole('radiogroup', { name: '구성' });
    await settle();
    expect(within(setups).queryByRole('radio', { name: /실시간 웹앱/ })).toBeNull();
    expect(screen.queryByText(/유료/)).toBeNull();
    // The stand-in picked the realtime web app; it is not offered, so the usual setup is chosen and nobody recommends.
    expect(within(setups).getByRole('radio', { name: /^웹앱/ })).toHaveProperty('ariaChecked', 'true');
    expect(screen.queryByText('추천')).toBeNull();
    expect(screen.queryByText(/인터넷 주소|인터넷에 올릴|인터넷에는/)).toBeNull();
    // Visitors and where it runs only matter on the internet.
    expect(screen.queryByText(/방문자/)).toBeNull();
    expect(screen.queryByText(/Cloudflare/)).toBeNull();
    expect(screen.getByText('이 Mac에 만들어요.')).toBeTruthy();
    fireEvent.click(within(setups).getByRole('radio', { name: /빈 프로젝트/ }));
    expect(screen.queryByText(/인터넷에 올릴/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '만들기' }));
    await screen.findByRole('button', { name: '보드로 가기' });
    expect(screen.queryByText('Alpine 계정')).toBeNull();
    expect(sent('projects/create')).toEqual([expect.objectContaining({ template: 'blank' })]);
  });

  it('#20: leaving while it is being made and coming back shows how far it got, and how it ended', async () => {
    const { router } = mount({ newProject: { createMs: 60 } });
    await send();
    fireEvent.click(await screen.findByRole('button', { name: '만들기' }));
    expect(await screen.findByRole('heading', { name: '만드는 중이에요' })).toBeTruthy();
    await go(router, '/settings');
    await settle();
    await go(router, '/');
    expect(await screen.findByRole('heading', { name: /만드는 중이에요|프로젝트를 만들었어요/ })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: '보드로 가기' }, { timeout: 3000 }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
    // Done with: the next 새 프로젝트 starts empty.
    await go(router, '/');
    expect(await screen.findByRole('heading', { name: '무엇을 만들어 볼까요?' })).toBeTruthy();
  });

  it('#20: a made project seen and left through the rail is not shown again on 새 프로젝트', async () => {
    const { router } = mount();
    await send();
    fireEvent.click(await screen.findByRole('button', { name: '만들기' }));
    await screen.findByRole('button', { name: '보드로 가기' });
    await act(() => router.navigate({ to: '/board', search: { project: PROJECTS[0]!.path } }));
    await settle();
    await go(router, '/');
    expect(await screen.findByRole('heading', { name: '무엇을 만들어 볼까요?' })).toBeTruthy();
    expect(screen.queryByText(IDEA)).toBeNull();
    expect(screen.getByRole('button', { name: '만들 곳: 새 폴더' })).toBeTruthy();
  });

  it('#20: made while I was away and then opened from the rail, it is not told again on 새 프로젝트', async () => {
    const { router, sent } = mount({ newProject: { createMs: 30 } });
    await send();
    fireEvent.click(await screen.findByRole('button', { name: '만들기' }));
    await go(router, '/settings');
    await settle();
    // Opening it from the rail makes it the last project, as on the real server where it is listed.
    await waitFor(() => expect(sent('projects/create')).toHaveLength(1));
    act(() => useNavigation.getState().rememberProject('/Users/me/AlpineCode/craft-booking'));
    await go(router, '/');
    expect(await screen.findByRole('heading', { name: '무엇을 만들어 볼까요?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '보드로 가기' })).toBeNull();
  });

  it('#20: leaving while the setups are shown keeps the idea and the setup I chose', async () => {
    const { router } = mount();
    await send();
    fireEvent.click(await screen.findByRole('radio', { name: /빈 프로젝트/ }));
    await go(router, '/agents');
    await go(router, '/');
    expect(await screen.findByText(IDEA)).toBeTruthy();
    expect(screen.getByRole('radio', { name: /빈 프로젝트/ })).toHaveProperty('ariaChecked', 'true');
  });

  it('#27: a folder with files in it is not taken: it says so at once and offers to open it as a project', async () => {
    const { router, sent } = mount();
    picked.folder = PROJECTS[1]!.path;
    fireEvent.click(await screen.findByRole('button', { name: '만들 곳: 새 폴더' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '이미 만든 빈 폴더 고르기…' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(`‘${PROJECTS[1]!.name}’ 폴더에는 이미 파일이 있어요`);
    expect(screen.getByRole('button', { name: '만들 곳: 새 폴더' })).toBeTruthy();
    expect(sent('projects/judge')).toEqual([]);
    fireEvent.click(within(alert).getByRole('button', { name: '프로젝트로 열기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
    expect(router.state.location.search).toEqual({ project: PROJECTS[1]!.path });
  });

  it('#27: a picked folder is taken at once, so sending before it is looked into makes the project there', async () => {
    let answer: () => void = () => {};
    const looked = new Promise<void>((resolve) => (answer = resolve));
    const { sent } = mount({
      extra: {
        results: {
          'files/list': async () => {
            await looked;
            return { entries: [], nextOffset: 0, hasMore: false };
          },
        },
      },
    });
    picked.folder = '/Users/me/Developments/devlog';
    fireEvent.click(await screen.findByRole('button', { name: '만들 곳: 새 폴더' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '이미 만든 빈 폴더 고르기…' }));
    expect(await screen.findByRole('button', { name: '만들 곳: devlog' })).toBeTruthy();
    await send();
    fireEvent.click(await screen.findByRole('button', { name: '만들기' }));
    answer();
    await screen.findByRole('button', { name: '보드로 가기' });
    expect(sent('projects/create')).toEqual([expect.objectContaining({ folder: '/Users/me/Developments/devlog' })]);
  });

  it('#27: an empty folder, or one with only git in it, is taken', async () => {
    mount();
    picked.folder = '/Users/me/Developments/devlog';
    fireEvent.click(await screen.findByRole('button', { name: '만들 곳: 새 폴더' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '이미 만든 빈 폴더 고르기…' }));
    expect(await screen.findByRole('button', { name: '만들 곳: devlog' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('#57: opening the app on the way to the last map never shows 새 프로젝트 first', async () => {
    useNavigation.setState({ lastProject: PROJECTS[0]!.path });
    let answer: () => void = () => {};
    const listed = new Promise<void>((resolve) => (answer = resolve));
    const seen: boolean[] = [];
    const { router } = mount({
      extra: {
        results: {
          'projects/list': async () => {
            await listed;
            return { projects: PROJECTS, clones: [] };
          },
        },
      },
    });
    const observer = new MutationObserver(() => seen.push(!!screen.queryByText('무엇을 만들어 볼까요?')));
    observer.observe(document.body, { subtree: true, childList: true });
    await settle();
    expect(screen.queryByText('무엇을 만들어 볼까요?')).toBeNull();
    answer();
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
    observer.disconnect();
    expect(seen.some(Boolean)).toBe(false);
  });

  it('#57: with no last project, 새 프로젝트 shows once the projects are known', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: '무엇을 만들어 볼까요?' })).toBeTruthy();
  });

  it('#59: 새 프로젝트 is in no project: the top bar names none and the menu marks none', async () => {
    useNavigation.setState({ lastProject: PROJECTS[0]!.path });
    const { router } = mount({ path: `/board?project=${encodeURIComponent(PROJECTS[0]!.path)}` });
    expect(await screen.findByRole('button', { name: `${PROJECTS[0]!.name} · 다른 프로젝트로` })).toBeTruthy();
    await go(router, '/');
    await screen.findByRole('heading', { name: '무엇을 만들어 볼까요?' });
    const name = screen.getByRole('button', { name: '새 프로젝트 · 다른 프로젝트로' });
    fireEvent.click(name);
    const list = await screen.findByRole('list', { name: '최근 프로젝트' });
    expect(list.querySelector('[aria-current]')).toBeNull();
  });

  it('#61: when the project was made but the AI did not start, 다시 시작 plans the same idea on its map', async () => {
    const { router, sent } = mount({ newProject: { createFails: 'session' } });
    await send();
    fireEvent.click(await screen.findByRole('button', { name: '만들기' }));
    expect(await screen.findByRole('heading', { name: '프로젝트는 만들었어요' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다시 시작' }));
    fireEvent.click(await screen.findByRole('button', { name: '보드로 가기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/board'));
    const [made] = sent('flow/prepare');
    expect(made).toEqual(expect.objectContaining({ action: 'plan', request: IDEA }));
    expect(sent('session/new')).toEqual([expect.objectContaining({ purpose: 'map', cwd: made!.cwd })]);
    expect(sent('session/send')).toEqual([expect.objectContaining({ sessionId: made!.sessionId })]);
  });

  it('#65: 고치기 puts what I sent back in the input, at the setups and while it judges', async () => {
    const { sent } = mount({ newProject: { judgeMs: 50 } });
    await send();
    fireEvent.click(await screen.findByRole('button', { name: '보낸 글 고치기' }));
    expect(await screen.findByRole('heading', { name: '무엇을 만들어 볼까요?' })).toBeTruthy();
    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe(IDEA);
    // The answer to what was taken back does not come up afterwards.
    await settle();
    expect(screen.queryByRole('radiogroup', { name: '구성' })).toBeNull();

    await send(`${IDEA} 사진도 올릴 수 있게`);
    await screen.findByRole('radiogroup', { name: '구성' });
    fireEvent.click(screen.getByRole('button', { name: '보낸 글 고치기' }));
    expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe(`${IDEA} 사진도 올릴 수 있게`);
    expect(sent('projects/judge')).toHaveLength(2);
  });
});
