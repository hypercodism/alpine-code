import { LinkButton, PanelResizer, usePanelWidth } from '@alpine/ui/primitives';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { Database, FileText, Globe, ListChecks, MessageSquare, SquareTerminal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { useAppPeople, useHasApp } from '@/app/appScreens';
import { shellMessages } from '@/app/shellMessages';
import { ProjectCode } from '@/app/ProjectCode';
import { MapTopBar, StartTopBar } from '@/app/ShellTopBar';
import { UpdateButton } from '@/app/UpdateButton';
import { ToolRail, type RailPlace } from '@/app/ToolRail';
import { DataPlace, SUMMARY_TAB } from '@/app/WorkspaceDock';
import { AppView } from '@/features/app-view/AppView';
import { showApp, showMap, showView, useAppCard, useLookingAt, useProjectView } from '@/features/app-view/state';
import { DeployLogs } from '@/features/deploy-logs/DeployLogs';
import { messages as serverMessages } from '@/features/development-servers/messages';
import { messages as dockMessages } from '@/features/dock/messages';
import { pickRailPlace, setRailProject, showDockTab, useRail } from '@/features/dock/state';
import { ProcessControl, useCommands } from '@/features/process-control';
import { askMapFor } from '@/features/product-map/askRequest';
import { useMapActions } from '@/features/product-map/mapActions';
import { useMapTalk } from '@/features/product-map/mapTalk';
import { messages as mapMessages } from '@/features/product-map/messages';
import { planPhase } from '@/features/product-map/planData';
import { ProductMap } from '@/features/product-map/ProductMap';
import { PublishButton } from '@/features/publish/PublishButton';
import { openPublish, usePublishable } from '@/features/publish/publishRequest';
import { MissingProject } from '@/features/rail/MissingProject';
import { RecordItems } from '@/features/session/RecordItems';
import { Session } from '@/features/session/Session';
import { WaitingApprovals } from '@/features/session/WaitingApprovals';
import { useTaskForceTab } from '@/features/taskforce/useTaskForceTab';
import { Terminal } from '@/features/terminal';
import { FileNavigationProvider } from '@/shared/files';
import { useMessages } from '@/shared/i18n';
import { openMemory, openSettings } from '@/shared/navigation';
import {
  useCloudEnabled,
  useDataSources,
  useProductMap,
  useProjects,
  usePublishStatus,
  useSession,
  type Item,
} from '@/shared/server';

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
 * A project's window (flow-spec, 화면의 뼈대): the bar over the left (the project menu, 보드 · 문서 · 앱 · 코드, the
 * map's actions), the board, its document, the app or the code under it; on the right the icon rail (2c) and beside it
 * the place it picked: the conversation, 명령, 터미널, 로그 or 데이터, folded away when its icon is pressed again.
 * Everything said to the map sits under the place, whichever it is (map-first 43).
 */
function BoardRoute() {
  const { project: chosen, session: asked } = Route.useSearch();
  const projects = useProjects();
  const project = projects.data?.projects.find((p) => p.path === chosen && !p.archived);
  const cwd = project?.path ?? '';
  // Without one in the address, the map shows the conversation its input goes to: its own, or while a build is
  // unfinished, the build's (map-first 37). No project here (none chosen, or one removed), no map to ask about.
  const { talkTo, buildSessionId, buildInfo, building } = useMapTalk(cwd);
  // Once the build is over its conversation is not where the map talks: the map's own shows, with the build in it as
  // one line that opens it (the address may still name the build, from when it started).
  const pastBuild = !!asked && asked === buildSessionId && !building && !!talkTo;
  const session = (pastBuild ? undefined : asked) ?? talkTo ?? undefined;
  const [buildShownFor, setBuildShownFor] = useState<string | null>(null);
  const navigate = useNavigate();
  const attached = useSession(session ?? null);
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
  const view = useProjectView(cwd);
  const showingApp = view === 'app' && hasApp;
  // The code tab covers the map like the app does; the document is the map itself, read another way.
  const showingCode = view === 'code';
  const mapCovered = showingApp || showingCode;
  const cardId = useAppCard(cwd);
  const looking = useLookingAt(cwd);
  const people = useAppPeople(cwd, project?.name ?? '');
  const lookingTitle = showingApp
    ? people.flatMap((p) => p.journeys.flatMap((j) => j.screens)).find((screen) => screen.id === looking)?.title
    : undefined;
  const rail = useRail(cwd);
  // `showDockTab` (a card's 명령, the AI 팀) opens a place of this window while it shows.
  useEffect(() => {
    setRailProject(cwd || null);
    return () => setRailProject(null);
  }, [cwd]);
  const client = useQueryClient();
  const running =
    useCommands(cwd).data?.processes.filter((p) => p.kind !== 'shell' && p.status === 'running').length ?? 0;
  // The 데이터 place is Alpine Cloud's, and only once there is data to show.
  const hasData = useDataSources(cwd, cloud && !!project).data?.sources.some((source) => source.available) ?? false;
  const published = !!usePublishStatus(cwd, cloud && !!project).data?.lastPublishedAt;
  const places: RailPlace[] = [
    { id: SUMMARY_TAB, label: s.conversation, icon: MessageSquare },
    { id: 'processes', label: s.commands, icon: ListChecks, badge: running },
    { id: 'terminal', label: s.terminal, icon: SquareTerminal },
    { id: 'logs', label: s.logs, icon: FileText },
    ...(hasData ? [{ id: 'data', label: s.data, icon: Database }] : []),
    { id: 'browser', label: s.browser, icon: Globe, later: true },
  ];
  // A place that is not here (데이터 without data, or an id another page used) shows the conversation.
  const place = places.some((each) => each.id === rail.place && !each.later) ? rail.place : SUMMARY_TAB;
  // The terminal starts once its place is first opened, and keeps its shells while another place shows.
  const [terminalFor, setTerminalFor] = useState<string | null>(null);
  if (place === 'terminal' && terminalFor !== cwd) setTerminalFor(cwd);
  const width = usePanelWidth({ storageKey: 'alpine.work-result.width', initial: 400, min: 320, max: 720 });
  const teamShown = !!team && teamOf === session;
  // Opens the app at one screen: 앱에서 보기 on a map card, or a screen picked beside the app.
  const openInApp = (id: string) => showApp(cwd, id);
  // Each time the map's work ends (a request, a fix, the build) the app shows the screen again, with what changed.
  const mapWorking = useMapActions(cwd)?.working ?? false;
  const [appReload, setAppReload] = useState({ working: false, count: 0 });
  if (appReload.working !== mapWorking)
    setAppReload({ working: mapWorking, count: appReload.count + (mapWorking ? 0 : 1) });

  // Until the projects are known nothing is drawn, so the bar is not drawn twice (once without its project).
  if (!projects.data && !projects.isError) return null;
  if (!project)
    return (
      <div className="flex min-w-0 grow flex-col">
        <StartTopBar project={chosen} />
        <div className="mx-2 mb-2 flex min-h-0 grow overflow-clip rounded-xl border border-line bg-canvas">
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

  // A finished build of a plan, as one line in the map's conversation: how long it took, and its work when opened.
  const buildDone = planned && !!buildSessionId && !building && !!buildInfo && buildInfo.status !== 'running';
  const buildMinutes = buildInfo
    ? Math.max(
        1,
        Math.round((Date.parse(builtAt(buildInfo, buildDone)) - Date.parse(buildInfo.createdAt)) / 60000) || 1,
      )
    : 1;
  const conversation = attachedHere ? (
    <div className="flex min-h-0 grow flex-col">
      {/* Another conversation opened beside the map (a card's, one brought over): my words to the map do not go
          there, so it says so and leads back. */}
      {talkTo && session !== talkTo && (
        <p className="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-line bg-canvas-sunken px-4 py-2 text-meta text-fg-muted">
          <span>{m.viewingOther}</span>
          <LinkButton
            className="min-h-5 px-0.5"
            onClick={() => void navigate({ to: '/board', search: { project: chosen }, replace: true })}
          >
            {m.backToMapConversation}
          </LinkButton>
        </p>
      )}
      {buildDone && buildShownFor === buildSessionId ? (
        <div className="flex min-h-0 grow flex-col">
          <p className="shrink-0 border-b border-line px-4 py-2 text-meta">
            <LinkButton className="min-h-5 px-0.5" onClick={() => setBuildShownFor(null)}>
              {m.backToConversation}
            </LinkButton>
          </p>
          <Session key={buildSessionId} sessionId={buildSessionId} compact readOnly inputOnMap approvalsPinned />
        </div>
      ) : teamShown ? (
        <div className="flex min-h-0 grow flex-col">
          {/* The way back stays in view however far the agents' records scroll. */}
          <p className="shrink-0 border-b border-line px-4 py-2 text-meta">
            <LinkButton className="min-h-5 px-0.5" onClick={() => setTeamOf(null)}>
              {m.backToConversation}
            </LinkButton>
          </p>
          <div className="min-h-0 grow overflow-y-auto">{team.content}</div>
        </div>
      ) : (
        // The map has its own input; here the conversation only reads, unless it is one the map's input does not
        // reach and it waits for my answer.
        <>
          {buildDone && session === talkTo && (
            <button
              type="button"
              onClick={() => setBuildShownFor(buildSessionId)}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 border-b border-line px-4 py-2 text-left text-meta text-fg-muted hover:text-fg"
            >
              {m.buildTook(buildMinutes)}
              <span aria-hidden="true">›</span>
            </button>
          )}
          <Session
            key={session}
            sessionId={session}
            compact
            readOnly
            inputOnMap={!talkTo || session === talkTo}
            questionsPinned={planned && session === talkTo}
            approvalsPinned
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
        </>
      )}
    </div>
  ) : (
    <p className="grow px-5 text-body text-fg-muted">{t.mapSummaryEmpty}</p>
  );

  return (
    // A file opened anywhere in the window (a link in the conversation) shows in the 코드 tab.
    <FileNavigationProvider key={cwd} cwd={cwd} onOpen={() => showView(cwd, 'code')}>
      {/* Neither side ever scrolls as a whole (overflow: clip): the bar over the map and the conversation's header
          stay, whatever inside them is brought into view. */}
      <div className="flex min-h-0 min-w-0 grow overflow-clip">
        <section className="flex min-h-0 min-w-0 grow flex-col overflow-clip">
          <MapTopBar
            cwd={cwd}
            hasApp={hasApp}
            end={
              <>
                {/* The restart-to-update button, which sat by ⋯ before ⋯ went down to the rail. */}
                <UpdateButton />
                {publishable && (
                  // A plan's completion card has 인터넷에 올리기; the sheet still opens from there (openPublish).
                  <PublishButton cwd={cwd} name={project.name} sessionId={talkTo} sheetOnly={planned} />
                )}
              </>
            }
          />
          <div className="relative min-h-0 grow overflow-clip">
            {/* The map stays mounted under the app, so going back finds it where it was. */}
            <div
              className={clsx('absolute inset-0 flex min-w-0', mapCovered && 'invisible')}
              aria-hidden={mapCovered}
              inert={mapCovered}
            >
              <ProductMap
                key={cwd}
                cwd={cwd}
                sessionId={session ?? null}
                dockOpen
                menuInWindow
                hidden={mapCovered}
                view={view === 'doc' ? 'doc' : 'board'}
                onShowBoard={() => showMap(cwd)}
                talkSlot={talkSlot}
                onShowTalk={() => showDockTab(SUMMARY_TAB)}
                demo={!('__TAURI_INTERNALS__' in window)}
                onShowConversation={() => showDockTab(SUMMARY_TAB)}
                // The app opens itself in the app view: Alpine starts the project's server and shows it.
                onOpenApp={() => showApp(cwd)}
                onOpenInApp={openInApp}
                onPublish={publishable ? (from) => openPublish(cwd, from) : undefined}
                onFixConnection={() => openSettings('connection')}
                onMemory={() => openMemory(cwd)}
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
            {showingCode && (
              <div className="absolute inset-0 flex min-w-0">
                <ProjectCode key={cwd} cwd={cwd} />
              </div>
            )}
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
                  reload={appReload.count}
                />
              </div>
            )}
          </div>
        </section>
        <aside
          // The place the rail picked; folded, it is not shown and the board takes the room.
          aria-label={t.title}
          hidden={rail.folded}
          style={{ width: width.width }}
          className={clsx(
            'relative min-h-0 shrink-0 flex-col border-l border-line bg-canvas',
            rail.folded ? 'hidden' : 'flex',
          )}
        >
          <PanelResizer panel={width} edge="left" label={t.resize} />
          {place === SUMMARY_TAB ? (
            <PlaceHeader>
              {/* The conversations of the project will sit here as tabs; for now the board's own. */}
              <span className="rounded-md bg-hover px-2.5 py-1 text-body font-medium text-fg">
                {s.conversationWithBoard}
              </span>
            </PlaceHeader>
          ) : place === 'processes' ? null : (
            <PlaceHeader>
              <h2 className="text-body font-semibold">{places.find((each) => each.id === place)?.label}</h2>
            </PlaceHeader>
          )}
          {place === 'processes' && (
            <ProcessControl
              key={cwd}
              cwd={cwd}
              onInspectProcess={(processId) => {
                client.setQueryData(['terminal-selection', cwd], processId);
                showDockTab('terminal');
              }}
              onAskAI={(text) => {
                askMapFor(cwd, text);
                showDockTab(SUMMARY_TAB);
              }}
              renderHeader={(count, actions) => (
                <PlaceHeader>
                  <h2 className="text-body font-semibold">{s.commands}</h2>
                  {count}
                  <span data-tauri-drag-region className="grow self-stretch" />
                  {actions}
                </PlaceHeader>
              )}
            />
          )}
          {/* The terminal keeps its shells while another place shows. */}
          {terminalFor === cwd && (
            <div className={clsx('min-h-0 grow flex-col', place === 'terminal' ? 'flex' : 'hidden')}>
              <Terminal
                key={cwd}
                cwd={cwd}
                sessionId={attachedHere ? session : undefined}
                onOpenDevelopmentServer={() => showApp(cwd)}
              />
            </div>
          )}
          {place === 'logs' && (
            <div className="min-h-0 grow overflow-y-auto">
              <DeployLogs
                published={published}
                onPublish={publishable ? () => openPublish(cwd) : undefined}
                onShowCommands={() => pickRailPlace(cwd, 'processes')}
                onShowTerminal={() => pickRailPlace(cwd, 'terminal')}
              />
            </div>
          )}
          {place === 'data' && (
            <div className="flex min-h-0 grow flex-col">
              <DataPlace key={cwd} cwd={cwd} />
            </div>
          )}
          {/* The conversation stays mounted behind another place, so coming back finds it where it was. */}
          <div className={clsx('min-h-0 grow flex-col', place === SUMMARY_TAB ? 'flex' : 'hidden')}>{conversation}</div>
          {/* Every call of the project waiting for my OK, whatever shows above: never behind a card or another view. */}
          <WaitingApprovals cwd={cwd} />
          {lookingTitle && (
            <p className="mx-4 mb-2 flex items-center gap-1.5 text-meta text-fg-muted">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-interactive" />
              {s.lookingAt(lookingTitle)}
            </p>
          )}
          <div ref={setTalkSlot} className="contents" />
        </aside>
        <ToolRail
          project={cwd}
          places={places}
          current={place}
          folded={rail.folded}
          onPick={(id) => pickRailPlace(cwd, id)}
        />
      </div>
    </FileNavigationProvider>
  );
}

const BUILT_AT = 'alpine.build.ended-at';

/**
 * When a build ended, as first seen: its conversation may be touched again later (asked something once built), and
 * 만들기 · N분 걸렸어요 counts the build alone, not what came after it (dogfood 24).
 */
function builtAt(info: { id: string; updatedAt: string }, done: boolean): string {
  try {
    const key = `${BUILT_AT}:${info.id}`;
    const seen = localStorage.getItem(key);
    if (seen) return seen;
    if (done) localStorage.setItem(key, info.updatedAt);
  } catch {
    // Not kept: the latest change stands in.
  }
  return info.updatedAt;
}

/** The head of the place beside the board: its name, or the conversation's tab, and what acts on it. */
function PlaceHeader({ children }: { children: ReactNode }) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-2 border-b border-line-subtle pr-3.5 pl-4"
    >
      {children}
    </header>
  );
}
