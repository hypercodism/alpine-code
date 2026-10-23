import { createRouter, RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';

import { PLAN_DEMO_SESSIONS, planDemo } from '@/features/product-map/planDemo';
import {
  chatScript,
  EXAMPLE_MAP,
  flowScript,
  mergeScripts,
  scriptedConnection,
  READ_ONLY_MAP,
  SESSIONS,
  STUDIO_MAP,
  tauriConnection,
  type ServerConnection,
} from '@/shared/server';

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
  // A planned product (dev-blog) walks through planning and building on its map.
  const sessions = [...SESSIONS.map((info) => ({ info })), ...PLAN_DEMO_SESSIONS];
  return scriptedConnection(planDemo(mergeScripts(chatScript({ stepMs: 400, wordMs: 80, sessions }), flowScript(map))));
}

export function App() {
  const [connection] = useState(connect);
  return (
    <Providers connection={connection}>
      <RouterProvider router={router} />
    </Providers>
  );
}
