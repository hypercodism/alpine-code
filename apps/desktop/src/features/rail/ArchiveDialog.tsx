import type { ProjectInfo } from '@alpine/protocol';
import { Button, Dialog } from '@alpine/ui/primitives';
import { useState } from 'react';

import { useMessages } from '@/shared/i18n';
import { useOpenProject, useProjects } from '@/shared/server';

import { DeleteProjectDialog } from './DeleteProjectDialog';
import { messages } from './messages';

/**
 * 보관함, opened from the project menu: the projects put away, each with 복원 (it comes back, and its map opens) and
 * 삭제…. What the rail's archive view did, for a window with no rail.
 */
export function ArchiveDialog({
  open,
  onOpenChange,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The folder brought back, to open its map. */
  onRestored: (path: string) => void;
}) {
  const t = useMessages(messages);
  const archived = (useProjects().data?.projects ?? []).filter((project) => project.archived);
  const restore = useOpenProject();
  const [deleting, setDeleting] = useState<ProjectInfo | null>(null);
  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Popup size="sm">
          <div className="flex flex-col gap-1">
            <Dialog.Title>{t.archived}</Dialog.Title>
            <Dialog.Description>{t.archiveLead}</Dialog.Description>
          </div>
          {archived.length === 0 ? (
            <p className="py-2 text-body text-fg-muted">{t.archiveEmpty}</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {archived.map((project) => (
                <li key={project.path} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
                  <span className="flex min-w-0 grow flex-col">
                    <span className="truncate text-body font-medium">{project.name}</span>
                    <span className="truncate text-meta text-fg-muted" title={project.path}>
                      {project.path}
                    </span>
                  </span>
                  <Button
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(project.path, {
                        onSuccess: () => {
                          onOpenChange(false);
                          onRestored(project.path);
                        },
                      })
                    }
                  >
                    {t.restore}
                  </Button>
                  <Button aria-label={`${project.name} ${t.delete}`} onClick={() => setDeleting(project)}>
                    {t.delete}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {restore.error && (
            <p role="alert" className="text-meta text-danger">
              {restore.error.message}
            </p>
          )}
          <div className="flex justify-end pt-2">
            <Dialog.Close render={<Button />}>{t.cancel}</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Root>
      <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
