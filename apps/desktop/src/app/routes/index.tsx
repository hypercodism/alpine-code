import type { CloneInfo } from '@alpine/protocol';
import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { StartTopBar } from '@/app/ShellTopBar';
import { NewProject } from '@/features/new-session/NewProject';
import { Receiving } from '@/features/new-session/Receiving';
import { CloneDialog } from '@/shared/components/project-add';
import { useCancelClone, useProjects } from '@/shared/server';

/**
 * 새 프로젝트: the one place a new product starts (map-first 39). `?folder=` is an empty folder to make it in (a map's
 * 여기서 새로 만들기); `?agent=` the agent to start with. `?project=` is a project being added: while it is still being
 * received its progress shows here, and once it is there its map opens, since an existing project is its map.
 */
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { project?: string; agent?: string; folder?: string } => ({
    ...(typeof search.project === 'string' ? { project: search.project } : {}),
    ...(typeof search.agent === 'string' ? { agent: search.agent } : {}),
    ...(typeof search.folder === 'string' ? { folder: search.folder } : {}),
  }),
  component: NewProjectRoute,
});

function NewProjectRoute() {
  return (
    <div className="flex min-w-0 grow flex-col">
      <StartTopBar />
      <div className="mx-2 mb-2 flex min-h-0 grow overflow-hidden rounded-xl border border-line bg-canvas">
        <NewProjectPage />
      </div>
    </div>
  );
}

function NewProjectPage() {
  const { agent, folder, project } = Route.useSearch();
  const navigate = useNavigate();
  const projects = useProjects();
  const cancelClone = useCancelClone();
  const [retrying, setRetrying] = useState<string | null>(null);
  const arrived = projects.data?.projects.some((p) => p.path === project && !p.archived);
  const clone = project && !arrived ? cloneAt(projects.data?.clones ?? [], project) : undefined;
  const openMap = (path: string) => void navigate({ to: '/board', search: { project: path } });

  // Replacing this stop, so ← goes back to the screen before the project was opened instead of bouncing here.
  if (project && arrived) return <Navigate to="/board" search={{ project }} replace />;
  if (clone)
    return (
      <main className="flex min-w-120 grow flex-col items-center justify-center bg-canvas p-6">
        <Receiving
          clone={clone}
          onCancel={() => cancelClone.mutate(clone.id, { onSuccess: () => void navigate({ to: '/' }) })}
          onDismiss={() => cancelClone.mutate(clone.id, { onSuccess: () => void navigate({ to: '/' }) })}
          onRetry={() => setRetrying(clone.address)}
        />
        <CloneDialog
          open={retrying !== null}
          address={retrying ?? undefined}
          onOpenChange={(open) => !open && setRetrying(null)}
          onDone={(path) => {
            setRetrying(null);
            cancelClone.mutate(clone.id); // the failed one makes way for the new try
            void navigate({ to: '/', search: { project: path } });
          }}
        />
      </main>
    );
  return <NewProject key={folder ?? ''} folder={folder ?? null} agent={agent} onPlanning={openMap} />;
}

/** The clone going to `path`; one still receiving wins over a failed one being tried again. */
function cloneAt(clones: CloneInfo[], path: string): CloneInfo | undefined {
  const at = clones.filter((c) => c.path === path);
  return at.find((c) => c.state === 'receiving') ?? at[0];
}
