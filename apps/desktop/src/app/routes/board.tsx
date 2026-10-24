import { LinkButton, PanelResizer, usePanelWidth } from '@alpine/ui/primitives';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { useAppPeople, useHasApp } from '@/app/appScreens';
import { MoreMenu } from '@/app/MoreMenu';
import { shellMessages } from '@/app/shellMessages';
import { MapTopBar, StartTopBar } from '@/app/ShellTopBar';
import { UpdateButton } from '@/app/TopBar';
import { CHANGES_TAB, SUMMARY_TAB, useProjectTools } from '@/app/WorkspaceDock';
import { AppView } from '@/features/app-view/AppView';
import { showApp, useAppCard, useLookingAt, useProjectView } from '@/features/app-view/state';
import { messages as serverMessages } from '@/features/development-servers/messages';
import { messages as dockMessages } from '@/features/dock/messages';
import { showDockTab, useDockTab } from '@/features/dock/state';
import { askMapFor } from '@/features/product-map/askRequest';
import { useMapTalk } from '@/features/product-map/mapTalk';
import { messages as mapMessages } from '@/features/product-map/messages';
import { planPhase } from '@/features/product-map/planData';
import { ProductMap } from '@/features/product-map/ProductMap';
import { PublishButton } from '@/features/publish/PublishButton';
import { openPublish, usePublishable } from '@/features/publish/publishRequest';
import { MissingProject } from '@/features/rail/MissingProject';
import { RecordItems } from '@/features/session/RecordItems';
import { Session } from '@/features/session/Session';
import { useTaskForceTab } from '@/features/taskforce/useTaskForceTab';
import { useWorkResultTab } from '@/features/work-result/useWorkResultTab';
import { FileNavigationProvider } from '@/shared/files';
import { useMessages } from '@/shared/i18n';
import { useCloudEnabled, useProductMap, useProjects, useSession, type Item } from '@/shared/server';

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

/**
 * A project's window (flow-spec, 화면의 뼈대): the bar over the left (the project menu, 지도 | 앱, the map's actions),
 * the map or the app under it, and on the right the conversation, where a developer tool from ⋯ opens in its place with
 * ← 대화 back. Everything said to the map sits under the conversation (map-first 43).
 */
