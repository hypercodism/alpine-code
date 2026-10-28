import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';
import {
  chatScript,
  cloudScript,
  mergeScripts,
  scriptedConnection,
  ServerError,
  ServerProvider,
  type NewProjectScript,
  type Script,
  type ServerConnection,
} from '@/shared/server';

import { NewProject } from './NewProject';

// The chips in the input send me to Settings; no router runs here.
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
const picked = vi.hoisted(() => ({ folder: null as string | null }));
vi.mock('@/shared/platform', async (original) => ({
  ...(await original<typeof import('@/shared/platform')>()),
  pickFolder: () => Promise.resolve(picked.folder),
}));

const IDEA = '동네 공방 원데이 클래스를 예약받는 페이지를 만들어 줘';
const fast: NewProjectScript = { judgeMs: 0, createMs: 0 };

function mount(newProject: NewProjectScript = fast, overrides: Script = {}, folder: string | null = null) {
  const base = scriptedConnection(mergeScripts(chatScript({ newProject }), overrides));
  const requests: { method: string; params: unknown }[] = [];
  const connection: ServerConnection = {
    request: (method, params) => {
      requests.push({ method, params });
      return base.request(method, params);
    },
    subscribe: base.subscribe,
  };
  const onPlanning = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ServerProvider connection={connection}>
        <LocaleProvider locale="ko">
          <NewProject folder={folder} onPlanning={onPlanning} />
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
  const sent = (method: string) => requests.filter((r) => r.method === method).map((r) => r.params);
  return { onPlanning, sent };
}
const asNew = mount;

async function send(text: string) {
  fireEvent.input(await screen.findByLabelText('메시지'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '보내기' }));
}

const create = async () => fireEvent.click(await screen.findByRole('button', { name: '만들기' }));

beforeEach(() => {
  picked.folder = null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NewProject', () => {
  it('asks what to make, and judges what was sent with newProject and no folder, showing the setups with its pick and why', async () => {
    const { sent } = asNew();
    expect(await screen.findByRole('heading', { name: '무엇을 만들어 볼까요?' })).toBeTruthy();
    expect(screen.getByPlaceholderText('만들고 싶은 앱을 적어 주세요')).toBeTruthy();
    await send(`  ${IDEA}  `);
    expect(await screen.findByText('로그인과 예약 저장이면 웹앱으로 충분해요.')).toBeTruthy();
    expect(sent('projects/judge')).toEqual([{ text: IDEA, locale: 'ko', newProject: true }]);
    expect(screen.getByRole('radio', { name: /^웹앱/ })).toHaveProperty('ariaChecked', 'true');
    expect(screen.getByText('추천')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '이 구성으로 만들어 볼까요?' })).toBeTruthy();
    expect(sent('session/new')).toEqual([]);
  });

  it('is a new app even when what was written sounds like work on a project', async () => {
    const { sent } = asNew();
    await send('첫 화면 버튼을 더 크게 바꿔 줘');
    expect(await screen.findByRole('radiogroup', { name: '구성' })).toBeTruthy();
    expect(sent('session/new')).toEqual([]);
  });

  it('shows the setups with the web app chosen, nobody recommending it and no reason, when the judging fails', async () => {
    const { sent, onPlanning } = asNew({ ...fast, judgeFails: true });
    await send(IDEA);
    expect(await screen.findByRole('radiogroup', { name: '구성' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^웹앱/ })).toHaveProperty('ariaChecked', 'true');
    expect(screen.queryByText('추천')).toBeNull();
    expect(screen.queryByText('로그인과 예약 저장이면 웹앱으로 충분해요.')).toBeNull();
    expect(sent('projects/judge')).toHaveLength(1);
    expect(sent('session/new')).toEqual([]);
    expect(onPlanning).not.toHaveBeenCalled();
  });

  it('does the same when the server answers work on a project anyway', async () => {
    const { sent } = asNew(fast, { results: { 'projects/judge': { judgement: { kind: 'change' } } } });
    await send(IDEA);
    expect(await screen.findByRole('radiogroup', { name: '구성' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^웹앱/ })).toHaveProperty('ariaChecked', 'true');
    expect(screen.queryByText('추천')).toBeNull();
    expect(sent('session/new')).toEqual([]);
  });

  it('leaves out the reason line when the pick has none, but still marks the pick', async () => {
    asNew(fast, {
      results: {
        'projects/judge': { judgement: { kind: 'new', template: 'blank', reason: '', name: 'tool' } },
      },
    });
    await send(IDEA);
    expect(await screen.findByRole('radio', { name: /빈 프로젝트/ })).toHaveProperty('ariaChecked', 'true');
    expect(screen.getByText('추천')).toBeTruthy();
    expect(document.querySelector('p.text-interactive')).toBeNull();
  });

  it("makes the project with the agent shown, not a project's last one, and the setup picked", async () => {
    const { sent, onPlanning } = asNew();
    await send(IDEA);
    await create();
    const open = await screen.findByRole('button', { name: '보드로 가기' });
    expect(sent('projects/create')).toEqual([
      { id: expect.any(String), idea: IDEA, template: 'web-lite', name: 'craft-booking', agent: 'default' },
    ]);
    fireEvent.click(open);
    expect(onPlanning).toHaveBeenCalledWith(expect.stringMatching(/craft-booking$/));
  });

  it('lets the server name the folder when nobody picked a setup', async () => {
    const { sent } = asNew({ ...fast, judgeFails: true });
    await send(IDEA);
    await create();
    await screen.findByRole('button', { name: '보드로 가기' });
    expect(sent('projects/create')).toEqual([expect.objectContaining({ template: 'web-lite', name: '' })]);
  });

  it('says plainly when nothing could be made, and the way back shows the setups again', async () => {
    const { sent } = mount({ ...fast, createFails: 'folder' });
    await send(IDEA);
    await create();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('프로젝트를 만들지 못했어요');
    expect(alert.textContent).toContain('Permission denied');
    expect(screen.getByRole('heading', { name: '만들지 못했어요' })).toBeTruthy();
    expect(screen.queryByText('진행 중')).toBeNull();
    expect(screen.queryByRole('button', { name: '보드로 가기' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '돌아가기' }));
    expect(await screen.findByRole('radiogroup', { name: '구성' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^웹앱/ })).toHaveProperty('ariaChecked', 'true');
    expect(sent('projects/create')).toHaveLength(1);
  });

  it('names a template the server does not have, and one it cannot read the settings for', async () => {
    const failing = (reason: 'not_found' | 'invalid_config'): Script => ({
      results: {
        'projects/create': () => {
          throw new ServerError(-32000, 'x', { reason });
        },
      },
    });
    mount(fast, failing('not_found'));
    await send(IDEA);
    await create();
    expect((await screen.findByRole('alert')).textContent).toContain('이 구성을 찾지 못했어요');
    cleanup();

    mount(fast, failing('invalid_config'));
    await send(IDEA);
    await create();
    expect((await screen.findByRole('alert')).textContent).toContain('설정을 읽지 못했어요');
  });

  it('goes on to the map of the project that was made when only the AI could not start', async () => {
    const { onPlanning } = mount({ ...fast, createFails: 'session' });
    await send(IDEA);
    await create();
    expect(await screen.findByRole('heading', { name: '프로젝트는 만들었어요' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '프로젝트 열기' }));
    expect(onPlanning).toHaveBeenCalledWith('/Users/me/AlpineCode/craft-booking');
  });

  it('says when the folder picked has files in it, and puts the idea back to try another place', async () => {
    mount(fast, {
      results: {
        'projects/create': () => {
          throw new ServerError(-32000, 'x', { reason: 'not_empty' });
        },
      },
    });
    await send(IDEA);
    await create();
    expect((await screen.findByRole('alert')).textContent).toContain('이미 파일이 있어요');
    fireEvent.click(screen.getByRole('button', { name: '돌아가기' }));
    await waitFor(() => expect((screen.getByLabelText('메시지') as HTMLTextAreaElement).value).toBe(IDEA));
  });
});

