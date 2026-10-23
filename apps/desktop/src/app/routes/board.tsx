import { LinkButton } from '@alpine/ui/primitives';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { SUMMARY_TAB, WorkspaceDock } from '@/app/WorkspaceDock';
import { openApp } from '@/features/development-servers';
import { openPublish, usePublishable } from '@/features/publish/publishRequest';
import { messages as dockMessages } from '@/features/dock/messages';
import { showDockTab, useDockExpanded, useDockOpen } from '@/features/dock/state';
import { askMapFor } from '@/features/product-map/askRequest';
import { useMapTalk } from '@/features/product-map/mapTalk';
import { messages as mapMessages } from '@/features/product-map/messages';
import { ProductMap } from '@/features/product-map/ProductMap';
import { MissingProject } from '@/features/rail/MissingProject';
import { RecordItems } from '@/features/session/RecordItems';
import { Session } from '@/features/session/Session';
import { useTaskForceTab } from '@/features/taskforce/useTaskForceTab';
import { useWorkResultTab } from '@/features/work-result/useWorkResultTab';
import { useMessages } from '@/shared/i18n';
import { useCloudEnabled, useProjects, useSession, type Item } from '@/shared/server';

export const Route = createFileRoute('/board')({
  validateSearch: (search: Record<string, unknown>): { project?: string; session?: string } => ({
    ...(typeof search.project === 'string' ? { project: search.project } : {}),
    ...(typeof search.session === 'string' ? { session: search.session } : {}),
  }),
  component: BoardRoute,
});

function renderRecord(items: Item[]) {
  return <RecordItems items={items} />;
}

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
  const cloud = useCloudEnabled();
  const publishable = usePublishable(project?.path ?? '', cloud && !!project);
  const t = useMessages(dockMessages);
  const m = useMessages(mapMessages);
  const attachedHere = !!session && !!attached.data && attached.data.info.cwd === chosen && !attached.data.deleted;
  // The conversation's AI 팀 (a TF), opened from its card in the conversation's place, with the way back.
  const team = useTaskForceTab(attachedHere ? session : null, renderRecord);
  const [teamOf, setTeamOf] = useState<string | null>(null);
  const teamShown = !!team && teamOf === session;
  // The map's conversation is in the dock's first tab, named 대화 here: one place for it on every page.
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
      {teamShown ? (
        <div className="flex min-h-0 grow flex-col overflow-y-auto">
          <p className="border-b border-line px-4 py-2 text-meta">
            <LinkButton className="min-h-5 px-0.5" onClick={() => setTeamOf(null)}>
              {m.backToConversation}
            </LinkButton>
          </p>
          {team.content}
        </div>
      ) : (
        // The map has its own input for this conversation; here it only reads.
        <Session
          key={session}
          sessionId={session}
          compact
          readOnly
          onInspectProcesses={() => showDockTab('processes')}
          onShowTaskForce={
            team
              ? () => {
                  setTeamOf(session);
                  showDockTab(SUMMARY_TAB);
                }
              : undefined
          }
        />
      )}
    </div>
  ) : (
    <p className="px-5 text-body text-fg-muted">{t.mapSummaryEmpty}</p>
  );
  if (!project)
    return projects.data && chosen ? (
      <MissingProject path={chosen} archived={projects.data.projects.some((p) => p.path === chosen && p.archived)} />
    ) : (
      <div className="p-8 text-body text-fg-muted">{projects.isLoading ? '…' : (chosen ?? '—')}</div>
    );
  return (
    <WorkspaceDock
      cwd={project.path}
      sessionId={attachedHere ? session : undefined}
      scope={scope}
      summary={summary}
      summaryLabel={m.conversationTab}
      changes={resultTab}
      showMap={false}
      // The app would not open: the map takes what went wrong as my words, and its conversation shows the fixing.
      onAskFix={(text) => {
        askMapFor(project.path, text);
        showDockTab(SUMMARY_TAB);
      }}
    >
      <ProductMap
        key={project.path}
        cwd={project.path}
        sessionId={session ?? null}
        dockOpen={dockOpen}
        hidden={expanded}
        demo={!('__TAURI_INTERNALS__' in window)}
        onShowConversation={() => showDockTab(SUMMARY_TAB)}
        // The app opens itself: the preview starts the project's server and shows it (no command to type).
        onOpenApp={() => {
          openApp(project.path);
          showDockTab('servers');
        }}
        onPublish={publishable ? () => openPublish(project.path) : undefined}
        onFixConnection={() => void navigate({ to: '/settings', search: { tab: 'connection' } })}
        onMemory={() => void navigate({ to: '/memory', search: { project: project.path } })}
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
