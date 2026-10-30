import { Button, Dialog } from '@alpine/ui/primitives';
import { useState } from 'react';

import { useMessages } from '@/shared/i18n';
import { restartToUpdate, useUpdateCheck, useUpdateReady } from '@/shared/platform';

import { menuMessages } from './messages';
import { useWorkRunning } from './useWorkRunning';

/**
 * Once a newer version has downloaded: restart into it now (it installs on quit otherwise). Restarting stops the AI's
 * work, so while it works this asks first; a restart that fails says so instead of doing nothing. While "업데이트
 * 확인…" checks or downloads, it says so here at once.
 */
export function UpdateButton() {
  const t = useMessages(menuMessages);
  const version = useUpdateReady();
  const phase = useUpdateCheck((state) => state.phase);
  const working = useWorkRunning();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!version)
    return (
      phase && (
        <span role="status" className="ml-1 inline-flex shrink-0 items-center gap-1.5 text-meta text-fg-muted">
          <span
            aria-hidden="true"
            className="size-1.5 animate-pulse rounded-full bg-interactive motion-reduce:animate-none"
          />
          {phase === 'checking' ? t.checkingUpdate : t.downloadingUpdate}
        </span>
      )
    );
  const restart = () => {
    setAsking(false);
    setFailed(false);
    restartToUpdate().catch(() => setFailed(true));
  };
  return (
    <>
      {failed && (
        <span role="alert" className="ml-2 min-w-0 truncate text-meta text-danger">
          {t.restartFailed}
        </span>
      )}
      <button
        type="button"
        title={t.updateReadyTitle(version)}
        onClick={() => (working ? setAsking(true) : restart())}
        className="ml-1 shrink-0 cursor-pointer rounded-full bg-interactive px-3 py-1 text-meta font-medium text-on-fill hover:bg-interactive-hover"
      >
        {t.restartToUpdate}
      </button>
      <Dialog.Root open={asking} onOpenChange={setAsking}>
        <Dialog.Popup size="sm" role="alertdialog">
          <div className="flex flex-col gap-2">
            <Dialog.Title>{t.workingTitle}</Dialog.Title>
            <Dialog.Description>{t.workingBody}</Dialog.Description>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Dialog.Close render={<Button variant="primary" />}>{t.later}</Dialog.Close>
            <Button onClick={restart}>{t.restartAnyway}</Button>
          </div>
        </Dialog.Popup>
      </Dialog.Root>
    </>
  );
}
