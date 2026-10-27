import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';
import { scriptedConnection, ServerProvider } from '@/shared/server';

import { ScreenFiles } from './ScreenFiles';
import { boardScript, bookingBoard } from './testBoard';

/** The 코드 tab's list: the app's own files by screen, checks, tools and fonts folded away at the bottom. */

afterEach(cleanup);

function mount() {
  const board = bookingBoard();
  const node = (id: string) => board.document!.nodes!.find((n) => n.id === id)!;
  node('browse').sources = ['src/App.tsx', 'scripts/verify-x.mjs'];
  node('cart').sources = ['src/cart.tsx', 'scripts/verify-x.mjs', 'public/fonts/Mono.woff2'];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  render(
    <QueryClientProvider client={client}>
      <ServerProvider connection={scriptedConnection(boardScript(board))}>
        <LocaleProvider locale="ko">
          <ScreenFiles cwd="/Users/me/shop" selected={null} onOpen={() => {}} onBrowse={() => {}} />
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
}

describe('the 코드 tab list', () => {
  it('lists the app code by screen and keeps scripts and fonts in a folded group', async () => {
    mount();
    const app = await screen.findByTitle('src/App.tsx');
    expect(app.closest('details')).toBeNull();
    const group = screen.getByText('검사·도구·글꼴 파일 2개').closest('details')!;
    expect(group.open).toBe(false);
    expect(within(group).getByTitle('scripts/verify-x.mjs')).toBeTruthy();
    expect(within(group).getByTitle('public/fonts/Mono.woff2')).toBeTruthy();
    expect(screen.queryByText('여러 화면이 함께 쓰는 파일')).toBeNull();
  });
});
