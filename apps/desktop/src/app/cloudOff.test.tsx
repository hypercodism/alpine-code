import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDockOpen, useDockTab } from '@/features/dock/state';
import { useMemorySheet, useNavigation, useSettingsSheet } from '@/shared/navigation';
import { LocaleProvider } from '@/shared/i18n';
import {
  cloudScript,
  EXAMPLE_MAP,
  flowScript,
  mergeScripts,
  scriptedConnection,
  ServerProvider,
  sessionInfo,
  sessionScript,
  setUpScript,
} from '@/shared/server';

import { routeTree } from './routeTree.gen';

/**
 * Shipping hidden (docs/alpine-cloud.md): with Alpine Cloud off the app shows none of it, and with it on the same
 * screens show everything. Both run the whole app on the same scripted server; only `cloud/enabled` differs.
 */
const cwd = '/Users/me/alpine-code';

function mount(path: string, cloud: boolean) {
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(),
      cloudScript({ enabled: cloud, signedIn: true, data: 'live' }),
      { results: { 'devServers/list': { servers: [] } } },
      sessionScript({ sessions: [{ info: sessionInfo({ id: 'work', cwd, title: '장바구니 고치기' }), items: [] }] }),
      flowScript(() => EXAMPLE_MAP),
    ),
  );
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
}

/** Lets `cloud/enabled` and the queries behind it answer, so "not there" means "not there after asking". */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 150)));

beforeEach(() => {
  localStorage.clear();
  useSettingsSheet.setState({ place: null });
  useMemorySheet.setState({ project: null });
  const open = renderHook(() => useDockOpen());
  act(() => open.result.current[1](true));
  open.unmount();
  const tab = renderHook(() => useDockTab());
  act(() => tab.result.current[1](''));
  tab.unmount();
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

const board = '/board?project=' + encodeURIComponent(cwd);
/** Settings, as 더 보기 › 설정 opens it over the board (일반 first). */
const openSettingsSheet = async () => {
  fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: /^설정/ }));
  return screen.findByRole('dialog', { name: '설정' });
};

describe('a board with Alpine Cloud', () => {
  it('has 올리기 in the top bar and 데이터 on the rail', async () => {
    mount(board, true);
    expect(await screen.findByRole('button', { name: /^올리기/ })).toBeTruthy();
    const rail = await screen.findByRole('navigation', { name: '도구' });
    expect(await within(rail).findByRole('button', { name: '데이터' })).toBeTruthy();
  });
});

describe('a board without Alpine Cloud', () => {
  it('has no 올리기 in the top bar and no 데이터 on the rail', async () => {
    mount(board, false);
    const rail = await screen.findByRole('navigation', { name: '도구' });
    expect(within(rail).getByRole('button', { name: '터미널' })).toBeTruthy();
    await settle();
    expect(screen.queryByRole('button', { name: /올리기/ })).toBeNull();
    expect(within(rail).queryByRole('button', { name: '데이터' })).toBeNull();
  });
});

describe('Settings', () => {
  it('shows the Alpine account and the Alpine start row with Alpine Cloud', async () => {
    mount(board, true);
    expect(await within(await openSettingsSheet()).findByText('Alpine 계정')).toBeTruthy();
  });

  it('shows no Alpine account without it, and no Alpine row where a connection is added', async () => {
    mount(board, false);
    const settings = await openSettingsSheet();
    await within(settings).findByText('버전');
    await settle();
    expect(within(settings).queryByText('Alpine 계정')).toBeNull();
    fireEvent.click(within(settings).getByRole('button', { name: /모델 연결/ }));
    fireEvent.click(await within(settings).findByRole('button', { name: /연결 추가/ }));
    const sheet = (await screen.findAllByRole('dialog')).at(-1)!;
    expect(within(sheet).getByRole('button', { name: /ChatGPT/ })).toBeTruthy();
    expect(within(sheet).queryByText(/Alpine으로 시작/)).toBeNull();
  });
});

describe('새 프로젝트', () => {
  it('asks what to make, with Alpine Cloud or without it (map-first 42)', async () => {
    // Opening the app goes back to the last project's map; with none, it is 새 프로젝트.
    useNavigation.setState({ lastProject: null });
    mount('/', false);
    await waitFor(() => expect(screen.getByRole('heading', { name: '무엇을 만들어 볼까요?' })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: '무엇을 바꿔 볼까요?' })).toBeNull();
  });
});
