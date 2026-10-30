import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Item } from '@/shared/server';
import { LocaleProvider } from '@/shared/i18n';
import { useMemorySheet, useNavigation, useSettingsSheet } from '@/shared/navigation';
import {
  EXAMPLE_MAP,
  flowScript,
  mergeScripts,
  scriptedConnection,
  ServerProvider,
  sessionInfo,
  sessionScript,
  setUpScript,
} from '@/shared/server';
import type { ProjectInfo, SessionInfo } from '@alpine/protocol';

import { routeTree } from './routeTree.gen';

const app = '/Users/me/alpine-code';
const docs = '/Users/me/docs-site';
const q = (path: string) => `?project=${encodeURIComponent(path)}`;
const infos = () => [
  sessionInfo({ id: 'cart', cwd: app, title: '장바구니 고치기' }),
  sessionInfo({ id: 'readme', cwd: docs, title: 'README 다시 쓰기' }),
  sessionInfo({ id: 'deploy', cwd: docs, title: '배포 확인', status: 'waiting' }),
];

function mount(
  path: string,
  sessions: SessionInfo[] = infos(),
  projects?: ProjectInfo[],
  transcripts: Record<string, Item[]> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(),
      sessionScript({ sessions: sessions.map((info) => ({ info, items: transcripts[info.id] })) }),
      flowScript(() => EXAMPLE_MAP),
      ...(projects ? [{ results: { 'projects/list': { projects, clones: [] } } }] : []),
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
  return { router, connection };
}
const at = (project: string, session?: string) =>
  '/board' + q(project) + (session ? `&session=${encodeURIComponent(session)}` : '');

