import { Button } from '@alpine/ui/primitives';
import { useNavigate } from '@tanstack/react-router';

import { useMessages } from '@/shared/i18n';
import { useOpenProject } from '@/shared/server';

import { messages } from './messages';

/**
 * A map whose project is not in the list (deleted, or archived) reached from an old link or a notification: it says
 * why and offers the way back, putting the folder on the list again (its files stay when a project is deleted), or a
 * new project.
 */
export function MissingProject({ path, archived }: { path: string; archived: boolean }) {
  const t = useMessages(messages);
  const reopen = useOpenProject();
  const navigate = useNavigate();
  const name = path.split('/').pop() || path;
  return (
    <div className="flex grow flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-body font-medium">{archived ? t.missingArchived(name) : t.missingGone(name)}</p>
      <p className="max-w-md text-meta text-fg-muted" title={path}>
        {archived ? t.missingArchivedHint : t.missingGoneHint}
      </p>
      <div className="flex items-center gap-2 pt-1">
        <Button variant="primary" disabled={reopen.isPending} onClick={() => reopen.mutate(path)}>
          {archived ? t.restore : t.reopen}
        </Button>
        <Button onClick={() => void navigate({ to: '/' })}>{t.newProject}</Button>
      </div>
      {reopen.error && (
        <p role="alert" className="text-meta text-danger">
          {reopen.error.message}
        </p>
      )}
    </div>
  );
}
