import type { ScreenRead, ScreensCaptureParams } from '@alpine/protocol';
import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';

import { inTauri } from '@/shared/platform';

import { useServer } from './context';

/** What the window's capture command (`capture.rs`) answers. */
interface Capture {
  image: string | null;
  read: string | null;
  error: string | null;
}

/**
 * Answers the AI's `app_screen` (`screens/capture`): the screen is opened out of sight by the app (a window that is
 * never shown), photographed and read, and the picture and what it says go back as `screens/captured`. Outside the
 * Mac app there is no window to open it in, and the AI is told so. Mounted once, at the app's root.
 */
export function useScreenCaptures() {
  const server = useServer();
  useEffect(
    () =>
      server.subscribe((notification) => {
        if (notification.method !== 'screens/capture') return;
        const request = notification.params as ScreensCaptureParams;
        void (async () => {
          const answer = (fields: { image?: string | null; read?: ScreenRead | null; error?: string | null }) =>
            server.request('screens/captured', { id: request.id, ...fields }).catch(() => undefined);
          if (!inTauri()) return answer({ error: 'The screen can be seen only in the Alpine app.' });
          try {
            const capture = await invoke<Capture>('capture_screen', {
              url: request.url,
              width: request.width,
              height: request.height,
              whole: true,
            });
            let read: ScreenRead | null = null;
            try {
              read = capture.read ? (JSON.parse(capture.read) as ScreenRead) : null;
            } catch {
              read = null;
            }
            return answer({ image: capture.image, read, error: capture.error });
          } catch (error) {
            return answer({ error: error instanceof Error ? error.message : String(error) });
          }
        })();
      }),
    [server],
  );
}