beforeEach(() => {
  localStorage.clear();
  useSettingsSheet.setState({ place: null });
  useMemorySheet.setState({ project: null });
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

describe('independent project browsing', () => {
  it("opens a conversation's address beside its project's board, and the map's own as the board", async () => {
    const { router } = mount('/session/readme', [
      ...infos(),
      sessionInfo({ id: 'map-talk', cwd: app, title: '지도 그려 줘', purpose: 'map' }),
    ]);
    await waitFor(() => expect(router.state.location.href).toBe(at(docs, 'readme')));
    await router.navigate({ to: '/session/$sessionId', params: { sessionId: 'map-talk' } });
    await waitFor(() => expect(router.state.location.href).toBe(at(app)));
    fireEvent.click(await screen.findByRole('button', { name: /^alpine-code · 다른 프로젝트로/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^docs-site(?! 메뉴)/ }));
    await waitFor(() => expect(router.state.location.href).toBe(at(docs)));
  });

  it('keeps project pages when changing project, and ⌘N opens 새 프로젝트 from anywhere', async () => {
    const { router } = mount('/board' + q(app));
    fireEvent.click(await screen.findByRole('button', { name: /^alpine-code · 다른 프로젝트로/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^docs-site(?! 메뉴)/ }));
    await waitFor(() => expect(router.state.location.href).toBe('/board' + q(docs)));
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /설정/ }));
    // Settings is a sheet over the board: the board stays where it was, and closing the sheet is going back.
    const sheet = await screen.findByRole('dialog', { name: '설정' });
    expect(router.state.location.href).toBe('/board' + q(docs));
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull());
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    await waitFor(() => expect(router.state.location.href).toBe('/'));
  });

  it('searches and opens a session with the keyboard', async () => {
    const { router } = mount(at(app, 'cart'));
    await screen.findByRole('main', { name: '제품 보드' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const input = await screen.findByRole('combobox', { name: '프로젝트와 대화 찾기' });
    fireEvent.change(input, { target: { value: 'README' } });
    await screen.findByRole('option', { name: /README 다시 쓰기/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(router.state.location.href).toBe(at(docs, 'readme')));
  });

  it('deletes a conversation from the past conversations, leaving its board when it was open beside it', async () => {
    const { router } = mount(at(app, 'cart'));
    await screen.findByRole('main', { name: '제품 보드' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const search = await screen.findByRole('dialog', { name: '프로젝트와 대화 찾기' });
    // Its button, asked first: Enter never confirms, only a click or ⌘Enter.
    fireEvent.click(within(search).getByRole('button', { name: 'README 다시 쓰기 삭제…' }));
    let ask = await screen.findByRole('alertdialog', { name: 'README 다시 쓰기를 삭제할까요?' });
    fireEvent.keyDown(ask, { key: 'Enter' });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(within(ask).getByRole('button', { name: /삭제/ }));
    await waitFor(() => expect(within(search).queryByRole('option', { name: /README 다시 쓰기/ })).toBeNull());
    // ⌘⌫ on the one chosen: the conversation open beside the board goes, the board stays.
    const input = within(search).getByRole('combobox', { name: '프로젝트와 대화 찾기' });
    fireEvent.change(input, { target: { value: '장바구니' } });
    await within(search).findByRole('option', { name: /장바구니 고치기/, selected: true });
    fireEvent.keyDown(input, { key: 'Backspace', metaKey: true });
    ask = await screen.findByRole('alertdialog', { name: '장바구니 고치기를 삭제할까요?' });
    fireEvent.keyDown(ask, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(router.state.location.href).toBe('/board' + q(app)));
  });

  it('finds older work across twenty projects and two hundred conversations', async () => {
    const projects = Array.from({ length: 20 }, (_, i) => ({
      path: `/Users/me/scale-${i}`,
      name: `scale-${i}`,
      branch: 'main',
      lastUsedAt: new Date().toISOString(),
      archived: false,
      lastAgent: null,
    }));
    const sessions = projects.flatMap((p, i) =>
      Array.from({ length: 10 }, (_, j) =>
        sessionInfo({
          id: `load-${i}-${j}`,
          cwd: p.path,
          title: `업무 ${i}-${j}`,
          pinned: j === 8,
          status: j === 9 ? 'waiting' : 'idle',
          updatedAt: new Date(Date.now() - j * 3_600_000).toISOString(),
        }),
      ),
    );
    const { router } = mount(at('/Users/me/scale-0', 'load-0-0'), sessions, projects);
    await screen.findByRole('main', { name: '제품 보드' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const input = await screen.findByRole('combobox', { name: '프로젝트와 대화 찾기' });
    fireEvent.change(input, { target: { value: '업무 19-9' } });
    await screen.findByRole('option', { name: /업무 19-9/ });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(router.state.location.href).toBe(at('/Users/me/scale-19', 'load-19-9')));
  });

  it('finds a phrase from the transcript that is absent from the title and answer preview', async () => {
    const { router } = mount(at(app, 'cart'), infos(), undefined, {
      readme: [{ id: 'body-only', kind: 'user_message', text: '독특한본문구절을 점검해 줘' }],
    });
    await screen.findByRole('main', { name: '제품 보드' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const input = await screen.findByRole('combobox', { name: '프로젝트와 대화 찾기' });
    fireEvent.change(input, { target: { value: '독특한본문구절' } });
    const found = await screen.findByRole('option', { name: /README 다시 쓰기.*독특한본문구절/ });
    fireEvent.click(found);
    await waitFor(() => expect(router.state.location.href).toBe(at(docs, 'readme')));
  });

  it('cycles conversations in both directions with Ctrl+Tab', async () => {
    const sessions = infos().map((s, i) => ({ ...s, createdAt: `2026-10-01T00:00:0${i}.000Z` }));
    const { router } = mount(at(app, 'cart'), sessions);
    await screen.findByRole('main', { name: '제품 보드' });
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
    await waitFor(() => expect(router.state.location.href).toBe(at(docs, 'readme')));
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(router.state.location.href).toBe(at(app, 'cart')));
  });

  it('opens the last project on its map after navigation state is reloaded', async () => {
    const first = mount('/board' + q(docs));
    await screen.findByRole('main', { name: '제품 보드' });
    await waitFor(() => expect(useNavigation.getState().lastProject).toBe(docs));
    expect(first.router.state.location.href).toBe('/board' + q(docs));
    const saved = localStorage.getItem('alpine.navigation.v1')!;
    cleanup();
    useNavigation.setState({ lastProject: null });
    localStorage.setItem('alpine.navigation.v1', saved);
    await useNavigation.persist.rehydrate();
    const reopened = mount('/');
    await waitFor(() => expect(reopened.router.state.location.href).toBe('/board' + q(docs)));
  });
});
