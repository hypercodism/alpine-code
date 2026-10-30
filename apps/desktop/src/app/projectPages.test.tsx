import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppViewState } from '@/features/app-view/state';
import { LocaleProvider } from '@/shared/i18n';
import { useMemorySheet, useSettingsSheet } from '@/shared/navigation';
import {
  EXAMPLE_MAP,
  flowScript,
  mergeScripts,
  PROJECTS,
  scriptedConnection,
  ServerProvider,
  setUpScript,
} from '@/shared/server';

import { routeTree } from './routeTree.gen';

const cwd = '/Users/me/alpine-code';
const q = (path: string) => `?project=${encodeURIComponent(path)}`;

function mount(path: string, projects = PROJECTS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const connection = scriptedConnection(
    mergeScripts(
      setUpScript(),
      flowScript(() => EXAMPLE_MAP),
      {
        results: { 'projects/list': { projects, clones: [] } },
      },
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
  return router;
}

beforeEach(() => {
  // A project with an app opens on it until another view is picked, for the window's life: each test starts afresh.
  useAppViewState.setState({ views: {}, apps: {}, cards: {}, at: {}, sizes: {} });
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

describe('project pages', () => {
  it('opens the memory from the project menu as a sheet over the window, and Esc goes back to where it was', async () => {
    const router = mount('/board' + q(cwd));
    // A map with screens opens on its app; the board is under it.
    await screen.findByRole('button', { name: '앱', pressed: true });
    fireEvent.click(await screen.findByRole('button', { name: /^alpine-code · 다른 프로젝트로/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'alpine-code 메뉴' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '기억 열기' }));
    const memory = await screen.findByRole('dialog');
    expect(within(memory).getByRole('heading', { name: '기억' })).toBeTruthy();
    expect(within(memory).getByText(/alpine-code에서 일하며 배운 것/)).toBeTruthy();
    expect(router.state.location.href).toBe('/board' + q(cwd));
    fireEvent.keyDown(memory, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: '앱', pressed: true })).toBeTruthy();
  });
});
