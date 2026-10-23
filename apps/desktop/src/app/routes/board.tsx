import { LinkButton } from '@alpine/ui/primitives';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { SUMMARY_TAB, WorkspaceDock } from '@/app/WorkspaceDock';
import { messages as dockMessages } from '@/features/dock/messages';
import { showDockTab, useDockExpanded, useDockOpen } from '@/features/dock/state';
import { useMapTalk } from '@/features/product-map/mapTalk';
import { messages as mapMessages } from '@/features/product-map/messages';
import { ProductMap } from '@/features/product-map/ProductMap';
import { Session } from '@/features/session/Session';
import { useWorkResultTab } from '@/features/work-result/useWorkResultTab';
import { useMessages } from '@/shared/i18n';
import { useProjects, useSession } from '@/shared/server';

export const Route = createFileRoute('/board')({
  validateSearch: (search: Record<string, unknown>): { project?: string; session?: string } => ({
    ...(typeof search.project === 'string' ? { project: search.project } : {}),
    ...(typeof search.session === 'string' ? { session: search.session } : {}),
  }),
  component: BoardRoute,
});

function BoardRoute() {
  const { project: chosen, session: asked } = Route.useSearch();
  const projects = useProjects();
  const project = projects.data?.projects.find((p) => p.path === chosen && !p.archived);
  // Without one in the address, the map shows the conversation its input goes to: its own, or while a build is
  // unfinished, the build's (map-first 37). No project here (none chosen, or one removed), no map to ask about.
  const { talkTo } = useMapTalk(project?.path ?? '');
  const session = asked ?? talkTo ?? undefined;
  const navigate = useNavigate();
  const attached = useSession(session ?? null);
  const [dockOpen] = useDockOpen();
  const scope = `board:${chosen ?? ''}`;
  const [expanded] = useDockExpanded(scope);
  const resultTab = useWorkResultTab(session ?? null, chosen);
  const t = useMessages(dockMessages);
  const m = useMessages(mapMessages);
  const attachedHere = !!session && !!attached.data && attached.data.info.cwd === chosen && !attached.data.deleted;
  // The map's agent session is its summary, in the dock: one place for the conversation on every page.
  const summary = attachedHere ? (
    <div className="flex min-h-0 grow flex-col">
      {/* Another conversation opened beside the map (a card's, one brought over): my words to the map do not go
          there, so it says so and leads back. */}
      {talkTo && session !== talkTo && (
        <p className="flex flex-wrap items-center gap-x-2 border-b border-line bg-canvas-sunken px-4 py-2 text-meta text-fg-muted">
          <span>{m.viewingOther}</span>
          <LinkButton
            className="min-h-5 px-0.5"
            onClick={() => void navigate({ to: '/board', search: { project: chosen }, replace: true })}
          >
            {m.backToMapConversation}
          </LinkButton>
        </p>
      )}
      {/* The map has its own input for this conversation; here it only reads. */}
      <Session key={session} sessionId={session} compact readOnly onInspectProcesses={() => showDockTab('processes')} />
    </div>
  ) : (
    <p className="px-5 text-body text-fg-muted">{t.mapSummaryEmpty}</p>
  );
  if (!project) return <div className="p-8 text-body text-fg-muted">{projects.isLoading ? '…' : (chosen ?? '—')}</div>;
  return (
    <WorkspaceDock
      cwd={project.path}
      sessionId={attachedHere ? session : undefined}
      scope={scope}
      summary={summary}
      changes={resultTab}
      showMap={false}
    >
      <ProductMap
        key={project.path}
        cwd={project.path}
        sessionId={session ?? null}
        dockOpen={dockOpen}
        hidden={expanded}
        demo={!('__TAURI_INTERNALS__' in window)}
        onShowConversation={() => showDockTab(SUMMARY_TAB)}
        onOpenApp={() => showDockTab('servers')}
        onFixConnection={() => void navigate({ to: '/settings', search: { tab: 'connection' } })}
        onNewHere={(folder) => void navigate({ to: '/', search: { folder } })}
        // An empty id lets go of the session (the map started over).
        onSession={(id) =>
          void navigate({
            to: '/board',
            search: id ? { project: project.path, session: id } : { project: project.path },
            replace: true,
          })
        }
      />
    </WorkspaceDock>
  );
}
