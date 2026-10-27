import { Button, LinkButton } from '@alpine/ui/primitives';

import { useMessages } from '@/shared/i18n';

import { messages } from './messages';

/**
 * 로그 (deploy logs, 2e): only what happened to people using the app on the internet. Until logs are collected this is
 * the empty place (2f D): what will show here, 올리기 when Alpine Cloud can publish the project, and where the output
 * while building is instead (명령, 터미널).
 */
export function DeployLogs({
  published,
  onPublish,
  onShowCommands,
  onShowTerminal,
}: {
  published: boolean;
  onPublish?: () => void;
  onShowCommands: () => void;
  onShowTerminal: () => void;
}) {
  const t = useMessages(messages);
  return (
    <div className="flex flex-col items-start gap-3 px-5 pt-7">
      <h3 className="text-body font-semibold text-fg">{published ? t.published : t.notPublished}</h3>
      <p className="text-body text-fg-muted">{published ? t.whatPublished : t.what}</p>
      {onPublish && !published && (
        <Button variant="primary" onClick={onPublish}>
          {t.publish}
        </Button>
      )}
      <p className="mt-3 text-meta text-fg-muted">
        {t.elsewhereBefore}
        <LinkButton className="min-h-5 px-0.5" onClick={onShowCommands}>
          {t.commands}
        </LinkButton>
        {t.elsewhereMiddle}
        <LinkButton className="min-h-5 px-0.5" onClick={onShowTerminal}>
          {t.terminal}
        </LinkButton>
        {t.elsewhereAfter}
      </p>
    </div>
  );
}
