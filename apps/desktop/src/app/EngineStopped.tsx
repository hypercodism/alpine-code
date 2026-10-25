import { Button } from '@alpine/ui/primitives';
import { useEffect, useState } from 'react';

import { useMessages } from '@/shared/i18n';
import { restartApp } from '@/shared/platform';
import { SERVER_EXITED, useServer } from '@/shared/server';

import { messages } from './messages';

/**
 * The app's engine (the server process) stopped: nothing the window asks can be answered any more, and what waited
 * has failed. Says so across the window, with the way back, starting the app again; projects, maps and conversations
 * are on disk and come back.
 */
export function EngineStopped() {
  const t = useMessages(messages);
  const server = useServer();
  const [stopped, setStopped] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(
    () => server.subscribe((notification) => notification.method === SERVER_EXITED && setStopped(true)),
    [server],
  );
  if (!stopped) return null;
  return (
    <div
      role="alert"
      className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-diff-removed px-5 py-2 text-body text-danger"
    >
      <span className="min-w-0 grow">
        {t.engineStopped}
        <span className="ml-2 text-meta text-fg-muted">{failed ? t.engineRestartFailed : t.engineStoppedHint}</span>
      </span>
      <Button variant="primary" onClick={() => restartApp().catch(() => setFailed(true))}>
        {t.engineRestart}
      </Button>
    </div>
  );
}
