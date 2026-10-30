import type { DevServerInfo } from '@alpine/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';
import { mergeScripts, scriptedConnection, ServerProvider, setUpScript } from '@/shared/server';

import { AppView, screenUrl, type AppPerson } from './AppView';
import { useAppViewState } from './state';

const cwd = '/Users/me/basecamp';
const RUNNING: DevServerInfo = {
  id: 'dev-1',
  cwd,
  command: 'npm run dev',
  port: 5173,
  status: 'running',
  url: 'http://localhost:5173/',
  external: false,
};

const people: AppPerson[] = [
  {
    id: 'p1',
    name: '손님',
    tone: 1,
    journeys: [
      {
        id: 'j1',
        title: '빵 고르기',
        device: 'computer',
        screens: [
          {
            id: 'list',
            title: '빵 목록',
            path: '/breads',
            real: true,
            howToTry: '?alpine-state=empty 로 열어 보세요',
            situations: [
              { id: 'empty', title: '빵이 하나도 없을 때' },
              { id: 'error', title: '불러오지 못했을 때' },
            ],
            promises: [
              { id: 'a', text: '빵이 보여요', status: 'passed', note: '' },
              { id: 'b', text: '값이 보여요', status: 'failed', note: '값이 없어요' },
              { id: 'c', text: '검색돼요', status: 'other', note: '' },
            ],
          },
          { id: 'plain', title: '소개', path: '/about', real: false, howToTry: '', promises: [] },
        ],
      },
    ],
  },
];

function mount(cardId: string, { server = RUNNING, list = people } = {}) {
  const connection = scriptedConnection(
    mergeScripts(setUpScript(), {
      results: { 'devServers/open': { server }, 'devServers/list': { servers: [server] } },
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onAskFixBroken = vi.fn();
  const onPick = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ServerProvider connection={connection}>
        <LocaleProvider locale="ko">
          <AppView
            cwd={cwd}
            name="basecamp"
            people={list}
            cardId={cardId}
            onPick={onPick}
            onAskFix={vi.fn()}
            onAskFixBroken={onAskFixBroken}
            onAskSetup={vi.fn()}
            onShowTerminal={vi.fn()}
          />
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
  return { onAskFixBroken, onPick };
}

const frame = () => screen.findByTitle('basecamp 앱', {}, { timeout: 3000 }) as Promise<HTMLIFrameElement>;

const kept = (list: AppPerson[]): AppPerson[] =>
  list.map((person) => ({
    ...person,
    journeys: person.journeys.map((journey) => ({
      ...journey,
      screens: journey.screens.map((one) => ({
        ...one,
        promises: one.promises.map((promise) => ({ ...promise, status: 'passed' as const })),
      })),
    })),
  }));

afterEach(() => {
  cleanup();
  useAppViewState.setState({ views: {}, apps: {}, cards: {}, at: {}, sizes: {} });
});

describe('screenUrl', () => {
  it('carries the situation as the parameter the apps read', () => {
    expect(screenUrl('http://localhost:5173/', '/breads', 'empty')).toBe(
      'http://localhost:5173/breads?alpine-state=empty',
    );
    expect(screenUrl('http://localhost:5173/', '/breads')).toBe('http://localhost:5173/breads');
  });
});

describe('앱 view', () => {
  it('opens the app through the relay, whose bridge lets it be used in the frame', async () => {
    mount('list', { server: { ...RUNNING, boardUrl: 'http://127.0.0.1:61000/' } });
    const app = await frame();
    expect(app.src).toBe('http://127.0.0.1:61000/breads');
    expect(app.name).toBe('alpine-app');
  });

  it('names the screen on view and follows the screen the app says it moved to', async () => {
    mount('list');
    const app = await frame();
    expect(screen.getByRole('button', { name: '보고 있는 화면 · 다른 화면으로 가기' }).textContent).toContain(
      '빵 목록',
    );
    act(() => {
      dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'alpine:layout', screen: null, href: '/about' },
          source: app.contentWindow,
        }),
      );
    });
    expect(screen.getByRole('button', { name: '보고 있는 화면 · 다른 화면으로 가기' }).textContent).toContain('소개');
    expect(useAppViewState.getState().at[cwd]).toBe('plain');
  });

  it("goes back in the app's own history", async () => {
    mount('list');
    const app = await frame();
    const sent = vi.spyOn(app.contentWindow!, 'postMessage');
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(sent).toHaveBeenCalledWith({ type: 'alpine:history', step: -1 }, '*');
  });

  it('puts a red line over the app only while it breaks a promise, and hands it to the AI', async () => {
    const { onAskFixBroken } = mount('list');
    await frame();
    const line = screen.getByRole('alert');
    expect(line.textContent).toContain('빵 목록: 값이 보여요');
    fireEvent.click(screen.getByRole('button', { name: '고쳐 달라고 하기' }));
    expect(onAskFixBroken).toHaveBeenCalledWith([
      expect.objectContaining({ promise: expect.objectContaining({ id: 'b' }) }),
    ]);
  });

  it('shows no red line and no promise counts when everything holds', async () => {
    mount('list', { list: kept(people) });
    await frame();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/통과|고칠 곳/)).toBeNull();
  });
});
