import type { SessionInfo } from '@alpine/protocol';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';

import { PLAN_DEMO_SESSIONS, PLAN_TEAM_SESSIONS, planDemo } from '@/features/product-map/planDemo';
import {
  chatScript,
  cloudScript,
  EXAMPLE_MAP,
  flowScript,
  mergeScripts,
  NOTHING_CONNECTED,
  scriptedConnection,
  READ_ONLY_MAP,
  SESSIONS,
  sessionInfo,
  STUDIO_MAP,
  tauriConnection,
  type CloudScriptOptions,
  type Item,
  type NewProjectScript,
  type ServerConnection,
} from '@/shared/server';

import { devServersScript } from '@/shared/server/devServersScript';

import { Providers } from './providers';
import { routeTree } from './routeTree.gen';

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

/** Inside Tauri, the real server. In a plain browser (`pnpm dev`), a scripted server that runs sessions, so screens still render. */
function connect(): ServerConnection {
  if ('__TAURI_INTERNALS__' in window) return tauriConnection();
  // Each demo project shows a different map: a realistic service, a small one, one made by a newer version
  // (read-only, with unreadable files), a product being planned, and an empty project for any other folder.
  const map = (cwd: string) =>
    cwd.endsWith('/alpine-code')
      ? STUDIO_MAP
      : cwd.endsWith('/docs-site')
        ? EXAMPLE_MAP
        : cwd.endsWith('/infra-terraform')
          ? READ_ONLY_MAP
          : {};
  const demo = demoOptions();
  // A planned product (dev-blog) walks through planning and building on its map.
  const sessions = [
    ...SESSIONS.map((info) => ({ info })),
    ...PLAN_DEMO_SESSIONS,
    ...(demo.stoppedRuns ? STOPPED_RUNS : []),
    ...(demo.planTeam ? PLAN_TEAM_SESSIONS : []),
  ];
  const connection = scriptedConnection(
    planDemo(
      mergeScripts(
        chatScript({ stepMs: 400, wordMs: 80, sessions, newProject: demo.newProject }),
        flowScript(map),
        devServersScript({ fails: demo.appFails, unknown: demo.appUnknown }),
        demo.cloudOff ? cloudScript({ enabled: false }) : demo.cloud ? cloudScript(demo.cloud) : {},
        demo.noModel ? { results: { 'connections/list': NOTHING_CONNECTED } } : {},
      ),
      { team: demo.planTeam },
    ),
  );
  if (demo.engineStopsAfterMs !== undefined) setTimeout(() => connection.exit(), demo.engineStopsAfterMs);
  return connection;
}

/**
 * For walking a path the demo does not take by itself (setups that cannot be fetched, a project whose AI did not
 * start, Alpine Cloud off, an account signed in with live data, a publish the API refuses, an app that will not
 * open, no model connected, conversations whose run failed or whose model sign-in ended, the server process ending
 * after a while): `alpine.demo` in localStorage, as
 * `{ "newProject": {...}, "cloudOff": true, "noModel": true, "stoppedRuns": true, "engineStopsAfterMs": 3000 }`,
 * `{ "cloud": { "signedIn": true, "data": "live" } }`, `{ "appFails": true }`, `{ "appUnknown": true }` or `{ "planTeam": true }` (dev-blog built by an
 * AI 팀 at work).
 */
function demoOptions(): DemoOptions {
  try {
    return JSON.parse(localStorage.getItem('alpine.demo') ?? '{}') as DemoOptions;
  } catch {
    return {};
  }
}

interface DemoOptions {
  newProject?: NewProjectScript;
  cloudOff?: boolean;
  cloud?: CloudScriptOptions;
  appFails?: boolean;
  /** Nothing in a project says how it runs: 앱 열기 finds no way to start it. */
  appUnknown?: boolean;
  planTeam?: boolean;
  noModel?: boolean;
  stoppedRuns?: boolean;
  engineStopsAfterMs?: number;
}

/** Two conversations of alpine-code that stopped: one whose run failed, one whose model sign-in ended. */
const STOPPED_RUNS: { info: SessionInfo; items: Item[] }[] = [
  {
    info: sessionInfo({ id: 'failed-run', cwd: '/Users/me/alpine-code', title: '테스트 고치기' }),
    items: [
      { id: 'f1', kind: 'user_message', text: '테스트를 고쳐 줘' },
      { id: 'f2', kind: 'run_stopped', reason: 'failed', message: 'APIConnectionError: Connection error.' },
    ],
  },
  {
    info: sessionInfo({ id: 'signed-out-run', cwd: '/Users/me/alpine-code', title: '문서 정리' }),
    items: [
      { id: 's1', kind: 'user_message', text: '문서를 정리해 줘' },
      { id: 's2', kind: 'run_stopped', reason: 'signed_out', message: 'The ChatGPT sign-in expired' },
    ],
  },
];

export function App() {
  const [connection] = useState(connect);
  return (
    <Providers connection={connection}>
      <RouterProvider router={router} />
    </Providers>
  );
}
