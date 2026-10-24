import { Popover } from '@alpine/ui/primitives';
import { Upload } from 'lucide-react';
import { useState } from 'react';

import { useMessages } from '@/shared/i18n';
import { usePublish, usePublishStatus } from '@/shared/server';

import { messages } from './messages';
import { PublishPanel } from './PublishPanel';
import { usePublishRequest } from './publishRequest';

/**
 * The top bar's 올리기 (decision 14), on a session and on the map: a dot while there are changes not online yet (`publish/status`); it opens the
 * sheet beside it. A project that cannot be put online at all (no web app in it) has no button. A person who is not
 * signed in or has no Node.js yet still sees it: the sheet says what is missing.
 */
export function PublishButton({
  cwd,
  name,
  sessionId,
  defaultOpen = false,
  onEvidence,
  sheetOnly = false,
}: {
  cwd: string;
  name: string;
  /** The project's session, which gets the AI fix requests. */
  sessionId?: string | null;
  defaultOpen?: boolean;
  onEvidence?: () => void;
  /**
   * No button, only the sheet, opened by `openPublish` (the map's completion card has 인터넷에 올리기, so the top bar
   * does not repeat it). The sheet opens beside the button that asked for it.
   */
  sheetOnly?: boolean;
}) {
  const t = useMessages(messages);
  const status = usePublishStatus(cwd);
  const flow = usePublish(cwd);
  const [shown, setShown] = useState(defaultOpen);
  // 인터넷에 올리기 elsewhere (the map's done line) opens this sheet, until it is closed.
  const asked = usePublishRequest((state) => state.cwd === cwd);
  const from = usePublishRequest((state) => (state.cwd === cwd ? state.from : null));
  const open = shown || asked;
  const setOpen = (next: boolean) => {
    if (!next) usePublishRequest.getState().take();
    setShown(next);
  };
  const found = status.data;
  // No description or no web adapter: nothing here to put online. An unknown reason still opens a sheet that says so.
  if (!found || found.reason === 'not_web' || found.reason === 'no_description') return null;
  const waiting = found.publishable && ((found.changes ?? 0) > 0 || !found.lastPublishedAt);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {sheetOnly ? (
        <Popover.Trigger aria-hidden="true" tabIndex={-1} className="pointer-events-none size-px self-end opacity-0" />
      ) : (
        <Popover.Trigger
          aria-label={waiting ? `${t.publish} · ${t.unpublished}` : t.publish}
          className="relative inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-canvas-raised px-2.5 text-body font-medium text-fg hover:bg-hover data-popup-open:bg-hover"
        >
          <Upload size={14} strokeWidth={1.75} aria-hidden="true" className="text-fg-muted" />
          {t.publish}
          {waiting && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-canvas-sunken bg-interactive"
            />
          )}
        </Popover.Trigger>
      )}
      {/* Asked from a button elsewhere (the completion card, at the bottom of the conversation), it opens over that
          button, not under an invisible trigger in the top bar. */}
      <Popover.Popup anchor={sheetOnly ? from : null} side={sheetOnly && from ? 'top' : 'bottom'} align="end">
        <PublishPanel
          cwd={cwd}
          name={name}
          status={found}
          flow={flow}
          sessionId={sessionId}
          onEvidence={onEvidence && (() => (setOpen(false), onEvidence()))}
          onClose={() => setOpen(false)}
          onStatusChange={() => void status.refetch()}
        />
      </Popover.Popup>
    </Popover.Root>
  );
}
