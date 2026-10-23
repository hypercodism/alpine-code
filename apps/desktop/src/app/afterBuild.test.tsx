import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDockOpen, useDockTab } from '@/features/dock/state';
import { blogBoard, type PlanMoment } from '@/features/product-map/planExample';
import { boardScript } from '@/features/product-map/testBoard';
import { LocaleProvider } from '@/shared/i18n';
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
 * After a plan is built (audit theme 3): 앱 열기 shows the app at once, the map has its way to 올리기 and 되돌리기, and
 * the top bar says where the map stands.
 */

vi.mock('@/features/terminal/TerminalScreen', () => ({
  default: ({ label }: { label: string }) => <textarea aria-label={label} />,
}));

const cwd = '/Users/me/alpine-code';

function mount(
  moment: PlanMoment,
  extra: Script = {},
  { cloud = true, build = {} }: { cloud?: boolean; build?: Parameters<typeof sessionInfo>[0] } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(undefined, { enabled: cloud }),
      devServersScript({ upMs: 0 }),
      sessionScript({
        sessions: [
          { info: sessionInfo({ id: 'map-1', cwd, purpose: 'map', title: '지도' }) },
          { info: sessionInfo({ id: 'build-1', cwd, purpose: 'build', title: '만들기', ...build }) },
        ],
      }),
      boardScript(blogBoard(moment)),
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

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alpine.rail.open', 'false');
  const open = renderHook(() => useDockOpen());
  act(() => open.result.current[1](false));
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
  it('starts the project the way it runs and shows it, with no command to type', async () => {
    const { request } = mount('built');
    fireEvent.click(await screen.findByRole('button', { name: '앱 열기' }));
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    expect(within(dock).getByRole('tab', { name: '미리보기', selected: true })).toBeTruthy();
    expect(await within(dock).findByTitle('미리보기', {}, { timeout: 3000 })).toBeTruthy();
    expect(request).toHaveBeenCalledWith('devServers/open', expect.objectContaining({ cwd }));
    expect(request.mock.calls.some(([method]) => method === 'devServers/start')).toBe(false);
    // The command and the port are there, folded under 고급.
    const advanced = within(dock).getByText('고급').closest('details')!;
    expect(advanced.open).toBe(false);
    expect(within(advanced).getByRole('textbox', { hidden: true })).toBeTruthy();
  });

  it('asks for the command under 고급 when nothing in the project says how it runs', async () => {
    mount('built', { results: { 'devServers/open': { server: null } } });
    fireEvent.click(await screen.findByRole('button', { name: '앱 열기' }));
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    expect(await within(dock).findByText(/여는 방법을 찾지 못했어요/)).toBeTruthy();
    expect(within(dock).getByText('고급').closest('details')!.open).toBe(true);
    expect(within(dock).getByRole('button', { name: '서버 실행' })).toBeTruthy();
  });
});

describe('올리기 from the map (#13, #23)', () => {
  it('offers 인터넷에 올리기 beside 앱 열기, which opens the top bar sheet', async () => {
    mount('built');
    const line = (await screen.findByRole('button', { name: '앱 열기' })).closest('section')!;
    fireEvent.click(within(line).getByRole('button', { name: '인터넷에 올리기' }));
    // Signed out, the sheet asks for the account first.
    expect(await screen.findByText('인터넷에 올리려면 Alpine 계정이 필요해요. 무료예요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^올리기/ })).toBeTruthy();
  });

  it('promises nothing online when Alpine Cloud is off', async () => {
    mount('built', {}, { cloud: false });
    await screen.findByRole('button', { name: '앱 열기' });
    expect(screen.queryByRole('button', { name: '인터넷에 올리기' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^올리기/ })).toBeNull();
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
    const bar = (await screen.findByRole('button', { name: '사이드바 열기' })).parentElement!;
    expect(await within(bar).findByText(word)).toBeTruthy();
  });

  it("names the dock tab of the map's conversation 대화 (#88)", async () => {
    mount('built');
    fireEvent.click(await screen.findByRole('button', { name: /^오른쪽 창 열기/ }));
    const dock = await screen.findByRole('complementary', { name: '오른쪽 창' });
    expect(within(dock).getByRole('tab', { name: '대화' })).toBeTruthy();
    expect(within(dock).queryByRole('tab', { name: '요약' })).toBeNull();
  });
});
