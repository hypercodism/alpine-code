import type { DevServerInfo } from '@alpine/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';
import { mergeScripts, scriptedConnection, ServerProvider, setUpScript } from '@/shared/server';

import { AppView, screenUrl, type AppPerson } from './AppView';

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

function mount(cardId: string) {
  const connection = scriptedConnection(
    mergeScripts(setUpScript(), {
      results: { 'devServers/open': { server: RUNNING }, 'devServers/list': { servers: [RUNNING] } },
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ServerProvider connection={connection}>
        <LocaleProvider locale="ko">
          <AppView
            cwd={cwd}
            name="basecamp"
            people={people}
            cardId={cardId}
            onPick={vi.fn()}
            onAskFix={vi.fn()}
            onAskSetup={vi.fn()}
            onShowTerminal={vi.fn()}
          />
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
}

const frame = () => screen.findByTitle('basecamp 앱', {}, { timeout: 3000 }) as Promise<HTMLIFrameElement>;

afterEach(cleanup);

describe('screenUrl', () => {
  it('carries the situation as the parameter the apps read', () => {
    expect(screenUrl('http://localhost:5173/', '/breads', 'empty')).toBe(
      'http://localhost:5173/breads?alpine-state=empty',
    );
    expect(screenUrl('http://localhost:5173/', '/breads')).toBe('http://localhost:5173/breads');
  });
});

describe('앱 view situations', () => {
  it('shows a button per situation and reloads the app in the one pressed', async () => {
    mount('list');
    expect((await frame()).src).toBe('http://localhost:5173/breads');
    const usual = screen.getByRole('button', { name: '보통' });
    expect(usual.getAttribute('aria-pressed')).toBe('true');

    const empty = screen.getByRole('button', { name: '빵이 하나도 없을 때' });
    fireEvent.click(empty);
    expect((await frame()).src).toBe('http://localhost:5173/breads?alpine-state=empty');
    expect(empty.getAttribute('aria-pressed')).toBe('true');
    expect(usual.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(usual);
    expect((await frame()).src).toBe('http://localhost:5173/breads');
  });

  it('keeps the how-to text and marks promises as the document does', async () => {
    mount('list');
    await frame();
    expect(screen.getByText('?alpine-state=empty 로 열어 보세요')).toBeTruthy();
    const marks = screen.getByRole('list', { name: '빵 목록' }).textContent;
    expect(marks).toContain('✓');
    expect(marks).toContain('✗');
    expect(marks).toContain('○');
  });

  it('shows no buttons on a screen without situations', async () => {
    mount('plain');
    await frame();
    expect(screen.queryByRole('button', { name: '보통' })).toBeNull();
  });
});
