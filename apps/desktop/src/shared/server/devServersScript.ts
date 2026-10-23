import type { DevServerInfo } from '@alpine/protocol';

import type { Script } from './scripted';

/** What a running app shows in the browser build's preview: a page standing in for the project's app. */
const PAGE = (name: string) =>
  `data:text/html;charset=utf-8,${encodeURIComponent(
    `<body style="font-family:system-ui;margin:0;padding:32px;background:#fbfaf7;color:#222">` +
      `<h1 style="font-size:22px">${name}</h1><p style="color:#666">첫 글을 써 보세요.</p></body>`,
  )}`;

/**
 * `devServers/*` as the app sees it, for the browser build and tests: 앱 열기 starts the project's server, which comes up
 * after `upMs` and stays until it is stopped. Nothing runs; the preview shows a stand-in page.
 */
export function devServersScript({ upMs = 1200 }: { upMs?: number } = {}): Script {
  const servers: (DevServerInfo & { at: number })[] = [];
  const shown = (server: DevServerInfo & { at: number }): DevServerInfo => {
    const { at, ...info } = server;
    const up = info.status === 'starting' && Date.now() - at >= upMs;
    return up ? { ...info, status: 'running', url: PAGE(info.cwd.split('/').pop() ?? '') } : info;
  };
  const start = (cwd: string, command: string, port: number) => {
    const server = {
      id: `dev-${servers.length + 1}`,
      cwd,
      command,
      port,
      status: 'starting' as const,
      url: null,
      external: false,
      at: Date.now(),
    };
    servers.push(server);
    return shown(server);
  };
  const find = (id: string) => servers.find((server) => server.id === id)!;
  return {
    results: {
      'devServers/list': ({ cwd }) => ({ servers: servers.filter((s) => s.cwd === cwd).map(shown) }),
      'devServers/open': ({ cwd }) => {
        const running = servers.findLast((s) => s.cwd === cwd && (s.status === 'starting' || s.status === 'running'));
        return { server: running ? shown(running) : start(cwd, 'npm run dev', 5173) };
      },
      'devServers/start': ({ cwd, command, port }) => ({ server: start(cwd, command, port) }),
      'devServers/stop': ({ id }) => {
        Object.assign(find(id), { status: 'stopped', url: null });
        return { server: shown(find(id)) };
      },
      'devServers/restart': ({ id }) => {
        Object.assign(find(id), { status: 'stopped', url: null });
        return { server: start(find(id).cwd, find(id).command, find(id).port) };
      },
      'devServers/logs': ({ offset }) => {
        const text = '> npm run dev\n\n  VITE ready\n  ➜  Local:   http://localhost:5173/\n';
        return { text: offset ? '' : text, nextOffset: text.length, total: text.length };
      },
    },
  };
}
