import { createRouter, RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';

import { PLAN_DEMO_SESSIONS, planDemo } from '@/features/product-map/planDemo';
import {
  chatScript,
  cloudScript,
  EXAMPLE_MAP,
  flowScript,
  mergeScripts,
  scriptedConnection,
  READ_ONLY_MAP,
  SESSIONS,
  STUDIO_MAP,
  tauriConnection,
  type CloudScriptOptions,
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
  const sessions = [...SESSIONS.map((info) => ({ info })), ...PLAN_DEMO_SESSIONS];
  return scriptedConnection(
    planDemo(
      mergeScripts(
        chatScript({ stepMs: 400, wordMs: 80, sessions, newProject: demo.newProject }),
        flowScript(map),
        devServersScript(),
        demo.cloudOff ? cloudScript({ enabled: false }) : demo.cloud ? cloudScript(demo.cloud) : {},
      ),
    ),
  );
}

/**
 * For walking a path the demo does not take by itself (setups that cannot be fetched, a project whose AI did not
 * start, Alpine Cloud off, an account signed in with live data or a publish the API refuses): `alpine.demo` in
 * localStorage, as `{ "newProject": {...}, "cloudOff": true }` or `{ "cloud": { "signedIn": true, "data": "live" } }`.
 */
function demoOptions(): { newProject?: NewProjectScript; cloudOff?: boolean; cloud?: CloudScriptOptions } {
  try {
    return JSON.parse(localStorage.getItem('alpine.demo') ?? '{}') as {
      newProject?: NewProjectScript;
      cloudOff?: boolean;
      cloud?: CloudScriptOptions;
    };
  } catch {
    return {};
  }
}

export function App() {
  const [connection] = useState(connect);
  return (
    <Providers connection={connection}>
      <RouterProvider router={router} />
    </Providers>
  );
}
