import type { TerminalProcess } from '@alpine/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';
import { type Script, scriptedConnection, ServerProvider } from '@/shared/server';

import { ProcessControl } from './ProcessControl';

afterEach(cleanup);

it('stops the agent before session processes and leaves uncooperative work visible until force stop', async () => {
  const requests: string[] = [];
  let process: TerminalProcess = {
    id: 'build',
    command: 'build',
    cwd: '/project',
    sessionId: 'chat',
    title: 'Build',
    pty: false,
    pid: 42,
    status: 'running',
    exitCode: null,
    cancelled: false,
    createdAt: 1,
    outputSize: 20,
  };
  const script: Script = {
    results: {
      'processes/list': () => ({ processes: [process] }),
      'session/cancel': ({ sessionId }) => {
        requests.push(`agent:${sessionId}`);
        return {};
      },
      'processes/stop': ({ sessionId }) => {
        requests.push(`processes:${sessionId}`);
        process = { ...process, status: 'stopping', cancelled: true };
        return { processes: [process] };
      },
      'terminals/stop': ({ processId, force }) => {
        requests.push(`${processId}:${String(force)}`);
        process = { ...process, status: 'cancelled', exitCode: -9 };
        return { process };
      },
    },
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <LocaleProvider locale="en">
      <QueryClientProvider client={client}>
        <ServerProvider connection={scriptedConnection(script)}>
          <ProcessControl cwd="/project" sessionId="chat" />
        </ServerProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Stop all' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Stop all' }));
  await screen.findByText('Waiting for exit · still running');
  expect(requests).toEqual(['agent:chat', 'processes:chat']);
  const force = screen.getByRole('button', { name: 'Force stop' });
  await waitFor(() => expect(force.hasAttribute('disabled')).toBe(false));
  fireEvent.click(force);
  await screen.findByText('Stopped');
  expect(requests).toEqual(['agent:chat', 'processes:chat', 'build:true']);
  expect(screen.queryByRole('button', { name: 'Force stop' })).toBeNull();
  client.clear();
});

it('shows the agent purpose alongside its exact command and excludes interactive shells', async () => {
  const inspected: string[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const base: TerminalProcess = {
    id: 'types',
    title: 'Check SDK types',
    command: 'pnpm typecheck',
    cwd: '/project',
    sessionId: 'chat',
    pty: false,
    pid: 42,
    status: 'exited',
    exitCode: 0,
    cancelled: false,
    createdAt: 1,
    outputSize: 100,
  };
  render(
    <LocaleProvider locale="en">
      <QueryClientProvider client={client}>
        <ServerProvider
          connection={scriptedConnection({
            results: {
              'processes/list': ({ kind, sessionId }) => {
                expect(kind).toBe('command');
                expect(sessionId).toBe('chat');
                return { processes: [base, { ...base, id: 'shell', title: 'My shell', kind: 'shell' }] };
              },
            },
          })}
        >
          <ProcessControl cwd="/project" sessionId="chat" onInspectProcess={(id) => inspected.push(id)} />
        </ServerProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  await screen.findByText('Check SDK types');
  expect(screen.getByText('pnpm typecheck')).toBeTruthy();
  expect(screen.getByText('Exit code 0')).toBeTruthy();
  expect(screen.queryByText('My shell')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'View output' }));
  expect(inspected).toEqual(['types']);
  client.clear();
});

it('shows the end of a dev server’s output with its address, and hands an error in it to the AI', async () => {
  const server: TerminalProcess = {
    id: 'dev',
    command: 'npm run dev',
    cwd: '/project',
    sessionId: null,
    title: 'Dev server :5173',
    pty: false,
    pid: 7,
    status: 'running',
    exitCode: null,
    cancelled: false,
    createdAt: Date.now() / 1000 - 12 * 60,
    outputSize: 80,
  };
  const asked: string[] = [];
  const script: Script = {
    results: {
      'processes/list': { processes: [server] },
      'devServers/list': {
        servers: [
          {
            id: 's',
            cwd: '/project',
            command: 'npm run dev',
            port: 5173,
            url: 'http://localhost:5173',
            processId: 'dev',
            status: 'running',
          },
        ],
      },
      'terminals/read': {
        text: '\u001b[32m  VITE ready\u001b[0m\r\nGET /api/posts 200\r\n✘ GET /api/notes 500 TypeError: x\r\n',
        nextOffset: 80,
        total: 80,
        process: server,
      },
    },
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <LocaleProvider locale="ko">
      <QueryClientProvider client={client}>
        <ServerProvider connection={scriptedConnection(script)}>
          <ProcessControl cwd="/project" onAskAI={(text) => asked.push(text)} />
        </ServerProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  expect(await screen.findByText('Alpine이 띄움')).toBeTruthy();
  expect(screen.getByText('12분째')).toBeTruthy();
  expect(await screen.findByText('localhost:5173 · 앱 탭이 이 주소를 보여 줘요')).toBeTruthy();
  expect(await screen.findByText('✘ GET /api/notes 500 TypeError: x')).toBeTruthy();
  expect(screen.getByText('실행 중 1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'AI에게 이 오류 보여 주기' }));
  expect(asked[0]).toContain('`npm run dev` 출력에 오류가 있어요');
  expect(asked[0]).toContain('✘ GET /api/notes 500 TypeError: x');
});
