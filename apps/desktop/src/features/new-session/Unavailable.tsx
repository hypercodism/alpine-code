import { Button } from '@alpine/ui/primitives';
import { useState } from 'react';

import { useMessages } from '@/shared/i18n';
import { openInBrowser } from '@/shared/platform';
import { ServerError, useGitTools, useInstallGitTools } from '@/shared/server';

import { ErrorDetail } from './ErrorDetail';
import { messages } from './messages';

/** The reasons `projects/judge` gives when there are no setups to show, because they could not be fetched. */
export const UNAVAILABLE = ['unreachable', 'not_found', 'no_git_tools'] as const;

export function isUnavailable(error: unknown): boolean {
  const reason = error instanceof ServerError ? error.data?.reason : undefined;
  return (UNAVAILABLE as readonly (string | undefined)[]).includes(reason);
}

/**
 * No setups to make the project with: the setups come from the internet the first time, and that did not work. Says
 * why in plain words and what to do (connect, install git, update), then 다시 해 보기 asks again with the same idea.
 */
export function Unavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useMessages(messages);
  const reason = error instanceof ServerError ? error.data?.reason : undefined;
  const noGit = reason === 'no_git_tools';
  const tools = useGitTools();
  const install = useInstallGitTools();
  const [installing, setInstalling] = useState(false);
  const elsewhere = noGit && tools.data?.installable === false;
  const body = noGit
    ? elsewhere
      ? t.unavailableNoGitElsewhere
      : installing
        ? t.installStarted
        : t.unavailableNoGit
    : reason === 'not_found'
      ? t.unavailableMissing
      : t.unavailableUnreachable;
  const detail = error instanceof Error && error.message ? error.message : null;
  return (
    <div className="motion-step flex flex-col gap-4">
      <div role="alert" className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">{t.unavailable}</h1>
        <p className="text-body text-fg">{body}</p>
        <ErrorDetail detail={detail} />
      </div>
      <div className="flex justify-end gap-2">
        {noGit &&
          (elsewhere ? (
            <Button onClick={() => void openInBrowser('https://git-scm.com/downloads')}>{t.getGit}</Button>
          ) : (
            !installing && (
              <Button onClick={() => install.mutate(undefined, { onSuccess: () => setInstalling(true) })}>
                {t.installTools}
              </Button>
            )
          ))}
        <Button variant="primary" autoFocus onClick={onRetry}>
          {t.retry}
        </Button>
      </div>
    </div>
  );
}
