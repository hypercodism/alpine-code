import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';
import { openSettings, useMemorySheet, useSettingsSheet, type SettingsPlace } from '@/shared/navigation';
import {
  ALPINE_CONNECTION,
  CONNECTED,
  mergeScripts,
  scriptedConnection,
  ServerProvider,
  setUpScript,
  type CloudScriptOptions,
  type Script,
} from '@/shared/server';

import { routeTree } from './routeTree.gen';

/** Settings and the accounts in it, on the whole app over a scripted server (user-flow audit, theme 6). */
function mount(place: SettingsPlace, cloud: CloudScriptOptions = {}, ...more: Script[]) {
  const connection = scriptedConnection(
    mergeScripts(setUpScript(undefined, cloud), { results: { 'devServers/list': { servers: [] } } }, ...more),
  );
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ServerProvider connection={connection}>
        <LocaleProvider locale="ko">
          <RouterProvider router={router} />
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
  act(() => openSettings(place));
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 150)));

/** A sheet opened from inside settings, over it. */
const overSettings = () => screen.findByRole('dialog', { name: (name) => name !== '설정' });

/** The row of a connection in Settings › 모델 연결, found by its name. */
const row = async (name: string) =>
  (await screen.findByRole('heading', { name, level: 3 })).closest<HTMLElement>('div.flex')!;

beforeEach(() => {
  localStorage.clear();
  useSettingsSheet.setState({ place: null });
  useMemorySheet.setState({ project: null });
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

describe('Settings places (#12)', () => {
  it('has only places with something in them, and opens on the one asked for', async () => {
    mount('general');
    const places = within(await screen.findByRole('navigation', { name: '설정' })).getAllByRole('button');
    expect(places.map((place) => place.textContent)).toEqual(['에이전트', '모델 연결', '일반', '닫기']);
    expect(screen.getByRole('button', { name: '일반' }).getAttribute('aria-current')).toBe('page');
    expect(await screen.findByText('버전')).toBeTruthy();
  });
});

describe('where projects go (#48)', () => {
  it('says new projects are made there too', async () => {
    mount('general');
    expect(await screen.findByText('프로젝트를 두는 곳')).toBeTruthy();
    expect(screen.getByText('새로 만드는 프로젝트와 받은 프로젝트가 이 폴더 안에 생겨요.')).toBeTruthy();
    expect(screen.queryByText('받은 프로젝트를 두는 곳')).toBeNull();
  });
});

describe('the Alpine connection (#44, #45)', () => {
  it('signed out but still listed: offers 다시 로그인 and 연결 삭제, not 로그아웃', async () => {
    const signedOut = {
      results: {
        'connections/list': {
          ...CONNECTED,
          connections: [...CONNECTED.connections, { ...ALPINE_CONNECTION, hasKey: false }],
        },
      },
    } satisfies Script;
    mount('connection', {}, signedOut);
    const alpine = await row('Alpine');
    expect(within(alpine).getByText('로그인이 끝났어요 · 다시 로그인하면 이어서 써요')).toBeTruthy();
    fireEvent.click(within(alpine).getByRole('button', { name: 'Alpine 더보기' }));
    expect(await screen.findByRole('menuitem', { name: '연결 삭제…' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /로그아웃/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: '연결 삭제…' })).toBeNull());

    fireEvent.click(within(alpine).getByRole('button', { name: '다시 로그인' }));
    const sheet = await overSettings();
    expect(within(sheet).getByText('Alpine으로 시작')).toBeTruthy();
    expect(await within(sheet).findByRole('button', { name: 'Google로 계속하기' })).toBeTruthy();
  });

  it('signing out from the connection row asks the same as Settings › General, and then the row is gone', async () => {
    mount('connection', { signedIn: true });
    const alpine = await row('Alpine');
    fireEvent.click(within(alpine).getByRole('button', { name: 'Alpine 더보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '로그아웃…' }));
    const ask = await screen.findByRole('alertdialog');
    expect(within(ask).getByText('Alpine에서 로그아웃할까요?')).toBeTruthy();
    expect(within(ask).getByText(/올려 둔 앱은 그대로예요/)).toBeTruthy();
    fireEvent.click(within(ask).getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Alpine', level: 3 })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('goes to the account in 일반 from the connection row', async () => {
    mount('connection', { signedIn: true });
    const alpine = await row('Alpine');
    fireEvent.click(within(alpine).getByRole('button', { name: 'Alpine 더보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Alpine 계정 보기' }));
    expect(await screen.findByText('Alpine 계정')).toBeTruthy();
    expect(screen.getByText(/^크레딧 300 남음/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '일반' }).getAttribute('aria-current')).toBe('page');
  });
});

describe('a ChatGPT connection (#46)', () => {
  it('can be deleted after signing out', async () => {
    mount('connection');
    let chatgpt = await row('ChatGPT');
    fireEvent.click(within(chatgpt).getByRole('button', { name: 'ChatGPT 더보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '로그아웃' }));
    chatgpt = await row('ChatGPT');
    await within(chatgpt).findByRole('button', { name: '다시 로그인' });
    fireEvent.click(within(chatgpt).getByRole('button', { name: 'ChatGPT 더보기' }));
    expect(screen.queryByRole('menuitem', { name: '로그아웃' })).toBeNull();
    fireEvent.click(await screen.findByRole('menuitem', { name: '연결 삭제…' }));
    const ask = await screen.findByRole('alertdialog');
    expect(within(ask).getByText(/로그인 정보를 지우고/)).toBeTruthy();
    fireEvent.click(within(ask).getByRole('button', { name: /^삭제/ }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'ChatGPT', level: 3 })).toBeNull());
  });
});

describe('managing models (#53)', () => {
  it('says switches are kept at once, and 완료 closes', async () => {
    mount('connection');
    const anthropic = await row('Anthropic');
    fireEvent.click(within(anthropic).getByRole('button', { name: '모델 관리' }));
    const sheet = await overSettings();
    expect(within(sheet).getByText('바꾼 건 바로 저장돼요.')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: '완료' }));
    await settle();
    await waitFor(() => expect(screen.queryByText('바꾼 건 바로 저장돼요.')).toBeNull());
    expect(screen.getByRole('dialog', { name: '설정' })).toBeTruthy();
  });
});