describe('NewProject where chip', () => {
  it('makes a new folder unless an empty folder is picked, and sends the one picked', async () => {
    const { sent } = mount();
    const chip = await screen.findByRole('button', { name: '만들 곳: 새 폴더' });
    picked.folder = '/Users/me/Developments/devlog';
    fireEvent.click(chip);
    fireEvent.click(await screen.findByRole('menuitem', { name: '이미 만든 빈 폴더 고르기…' }));
    expect(await screen.findByRole('button', { name: '만들 곳: devlog' })).toBeTruthy();
    await send(IDEA);
    await create();
    await screen.findByRole('button', { name: '보드로 가기' });
    expect(sent('projects/create')).toEqual([expect.objectContaining({ folder: '/Users/me/Developments/devlog' })]);
  });

  it('starts with the folder a map asked for', async () => {
    mount(fast, {}, '/Users/me/Developments/devlog');
    expect(await screen.findByRole('button', { name: '만들 곳: devlog' })).toBeTruthy();
  });

  describe('with Alpine Cloud', () => {
    const CHAT = '동호회 사람들이 실시간 채팅으로 모임 장소를 정하는 앱을 만들고 싶어';
    const withPro: NewProjectScript = { ...fast, templates: ['blank', 'web-lite', 'web-pro'], address: true };

    it('makes a web app with its web address when signed in to Alpine, and shows the address the server made', async () => {
      const { sent } = mount(withPro, cloudScript({ signedIn: true, codeMs: 0 }));
      await send(IDEA);
      await create();
      expect(await screen.findByText('craft-booking.alpinesite.app')).toBeTruthy();
      await screen.findByRole('button', { name: '보드로 가기' });
      expect(screen.getByText('인터넷 주소 만들기')).toBeTruthy();
      expect(sent('projects/create')).toHaveLength(1);
    });

    it('leaves no empty address tick behind when the server skipped the step', async () => {
      mount({ ...fast }, cloudScript({ signedIn: true }));
      await send(IDEA);
      await create();
      await screen.findByRole('button', { name: '보드로 가기' });
      expect(screen.queryByText('인터넷 주소 만들기')).toBeNull();
    });

    it('asks a signed-out person to sign in before a realtime web app is made, then goes on by itself', async () => {
      vi.spyOn(window, 'open').mockImplementation(() => null);
      const { sent } = mount(withPro, cloudScript({ signInMs: 0 }));
      await send(CHAT);
      expect(await screen.findByRole('radio', { name: /^실시간 웹앱/ })).toHaveProperty('ariaChecked', 'true');
      await create();
      expect(await screen.findByText('실시간 웹앱을 쓰려면 Alpine 계정이 필요해요 (무료)')).toBeTruthy();
      expect(sent('projects/create')).toEqual([]);

      fireEvent.click(screen.getByRole('button', { name: 'Google로 계속하기' }));
      // A new account is on the free plan, so Pro is the next thing asked for.
      fireEvent.click(await screen.findByRole('button', { name: '7일 무료로 써 보기' }));
      await screen.findByRole('button', { name: '보드로 가기' });
      expect(window.open).toHaveBeenCalledWith(expect.stringContaining('provider=google'), '_blank', 'noopener');
      expect(sent('projects/create')).toEqual([expect.objectContaining({ template: 'web-pro' })]);
    });

    it('offers Pro before a realtime web app on the free plan, and makes it when the free week has started', async () => {
      const { sent } = mount(withPro, cloudScript({ signedIn: true }));
      await send(CHAT);
      await create();
      expect(await screen.findByText(/^실시간 웹앱은 Pro에서 만들 수 있어요/)).toBeTruthy();
      expect(sent('projects/create')).toEqual([]);

      fireEvent.click(screen.getByRole('button', { name: '7일 무료로 써 보기' }));
      await screen.findByRole('button', { name: '보드로 가기' });
      expect(sent('cloud/startTrial')).toHaveLength(1);
      expect(sent('projects/create')).toEqual([expect.objectContaining({ template: 'web-pro' })]);
    });

    it('goes straight on for a realtime web app when the account is on Pro', async () => {
      const { sent } = mount(withPro, cloudScript({ signedIn: true, plan: 'pro' }));
      await send(CHAT);
      await create();
      await screen.findByRole('button', { name: '보드로 가기' });
      expect(sent('cloud/startTrial')).toEqual([]);
      expect(sent('projects/create')).toEqual([expect.objectContaining({ template: 'web-pro' })]);
    });

    it('does not make a realtime web app when the sheet is closed with 뒤로', async () => {
      const { sent } = mount(withPro, cloudScript());
      await send(CHAT);
      await create();
      fireEvent.click(await screen.findByRole('button', { name: '‹ 뒤로' }));
      await waitFor(() => expect(screen.queryByText('실시간 웹앱을 쓰려면 Alpine 계정이 필요해요 (무료)')).toBeNull());
      expect(screen.getByRole('button', { name: '만들기' })).toBeTruthy();
      expect(sent('projects/create')).toEqual([]);
    });

    it("offers Alpine's own Node.js before a web app is made on a Mac without one, and makes it when it is in", async () => {
      const { sent } = mount(fast, cloudScript({ node: 'missing', installMs: 25 }));
      await send(IDEA);
      await create();
      expect(await screen.findByText('웹앱을 만들려면 Node.js가 필요해요')).toBeTruthy();
      expect(screen.getByText('설치할까요? (약 50MB)')).toBeTruthy();
      expect(sent('projects/create')).toEqual([]);

      fireEvent.click(screen.getByRole('button', { name: '설치하고 이어가기' }));
      await screen.findByRole('button', { name: '보드로 가기' });
      expect(sent('projects/installNodeTools')).toHaveLength(1);
      expect(sent('projects/create')).toHaveLength(1);
    });

    it('makes nothing when Node.js is put off, and says when the install fails', async () => {
      const failing = mount(fast, cloudScript({ node: 'missing', installMs: 25, installFails: true }));
      await send(IDEA);
      await create();
      fireEvent.click(await screen.findByRole('button', { name: '설치하고 이어가기' }));
      expect((await screen.findByRole('alert')).textContent).toContain('설치하지 못했어요');
      fireEvent.click(screen.getByRole('button', { name: '나중에' }));
      await waitFor(() => expect(screen.queryByText('웹앱을 만들려면 Node.js가 필요해요')).toBeNull());
      expect(failing.sent('projects/create')).toEqual([]);
      expect(screen.getByRole('button', { name: '만들기' })).toBeTruthy();
    });

    it('does not ask for Node.js for an empty project', async () => {
      const { sent } = mount(fast, cloudScript({ node: 'missing' }));
      await send(IDEA);
      fireEvent.click(await screen.findByRole('radio', { name: /빈 프로젝트/ }));
      await create();
      await screen.findByRole('button', { name: '보드로 가기' });
      expect(sent('projects/installNodeTools')).toEqual([]);
    });
  });
});