function BoardRoute() {
  const { project: chosen, session: asked } = Route.useSearch();
  const projects = useProjects();
  const project = projects.data?.projects.find((p) => p.path === chosen && !p.archived);
  const cwd = project?.path ?? '';
  // Without one in the address, the map shows the conversation its input goes to: its own, or while a build is
  // unfinished, the build's (map-first 37). No project here (none chosen, or one removed), no map to ask about.
  const { talkTo } = useMapTalk(cwd);
  const session = asked ?? talkTo ?? undefined;
  const navigate = useNavigate();
  const attached = useSession(session ?? null);
  const resultTab = useWorkResultTab(session ?? null, chosen);
  const cloud = useCloudEnabled();
  const t = useMessages(dockMessages);
  const m = useMessages(mapMessages);
  const s = useMessages(shellMessages);
  const servers = useMessages(serverMessages);
  const attachedHere = !!session && !!attached.data && attached.data.info.cwd === chosen && !attached.data.deleted;
  // The conversation's AI 팀 (a TF), opened from its card in the conversation's place, with the way back.
  const team = useTaskForceTab(attachedHere ? session : null, renderRecord);
  const [teamOf, setTeamOf] = useState<string | null>(null);
  // Where everything said to the map sits: under its conversation (map-first 43).
  const [talkSlot, setTalkSlot] = useState<HTMLElement | null>(null);
  const board = useProductMap(cwd).data;
  // A plan holds its open question in the bar under the conversation, so the conversation shows it in one line.
  const planned = !!board?.planned;
  // A plan is put on the internet once it is built, not while it is still being planned or made.
  const unbuilt = !!board?.planned && planPhase(board, false, false) !== 'built';
  const publishable = usePublishable(cwd, cloud && !!project && !unbuilt);
  const hasApp = useHasApp(cwd);
  const showingApp = useProjectView(cwd) === 'app' && hasApp;
  const cardId = useAppCard(cwd);
  const looking = useLookingAt(cwd);
  const people = useAppPeople(cwd, project?.name ?? '');
  const lookingTitle = showingApp
    ? people.flatMap((p) => p.journeys.flatMap((j) => j.screens)).find((screen) => screen.id === looking)?.title
    : undefined;
  const [chosenTool] = useDockTab();
  const tools = useProjectTools({
    cwd,
    sessionId: attachedHere ? session : undefined,
    changes: { ...resultTab, label: s.changes },
    enabled: !!project,
  });
  // A developer tool takes the conversation's place; anything else picked (대화, or a session page's tab) is the
  // conversation.
  const tool = tools.find((each) => each.id === chosenTool) ?? null;
  const width = usePanelWidth({ storageKey: 'alpine.work-result.width', initial: 400, min: 320, max: 720 });
  const teamShown = !!team && teamOf === session;
  // Opens the app at one screen: 앱에서 보기 on a map card, or a screen picked beside the app.
  const openInApp = (id: string) => showApp(cwd, id);

  // Until the projects are known nothing is drawn, so the bar is not drawn twice (once without its project).
  if (!projects.data && !projects.isError) return null;
  if (!project)
    return (
      <div className="flex min-w-0 grow flex-col">
        <StartTopBar project={chosen} />
        <div className="mx-2 mb-2 flex min-h-0 grow overflow-hidden rounded-xl border border-line bg-canvas">
          {projects.data && chosen ? (
            <MissingProject
              path={chosen}
              archived={projects.data.projects.some((p) => p.path === chosen && p.archived)}
            />
          ) : (
            <div className="p-8 text-body text-fg-muted">—</div>
          )}
        </div>
      </div>
    );

  const conversation = attachedHere ? (
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
        // The map has its own input; here the conversation only reads, unless it is one the map's input does not
        // reach and it waits for my answer.
        <Session
          key={session}
          sessionId={session}
          compact
          readOnly
          inputOnMap={!talkTo || session === talkTo}
          questionsPinned={planned && session === talkTo}
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
    <p className="grow px-5 text-body text-fg-muted">{t.mapSummaryEmpty}</p>
  );

  return (
    <FileNavigationProvider
      key={cwd}
      cwd={cwd}
      onOpen={() => showDockTab('source')}
      onReturnToChanges={() => showDockTab(CHANGES_TAB)}
    >
      <div className="flex min-w-0 grow">
        <section className="flex min-w-0 grow flex-col">
          <MapTopBar
            cwd={cwd}
            hasApp={hasApp}
            end={
              publishable && (
                // A plan's completion card has 인터넷에 올리기; the sheet still opens from there (openPublish).
                <PublishButton cwd={cwd} name={project.name} sessionId={talkTo} sheetOnly={planned} />
              )
            }
          />
          <div className="relative min-h-0 grow">
            {/* The map stays mounted under the app, so going back finds it where it was. */}
            <div
              className={clsx('absolute inset-0 flex min-w-0', showingApp && 'invisible')}
              aria-hidden={showingApp}
              inert={showingApp}
            >
              <ProductMap
                key={cwd}
                cwd={cwd}
                sessionId={session ?? null}
                dockOpen
                menuInWindow
                hidden={showingApp}
                talkSlot={talkSlot}
                onShowTalk={() => showDockTab(SUMMARY_TAB)}
                demo={!('__TAURI_INTERNALS__' in window)}
                onShowConversation={() => showDockTab(SUMMARY_TAB)}
                // The app opens itself in the app view: Alpine starts the project's server and shows it.
                onOpenApp={() => showApp(cwd)}
                onOpenInApp={openInApp}
                onPublish={publishable ? () => openPublish(cwd) : undefined}
                onFixConnection={() => void navigate({ to: '/settings', search: { tab: 'connection' } })}
                onMemory={() => void navigate({ to: '/memory', search: { project: cwd } })}
                onNewHere={(folder) => void navigate({ to: '/', search: { folder } })}
                onNewProject={() => void navigate({ to: '/' })}
                // An empty id lets go of the session (the map started over).
                onSession={(id) =>
                  void navigate({
                    to: '/board',
                    search: id ? { project: cwd, session: id } : { project: cwd },
                    replace: true,
                  })
                }
              />
            </div>
            {showingApp && (
              <div className="absolute inset-0 flex min-w-0">
                <AppView
                  cwd={cwd}
                  name={project.name}
                  people={people}
                  cardId={cardId}
                  onPick={openInApp}
                  // The app would not open: the map takes what went wrong as my words, and its conversation shows
                  // the fixing.
                  onAskFix={(failure) => {
                    askMapFor(cwd, servers.fixRequest(failure.command, failure.port, failure.log));
                    showDockTab(SUMMARY_TAB);
                  }}
                  onAskSetup={() => {
                    askMapFor(cwd, servers.setupRequest);
                    showDockTab(SUMMARY_TAB);
                  }}
                  onShowTerminal={() => showDockTab('terminal')}
                />
              </div>
            )}
          </div>
        </section>
        <aside
          // Named as the dock it replaces: the right side of the window, which holds the conversation.
          aria-label={t.title}
          style={{ width: width.width }}
          className="relative flex shrink-0 flex-col border-l border-line bg-canvas"
        >
          <PanelResizer panel={width} edge="left" label={t.resize} />
          <header data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-2 pr-3.5 pl-4">
            {tool && (
              <>
                <LinkButton className="min-h-6 gap-1 px-0.5" onClick={() => showDockTab(SUMMARY_TAB)}>
                  <ArrowLeft size={14} strokeWidth={1.6} aria-hidden="true" />
                  {s.backToConversation}
                </LinkButton>
                <span aria-hidden="true" className="h-4 w-px bg-line" />
                <h2 className="truncate text-body font-medium">{tool.label}</h2>
              </>
            )}
            <span data-tauri-drag-region className="grow self-stretch" />
            <UpdateButton />
            <MoreMenu project={cwd} tools={tools} onTool={showDockTab} />
          </header>
          {tool && (
            <ToolPlace id={tool.id} bare={tool.bare}>
              {tool.content}
            </ToolPlace>
          )}
          {/* The conversation stays mounted behind a tool, so coming back finds it where it was. */}
          <div className={clsx('min-h-0 grow flex-col', tool ? 'hidden' : 'flex')}>{conversation}</div>
          {lookingTitle && (
            <p className="mx-4 mb-2 flex items-center gap-1.5 text-meta text-fg-muted">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-interactive" />
              {s.lookingAt(lookingTitle)}
            </p>
          )}
          <div ref={setTalkSlot} className="contents" />
        </aside>
      </div>
    </FileNavigationProvider>
  );
}

/** A developer tool in the conversation's place: the ones that scroll and pad themselves fill it edge to edge. */
function ToolPlace({ id, bare, children }: { id: string; bare?: boolean; children: ReactNode }) {
  return (
    <div
      id={`dock-panel-${id}`}
      className={clsx('motion-content flex min-h-0 grow flex-col', !bare && 'overflow-y-auto px-5 pb-5')}
    >
      {children}
    </div>
  );
}
