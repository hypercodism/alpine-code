import type { FlowNode, FlowPrepareParams, FlowPrepareResult } from '@alpine/protocol';
import { Button, Dialog, LinkButton, Popover, SlidingPanel } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { Brain, ChevronRight, CircleX, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { lookingAt } from '@/features/app-view/state';

import { AgentChip, ModeChip, type Mode } from '@/shared/components/composer';
import { ImportLink } from '@/shared/components/import-link';
import { latestTaskForce, roomOf } from '@/shared/components/taskforce';
import { useMessages } from '@/shared/i18n';
import {
  SESSION_RUNNING,
  ServerError,
  useAgents,
  useAnswerApproval,
  useProjectApprovals,
  useCancelSession,
  useConnections,
  useMemory,
  useNewSession,
  usePrepareFlow,
  useProductMap,
  useProjects,
  useResumeTaskForce,
  useReviewFlow,
  useSendMessage,
  useSession,
  useSessions,
  useSetSchedule,
  useSetSessionAgent,
  useSetSessionDetails,
  useSetSessionMode,
  useServer,
  useSettings,
  useTaskForceAction,
} from '@/shared/server';

import { CardAsk, HowToTry, PromiseMore, Title } from './CardExtras';
import { Changes, newChanges, useLastSeen } from './Changes';
import { REMOVED } from './Conditions';
import { Coverage } from './Coverage';
import { noticeRow, recheckIds } from './Focus';
import { filmMessages } from './filmMessages';
import { changedCards } from './FlowTree';
import { toTreeMap } from './flowTreeData';
import { hasScreenArea } from './flowTreeModel';
import { flowTreeMessages } from './flowTreeMessages';
import { JourneyMap } from './JourneyMap';
import { useMapActionStore, useMapMenuStore } from './mapActions';
import { Bar, CONNECTION, PlanBar, Working, type PlanReview, type PlanTeamAnswer } from './PlanBar';
import { buildActivity, lastReply, pendingQuestion, planPhase, stopReason, TEAM_WORKING } from './planData';
import { mapLookCss, type PickedLook, wornLook } from './planLook';
import { planMessages } from './planMessages';
import { useMapRequest } from './askRequest';
import { AskFlight, MapAsk } from './MapAsk';
import { DeleteMap, MapMenu, MapMenuItems, ScopeEditor } from './MapSettings';
import { Unmapped } from './Unmapped';
import { messages } from './messages';
import { type LaterWord, useLaterWords, useMapTalk } from './mapTalk';
import { mapOf, matchingIds, searchOrder } from './model';

type Action = FlowPrepareParams['action'];
/** Overrides for a start that is not about one card, e.g. checking several cards or a whole flow. */
interface Target {
  node?: FlowNode | null;
  flowId?: string | null;
  /** Several features at once (a batch of rechecks). */
  nodeIds?: string[];
  request?: string;
}
/** The changes list lies over the dock rather than squeezing the map below this width. */
const MIN_MAP_WIDTH = 560;
const PANEL_WIDTH = 384;
const DAY = 86_400_000;
const DRAWING_KEY = 'alpine.product-map.drawing';
const REPLY_KEY = 'alpine.product-map.reply';
const atWork = (info?: { status: string } | null) => info?.status === 'running' || info?.status === 'waiting';
/** Whether the daily check has not run for a day (or ever). */
const due = (lastRun?: string | null) => {
  const at = lastRun ? Date.parse(lastRun) : 0;
  return Number.isNaN(at) || Date.now() - at >= DAY;
};
type Lens = 'failed' | 'recheck' | 'changed' | null;
/** What a folder may hold and still be empty, as the server's `EMPTY_ANYWAY` (alpine_core.templates). */
const EMPTY_ANYWAY = new Set(['.DS_Store', '.git']);

/**
 * A project's map: the people who use the product and the journeys they walk. One row above it searches the cards,
 * lights what broke, needs a recheck or changed, opens the change history and holds the map's menu; a second row
 * appears only when something wants a look (code not on the map, parts not drawn yet, promises I rewrote, cards the
 * AI removed). Asking the AI about a card happens in the card itself.
 */
export function ProductMap({
  cwd,
  sessionId = null,
  onSession,
  onShowConversation,
  onOpenApp,
  onPublish,
  onNewHere,
  onNewProject,
  onFixConnection,
  onMemory,
  demo = false,
  dockOpen = false,
  hidden = false,
  talkSlot,
  onShowTalk,
  onOpenInApp,
  menuInWindow = false,
}: {
  cwd: string;
  sessionId?: string | null;
  onSession: (id: string) => void;
  /** Shows the attached session's conversation (the page keeps it in the dock). */
  onShowConversation?: () => void;
  /** Runs and shows the project's app (its development server, in the dock). */
  onOpenApp?: () => void;
  /** Puts the app online, offered beside 앱 열기 once it is built; absent without Alpine Cloud or a web app. */
  onPublish?: (from?: HTMLElement) => void;
  /** Opens 새 프로젝트 for this folder, which is empty (map-first 41). */
  onNewHere?: (folder: string) => void;
  /** Opens 새 프로젝트, the one place something new starts. */
  onNewProject?: () => void;
  /** Opens the model connection, where a build stopped by a sign-in, credits or a plan limit is fixed. */
  onFixConnection?: () => void;
  /** Opens the project's memory, where the AI's suggestions to remember wait for me. */
  onMemory?: () => void;
  demo?: boolean;
  /** Whether the right dock sits beside the map; when it does and the window is narrow, the changes list overlays it. */
  dockOpen?: boolean;
  /** The map is covered by the dock enlarged ("크게 보기"): its keys (`/`, Escape) must not act on it. */
  hidden?: boolean;
  /**
   * Where everything said to the map goes (map-first 43): the bottom of the conversation beside it, under the
   * conversation. `null` while that place is not shown (the map then offers the way to it); absent where the map has
   * no conversation beside it, and keeps its input on the canvas.
   */
  talkSlot?: HTMLElement | null;
  /** Shows the conversation beside the map, where the input is. */
  onShowTalk?: () => void;
  /** Opens the running app at a built screen's address (its card's `path`). */
  onOpenInApp?: (cardId: string) => void;
  /**
   * The window has a ⋯ of its own (the map's page): the map's menu is its "지도" part instead of a second ⋯ on the
   * map (useMapMenuStore).
   */
  menuInWindow?: boolean;
}) {
  const t = useMessages(messages);
  const tree = useMessages(flowTreeMessages);
  const plan = useMessages(planMessages);
  const film = useMessages(filmMessages);
  const board = useProductMap(cwd);
  const sessions = useSessions().data;
  const create = useNewSession();
  const prepare = usePrepareFlow();
  const send = useSendMessage();
  const schedule = useSetSchedule();
  const review = useReviewFlow();
  const cancel = useCancelSession();
  const teamAction = useTaskForceAction();
  const resumeTeam = useResumeTaskForce();
  // The session drawing the map from scratch (or continuing it), so the canvas can show it growing. Remembered, so
  // coming back while it still draws shows the same.
  const drawingKey = `${DRAWING_KEY}:${cwd}`;
  const [drawingSession, setDrawingSession] = useState<string | null>(() => {
    try {
      return localStorage.getItem(drawingKey);
    } catch {
      return null;
    }
  });
  const rememberDrawing = (id: string | null) => {
    setDrawingSession(id);
    try {
      if (id === null) localStorage.removeItem(drawingKey);
      else localStorage.setItem(drawingKey, id);
    } catch {
      // Shown for this visit only.
    }
  };
  const [query, setQuery] = useState('');
  const [lens, setLens] = useState<Lens>(null);
  const [reveal, setReveal] = useState<{ cardId: string; seq: number } | null>(null);
  const hit = useRef(-1);
  const search = useRef<HTMLInputElement>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [seenAt, markSeen] = useLastSeen(cwd);
  const [viewedSince, setViewedSince] = useState(seenAt);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  // The map was just deleted here: its folder keeps its code, so the map is drawn from it again (map-first 40), and
  // something else from the start begins in 새 프로젝트 (map-first 39).
  const [deletedHere, setDeletedHere] = useState(false);
  const [busy, setBusy] = useState(false);
  // What I just asked the map, flying from its input to where the map begins.
  const [flight, setFlight] = useState<{ text: string; from: DOMRect | null; toFirst: boolean; at: number } | null>(
    null,
  );
  const lock = useRef(false);
  // The width of the map's own area (this page without the dock), to decide whether the changes list overlays the dock.
  const area = useRef<HTMLElement>(null);
  const [areaWidth, setAreaWidth] = useState(Infinity);
  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => entry && setAreaWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // `model`: the work could not start for want of a working model; the line leads to the model connection.
  const [error, setError] = useState<{ text: string; detail?: string; model?: boolean } | null>(null);
  const [retry, setRetry] = useState<{ action: Action; target?: Target } | null>(null);
  // A failed send retries exactly the prepared prompt and branch, rather than creating duplicate work.
  const attempt = useRef<{ key: string; session: string; prepared?: FlowPrepareResult } | null>(null);
  const data = board.data;
  const document = data && mapOf(data);
  // Where the map talks and who does its work now: the build while it is unfinished, else the map's own conversation
  // (or, before the map has one, the session the page attached, as an older map's drawing was).
  const { mapConversation, buildSessionId, buildWorking, buildItems, buildTeam, buildState, building, talkTo } =
    useMapTalk(cwd);
  const workId = talkTo ?? sessionId;
  const work = useSession(workId);
  const workInfo = work.data?.info;
  const workTeam = work.data ? latestTaskForce(work.data.items) : null;
  // A TF the work started keeps working while the session itself waits for it.
  const workBusy = atWork(workInfo) || (!!workTeam && TEAM_WORKING.has(workTeam.status));
  // A call of this project that waits for me to allow (the work's own, its TF's agents', or another conversation's):
  // words in the map's input skip the one nearest the input and tell the AI what to do instead.
  const waitingCalls = useProjectApprovals(cwd);
  const waitingCall = waitingCalls.at(-1) ?? null;
  const approval = waitingCall?.approval ?? null;
  const answer = useAnswerApproval();
  // Other conversations of this project at work (an older one on the rail, one opened beside the map): the map waits
  // for them, and says so.
  const others = (sessions ?? []).filter(
    (s) => s.cwd === cwd && s.id !== workId && s.id !== buildSessionId && s.id !== mapConversation?.id && atWork(s),
  );
  const anyActive = workBusy || others.length > 0;
  const reasons: Record<string, string> = {
    flow_conflict: t.conflict,
    map_read_only: t.readOnlyBanner,
    invalid_flow: t.invalidFlow,
    replay_changed: t.replayChanged,
    reason_required: t.reasonRequired,
    flow_busy: t.busyEdit,
    invalid_config: t.modelNotReady,
  };
  const failed = (error: unknown) => {
    const reason = error instanceof ServerError ? String(error.data?.reason) : '';
    setError({
      text: reasons[reason] ?? t.failedStart,
      detail: error instanceof Error ? error.message : undefined,
      model: reason === 'invalid_config',
    });
  };
  const readOnly = !!data?.readOnly;
  const hasMap = !!(document?.nodes?.length || document?.flows?.length);
  // A folder with nothing in it has no code to map: it is a place to start a new product (map-first 41).
  const server = useServer();
  const rootFiles = useQuery({
    queryKey: ['project-root-files', cwd],
    queryFn: () => server.request('files/list', { cwd, path: '', limit: 20 }),
    enabled: !!data && !data.exists,
    retry: false,
  });
  // Only what the server lets 새 프로젝트 start in counts as empty: .git (a repository with nothing in it yet) and
  // .DS_Store. A folder with other hidden files (.env, .vscode) holds someone's project and is refused there.
  const emptyFolder = !!rootFiles.data && rootFiles.data.entries.every((entry) => EMPTY_ANYWAY.has(entry.name));
  // Until the folder is read, it is neither empty nor a project to draw from (unless the AI already draws it).
  const checkingFolder = !!data && !data.exists && rootFiles.isPending && !workBusy && !busy;
  const locked = busy || anyActive || readOnly;
  const project = cwd.split('/').pop() ?? cwd;
  // Only which sessions work changes the cards; their other updates (many a second while one runs) must not redraw
  // the whole map.
  const workingKey = (sessions ?? [])
    .filter((s) => s.status === 'running' || s.status === 'waiting')
    .map((s) => s.id)
    .join(' ');
  const working = useMemo(() => new Set(workingKey.split(' ').filter(Boolean)), [workingKey]);
  const treeMap = useMemo(
    () =>
      data
        ? toTreeMap(data, working, project, {
            unnamed: { ko: tree.unnamed, en: tree.unnamed },
            unnamedRole: { ko: tree.unnamedRole, en: tree.unnamedRole },
            // Cards show as soon as they are written, in a row of their own until a journey holds them.
            unplaced: { ko: plan.unplaced, en: plan.unplaced },
            unplacedRole: { ko: plan.unplacedRole, en: plan.unplacedRole },
          })
        : null,
    [data, working, project, tree.unnamed, tree.unnamedRole, plan.unplaced, plan.unplacedRole],
  );

  const landed = !!flight?.toFirst && !!treeMap?.people.length;
  useEffect(() => {
    if (!flight || (flight.toFirst && !landed)) return;
    // The stand-in fades as the first real card lands, then goes; a bubble into an existing map just goes.
    const timer = setTimeout(() => setFlight(null), 900);
    return () => clearTimeout(timer);
  }, [flight, landed]);
  const flights = useRef(0);
  const askMap = async (text: string, from: DOMRect | null) => {
    // While the AI works, a request waits and goes once the work is over.
    if (hasMap && text && (anyActive || busy)) {
      later.add(null, text);
      return true;
    }
    const shown = { text: text || t.drawBubble, from, toFirst: !hasMap, at: ++flights.current };
    setFlight(shown);
    // A map that exists takes the words as a request (do it, keep the map true); none yet, they draw it from the code.
    const started = hasMap
      ? await start('request', { request: text })
      : await start('discover', { request: text || t.discoveryRequest });
    if (!started) setFlight((current) => (current?.at === shown.at ? null : current));
    return started;
  };

  // The map's conversation lives in the right panel. It opens there by itself when the work needs me or a TF begins:
  // a TF proposed (its 시작 is there) or set off, or the AI waiting for my OK. Once per such moment.
  const calling =
    workInfo?.status === 'waiting'
      ? `wait:${workId}:${work.data?.items.length}`
      : workTeam && (workTeam.status === 'proposed' || workTeam.status === 'running')
        ? `team:${workTeam.id}:${workTeam.status}`
        : null;
  const called = useRef<string | null>(null);
  const showWork = () => {
    if (workId && workId !== sessionId) onSession(workId);
    onShowConversation?.();
  };
  const openConversation = useEffectEvent(showWork);
  useEffect(() => {
    if (calling && calling !== called.current) openConversation();
    called.current = calling;
  }, [calling]);
  // Only drawing can run on a project with no map yet, so working there is the drawing (also after a reload). A plan
  // says how it stands in its own bar.
  const drawing = workBusy && (!hasMap || drawingSession === workId);
  // Stops the map's work now, with the TF it started.
  const stopWork = () => {
    if (!workId) return;
    if (workTeam && TEAM_WORKING.has(workTeam.status))
      teamAction.mutate({ action: 'stop', sessionId: workId, runId: workTeam.id });
    cancel.mutate(workId);
  };

  const nodeOf = (id: string) => document?.nodes?.find((n) => n.id === id) ?? null;
  // A built screen opens in the running app at its address; without one (or where the page cannot go to one), the
  // app opens at its first screen.
  const canOpenInApp = !!onOpenInApp || !!onOpenApp;
  const openInApp = (cardId: string) => {
    if (onOpenInApp && nodeOf(cardId)?.path) onOpenInApp(cardId);
    else onOpenApp?.();
  };
  const conversation = useSession(mapConversation?.id ?? null);
  const conversationWorking = atWork(mapConversation);
  // My words to the conversation the map talks to, as they are: answers to its questions and anything else about the
  // plan. A conversation at work takes them when its turn is over, so they wait until then and are never lost.
  const later = useLaterWords(cwd);
  // The card a word in the input is about, from its 부탁하기 (the input is beside the map, not on the card).
  const [aboutCard, setAboutCard] = useState<string | null>(null);
  const docked = talkSlot !== undefined;
  const say = (text: string) => {
    const to = talkTo ?? sessionId;
    if (!to || !text) return false;
    later.add(to, text);
    return true;
  };

  // A product being planned on this map (it began as a plan): the question its conversation waits on, where the plan
  // stands, what the AI does now while building and the look its screens wear, all from facts (map-first 6, 17).
  const planned = !!data?.planned;
  const conversationItems = conversation.data?.items;
  const pending = useMemo(
    () => (planned && !conversationWorking ? pendingQuestion(conversationItems ?? []) : null),
    [planned, conversationWorking, conversationItems],
  );
  const question = pending?.question ?? null;
  // A build is a conversation of its own (map-first 36): the map follows it and the TF it proposes or runs. While it
  // is unfinished the map's one input goes to it, which fixes things itself (map-first 37).
  const phase = planned && data ? planPhase(data, conversationWorking, !!question, buildState) : null;
  const talking = building ? buildWorking : conversationWorking;
  // A plan whose build never began has no code: nothing on it is checked or found in code, and what is added to it is
  // planned. Once a build began there is code, even when cards were added later or the build stopped halfway.
  const planning = planned && (!data?.build || data.build === 'none');
  // A build that stopped can have asked something (rare: no sensible default), and its run says why it stopped.
  const buildQuestion = useMemo(
    () => (phase === 'stopped' ? (pendingQuestion(buildItems ?? [])?.question ?? null) : null),
    [phase, buildItems],
  );
  const shownQuestion = phase === 'stopped' ? buildQuestion : question;
  const [lookPreview, setLookPreview] = useState<{ question: string; option: number } | null>(null);
  const previewing = shownQuestion && lookPreview?.question === shownQuestion.id ? lookPreview.option : 0;
  // The pointer on a look option tries it while it stays there; off them, the one pressed is tried again.
  const [lookHover, setLookHover] = useState<{ question: string; option: number } | null>(null);
  const tried = (shownQuestion && lookHover?.question === shownQuestion.id ? lookHover.option : null) ?? previewing;
  const [pickedLook, setPickedLook] = useState<PickedLook | null>(null);
  const mapLook = data?.look ? mapLookCss(data.look) : undefined;
  const tryingLook = shownQuestion?.options[tried]?.look ? shownQuestion.options[tried] : null;
  // Looking at a look option restyles every screen on the map at once; a look picked is worn until the AI writes the
  // map's own look after the answer; else the map wears its own look.
  const look = wornLook(tryingLook?.look, pickedLook, mapLook);
  const activity =
    phase === 'building' && data
      ? (buildActivity(buildItems ?? [], data, {
          onCard: plan.activityOnCard,
          // A build's edits no card claims are what every screen stands on: the data and the structure.
          editing: plan.activityStructure,
          running: plan.activityRunning,
          reading: plan.activityReading,
          thinking: plan.activityThinking,
        }) ?? { text: plan.activityThinking, touching: [] })
      : null;
  // The same facts for work on a map that is not a plan, or a plan already built (a request, a change, a check): what
  // the AI does now, in a line above the input with 멈추기, and the cards it touches.
  const ownLine = !planned || phase === 'built';
  const workActivity =
    ownLine && workBusy && data
      ? buildActivity(work.data?.items ?? [], data, {
          onCard: t.workOnCard,
          editing: plan.activityEditing,
          running: plan.activityRunning,
          reading: plan.activityReading,
          thinking: plan.activityThinking,
        })
      : null;
  const workText = drawing
    ? hasMap
      ? t.drawingFound(document?.flows?.length ?? 0, document?.nodes?.length ?? 0)
      : t.drawingFirst
    : (workActivity?.text ?? plan.activityThinking);
  const touchingKey = (activity ?? workActivity)?.touching.join(' ') ?? '';
  const touching = useMemo(() => new Set(touchingKey.split(' ').filter(Boolean)), [touchingKey]);
  // A question the AI answered on its own, opened from its card to answer again; from the done line, one after
  // another through every card the AI decided on.
  const [reviewing, setReviewing] = useState<string | null>(null);
  const aiPick = (cardId: string) => treeMap?.cards[cardId]?.picks?.findLast((pick) => pick.by === 'ai');
  const aiPicked = Object.values(treeMap?.cards ?? {}).filter((card) => card.picks?.some((pick) => pick.by === 'ai'));
  const reviewOrder = aiPicked.map((card) => card.id);
  const reviewAt = reviewing ? reviewOrder.indexOf(reviewing) : -1;
  const reviewPick = reviewing ? aiPick(reviewing) : undefined;
  const pickReview: PlanReview | null =
    reviewing && reviewPick
      ? {
          card: treeMap?.cards[reviewing]?.title ?? '',
          picked: Math.max(reviewPick.options.indexOf(reviewPick.answer), 0),
          question: {
            id: `pick:${reviewing}`,
            about: reviewing,
            text: reviewPick.question,
            options: (reviewPick.options.length ? reviewPick.options : [reviewPick.answer]).map((label) => ({ label })),
          },
          position: reviewAt >= 0 && reviewOrder.length > 1 ? { index: reviewAt + 1, total: reviewOrder.length } : null,
        }
      : null;
  const nextReview = () => setReviewing(reviewAt >= 0 ? (reviewOrder[reviewAt + 1] ?? null) : null);
  // Another answer to a question the AI decided: while building it goes to the build, which redoes that part; once
  // built it is a change to that card, like a card's own "부탁하기".
  const changeDecision = (answer: string) => {
    if (!pickReview || !reviewing) return;
    const words = plan.changeDecisionMessage(pickReview.card, pickReview.question.text, answer);
    if (phase !== 'built') say(words);
    else if (anyActive || busy) later.add(null, words, reviewing);
    else void start('change', { node: nodeOf(reviewing), request: words });
  };
  // "이대로 만들기" starts the build in a new conversation that reads only the map; 이어서 만들기 continues that one.
  const startBuild = async (request: string) => {
    if (!data || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const sessionId =
        buildSessionId ??
        (
          await create.mutateAsync({
            cwd,
            purpose: 'build',
            agent: mapConversation?.agent ?? newAgent ?? undefined,
            mode: mapConversation?.mode ?? newMode ?? undefined,
          })
        ).id;
      const prepared = await prepare.mutateAsync({
        cwd,
        revision: data.revision,
        action: 'build',
        request,
        nodeId: null,
        flowId: null,
        sessionId,
      });
      await send.mutateAsync({ sessionId, text: prepared.prompt });
      onSession(sessionId);
    } catch (error) {
      failed(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  // A build whose TF was cut off (the app closed) goes on where the TF was; any other stopped build is asked to go on.
  const continueBuild = () =>
    buildTeam?.status === 'interrupted' && buildSessionId
      ? resumeTeam.mutate({ sessionId: buildSessionId, runId: buildTeam.id, fresh: false })
      : void startBuild(plan.continueRequest);
  const answerTeam = (answer: PlanTeamAnswer) =>
    buildTeam &&
    buildSessionId &&
    teamAction.mutate({ action: answer, sessionId: buildSessionId, runId: buildTeam.id });
  const promisesAll = Object.values(treeMap?.cards ?? {}).flatMap((card) => card.promises);
  // The card the build works on now: the one its latest edit touched, else one the AI marked as being built.
  const making =
    phase === 'building'
      ? ([...touching].at(-1) ?? document?.nodes?.find((node) => node.phase === 'building')?.id ?? null)
      : null;
  // Who does the map's work: the conversation the map talks to once it exists (the build while it is unfinished),
  // until then my pick for it (else the project's last agent, as a new conversation would take).
  const agents = useAgents().data?.agents;
  const defaultModel = useConnections().data?.defaultModel ?? null;
  const lastAgent = useProjects().data?.projects.find((p) => p.path === cwd)?.lastAgent ?? null;
  const [newAgent, setNewAgent] = useState<string | null>(null);
  const setAgent = useSetSessionAgent();
  const wantedAgent = newAgent ?? lastAgent ?? 'default';
  const pickedAgent = agents?.some((a) => a.id === wantedAgent) ? wantedAgent : 'default';
  const talkInfo = (sessions ?? []).find((s) => s.id === talkTo) ?? (talkTo === workId ? workInfo : null) ?? null;
  // The plan's conversation follows a change made while the build talks, so the two never work by different rules.
  const alsoMap = mapConversation && mapConversation.id !== talkInfo?.id ? mapConversation : null;
  // How much the map's agents may do without asking (a TF's agents follow it too): the conversation's, until it
  // exists my pick for it, else the default in Settings, which is what a new conversation is made with.
  const [newMode, setNewMode] = useState<Mode | null>(null);
  const defaultMode = useSettings().data?.mode;
  const setMode = useSetSessionMode();
  const modeChip = (
    <ModeChip
      mode={talkInfo?.mode ?? newMode ?? defaultMode ?? 'default'}
      onChange={(mode) => {
        if (!talkInfo) return setNewMode(mode);
        setMode.mutate({ sessionId: talkInfo.id, mode });
        if (alsoMap) setMode.mutate({ sessionId: alsoMap.id, mode });
      }}
    />
  );
  const agentChip = talkInfo ? (
    <AgentChip
      context="session"
      agentId={talkInfo.agent ?? 'default'}
      model={talkInfo.model}
      // An agent takes over between turns: it waits while the conversation works.
      disabled={atWork(talkInfo) || setAgent.isPending}
      onChange={(agent) => {
        setAgent.mutate({ sessionId: talkInfo.id, agent });
        if (alsoMap && !atWork(alsoMap)) setAgent.mutate({ sessionId: alsoMap.id, agent });
      }}
    />
  ) : (
    <AgentChip
      context="new"
      agentId={pickedAgent}
      model={agents?.find((a) => a.id === pickedAgent)?.model ?? defaultModel}
      lastUsed={lastAgent}
      onChange={setNewAgent}
    />
  );
  // The top bar starts the build and stops the work through this map (MapTopActions), as the map itself would.
  const latest = useRef({ build: () => {}, stop: () => {} });
  useLayoutEffect(() => {
    latest.current = { build: () => void startBuild(t.buildRequest), stop: stopWork };
  });
  const registerActions = useMapActionStore((state) => state.register);
  const left = data?.undecided?.length ?? 0;
  const cardCount = document?.nodes?.length ?? 0;
  const builtCount = (document?.nodes ?? []).filter((node) => node.phase === 'built').length;
  const mapWorking = workBusy || talking || phase === 'building';
  // While no card is being built the strip shows nothing at work, so the top bar says what the build does now.
  const buildLine = phase === 'building' && !making ? (activity?.text ?? null) : null;
  useEffect(() => {
    registerActions(cwd, {
      phase,
      left,
      cards: cardCount,
      built: builtCount,
      working: mapWorking,
      activity: buildLine,
      busy,
      build: () => latest.current.build(),
      stop: () => latest.current.stop(),
    });
  }, [registerActions, cwd, phase, left, cardCount, builtCount, mapWorking, buildLine, busy]);
  useEffect(() => () => registerActions(cwd, null), [registerActions, cwd]);
  // What a promise's own answers need: the map, whether it may be written, and how to ask the AI about it.
  const promiseProps = (node: FlowNode) => ({
    cwd,
    board: data!,
    node,
    readOnly,
    editLocked: anyActive,
    onRecheck: planning ? undefined : () => void start('verify', { node }),
    onNotARule: (conditionId: string) => {
      const rule = node.conditions?.find((c) => c.id === conditionId)?.expectation ?? '';
      void start('change', { node, request: t.notRuleRequest(node.title, rule) });
    },
  });
  const unseen = newChanges(data?.changes, seenAt).length;
  // Suggestions to remember wait in the conversation, which may be closed: the map says they are there.
  const memoryWaiting = useMemory(onMemory ? cwd : null).data?.pending.length ?? 0;

  const start = async (action: Action, target?: Target) => {
    if (!data || board.isError || lock.current || data.readOnly) return false;
    // A run already going in this project owns the work; only a retry of a start already under way may go on. Any
    // other press says why nothing happens, and can be pressed again once the work is over.
    if (anyActive && !attempt.current) {
      setError({ text: t.busyStart });
      setRetry({ action, target });
      return false;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    setRetry({ action, target });
    setConfirmRebuild(false);
    const subject = target?.node ?? null;
    const key = JSON.stringify([cwd, action, subject?.id, target?.flowId, target?.nodeIds, target?.request]);
    try {
      if (attempt.current?.key !== key) {
        // All map work goes on in the project's one map conversation, made the first time.
        const conversation =
          mapConversation?.id ??
          (
            await create.mutateAsync({
              cwd,
              purpose: 'map',
              agent: newAgent ?? undefined,
              mode: newMode ?? undefined,
            })
          ).id;
        attempt.current = { key, session: conversation };
      }
      const current = attempt.current;
      if (!current.prepared) {
        const asked = {
          cwd,
          revision: data.revision,
          action,
          request:
            target?.request || (action === 'discover' ? t.discoveryRequest : t.checkRequest(subject?.title ?? '')),
          nodeId: action === 'discover' ? null : (subject?.id ?? null),
          flowId: action === 'discover' ? null : (target?.flowId ?? null),
          ...(target?.nodeIds ? { nodeIds: target.nodeIds.slice(0, 500) } : {}),
          sessionId: current.session,
        };
        try {
          current.prepared = await prepare.mutateAsync(asked);
        } catch (error) {
          // The map moved on since it was read (the AI, a check or a capture wrote to it): read it again and go on,
          // rather than refusing a press that asked for nothing the change touches.
          if (!(error instanceof ServerError && error.data?.reason === 'flow_conflict')) throw error;
          const fresh = await server.request('flow/get', { cwd });
          current.prepared = await prepare.mutateAsync({ ...asked, revision: fresh.revision });
        }
      }
      await send.mutateAsync({ sessionId: current.session, text: current.prepared.prompt });
      // The drawing line belongs to drawing runs only; the same conversation also does other map work.
      rememberDrawing(action === 'discover' ? current.session : null);
      onSession(current.session);
      attempt.current = null;
      setRetry(null);
      return true;
    } catch (error) {
      failed(error);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  // Words that waited for the AI go, oldest first, once what they go to is free: a conversation between its turns, a
  // request to the map once nothing in the project works. Each place keeps its own order, so words that could not go
  // (or failed) hold back only later words to the same place, and say so; the rest go on. Words for a conversation
  // that is gone (deleted or archived meanwhile) go where the map talks now, rather than failing there for ever.
  const gone = (to: string) => !!sessions && !sessions.some((s) => s.id === to && !s.archived);
  // Where the map talks may itself be gone (the page still names a conversation just deleted): then the words go to the
  // map as a request.
  const here = [talkTo, sessionId].find((id) => id && !gone(id)) ?? null;
  const placeOf = (word: LaterWord) => (word.to && gone(word.to) ? here : word.to);
  const targetBusy = (to: string | null) =>
    to === null ? anyActive || busy : to === workId ? workBusy : atWork((sessions ?? []).find((s) => s.id === to));
  // Until the conversations and the map are known, no one can tell where words go (a request needs the map). A word
  // that failed at a conversation now gone is tried again where the map talks.
  const held = (word: LaterWord, index: number) =>
    !sessions ||
    !data ||
    (!!word.failed && !(word.to && gone(word.to))) ||
    targetBusy(placeOf(word)) ||
    later.words.slice(0, index).some((before) => placeOf(before) === placeOf(word));
  const next = later.words.find((word, index) => !held(word, index));
  const [nudge, setNudge] = useState(0);
  const sending = useRef<string | null>(null);
  useEffect(() => {
    if (!next || sending.current) return;
    sending.current = next.id;
    const word = next;
    const to = placeOf(word);
    const done = () => (sending.current = null);
    if (to === null) {
      // A request is prepared when it goes; if it fails, the error above the map offers to try again.
      const node = word.node ? nodeOf(word.node) : null;
      void (node ? start('change', { node, request: word.text }) : start('request', { request: word.text })).finally(
        () => {
          later.drop(word.id);
          done();
        },
      );
      return;
    }
    // The dock stays on whatever I opened meanwhile: the words reach the conversation without taking me there.
    send.mutate(
      { sessionId: to, text: word.text },
      {
        onSuccess: () => {
          later.drop(word.id);
          done();
        },
        onError: (error) => {
          done();
          // It started working a moment before: it goes when this turn is over.
          if (error instanceof ServerError && error.code === SESSION_RUNNING)
            setTimeout(() => setNudge((n) => n + 1), 1000);
          else later.fail(word.id, true, to);
        },
      },
    );
    // `start`, `send` and `later` are new on every render; what decides a send is the word that can go now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.id, nudge]);
  // Words shown as waiting: every one that cannot go yet (its place at work, or words before it to the same place
  // still waiting), and those that could not be sent.
  const waitingWords = later.words.filter((word, index) => held(word, index));

  const syncMap = () => void start('sync', { request: t.syncRequest });
  const continueMap = () => void start('discover', { request: t.continueRequest });
  const recheck = useMemo(() => (data ? recheckIds(data) : []), [data]);
  const recheckAll = () => void start('verify', { nodeIds: recheck, request: t.recheckAllRequest });
  // Promises the user rewrote that nothing has checked since: one run checks them all (decision 16).
  const edited = useMemo(() => {
    const found: { nodeId: string; count: number }[] = [];
    for (const [nodeId, state] of Object.entries(data?.states ?? {})) {
      const count = Object.values(state.promises ?? {}).filter(
        (p) => p.written && (p.status === 'recheck' || p.status === 'unconfirmed'),
      ).length;
      if (count) found.push({ nodeId, count });
    }
    return found;
  }, [data]);
  const editedCount = edited.reduce((sum, item) => sum + item.count, 0);
  const checkEdited = () =>
    void start('verify', { nodeIds: edited.map((item) => item.nodeId), request: t.editedVerifyRequest });

  // Cards by what their promises say (one broke, or one needs a look again), and what changed since I last looked.
  const lenses = useMemo(() => {
    const failed = new Set<string>();
    const again = new Set<string>();
    for (const card of Object.values(treeMap?.cards ?? {})) {
      if (card.promises.some((p) => p.status === 'failed')) failed.add(card.id);
      if (card.promises.some((p) => p.status === 'recheck')) again.add(card.id);
    }
    return {
      failed,
      recheck: again,
      changed: treeMap ? changedCards(treeMap, seenAt ?? undefined) : new Set<string>(),
    };
  }, [treeMap, seenAt]);

  // Search lights the cards whose words, tags or promises match; it never hides any, because a missing step would
  // break its journey. Enter (or "다음") brings the next one into view.
  const matched = useMemo(() => (data ? matchingIds(mapOf(data), query) : null), [data, query]);
  const hits = useMemo(() => (data && matched ? searchOrder(mapOf(data), matched) : []), [data, matched]);
  const nextHit = () => {
    if (!hits.length) return;
    hit.current = (hit.current + 1) % hits.length;
    setReveal({ cardId: hits[hit.current]!.nodeId, seq: Date.now() });
  };
  const verifyFound = () =>
    void start('verify', {
      nodeIds: [...new Set(hits.map((h) => h.nodeId))],
      request: t.verifyFoundRequest(query.trim()),
    });
  const lit = matched ?? (lens ? lenses[lens] : null);
  const pick = (next: Lens) => setLens(lens === next ? null : next);

  const openChanges = () => {
    if (changesOpen) return setChangesOpen(false);
    setViewedSince(seenAt);
    markSeen();
    setChangesOpen(true);
  };

  // The optional daily check starts one batch while the map is open, and notes that it ran only when it started.
  const scheduled = useRef<string | null>(null);
  useEffect(() => {
    const plan = data?.schedule;
    if (!data || !plan?.enabled || data.readOnly || busy || anyActive || board.isError) return;
    // Only a map just fetched from the server says when the check last ran.
    if (!board.isFetchedAfterMount || board.isFetching) return;
    if (scheduled.current === cwd || !due(plan.lastRun)) return;
    const ids = recheckIds(data).slice(0, plan.limit ?? 20);
    if (!ids.length) return;
    // Once per open map, win or lose. Claiming the day comes first: the server refuses when another window already did.
    scheduled.current = cwd;
    schedule.mutate(
      { cwd, enabled: true, limit: plan.limit ?? 20, ran: true },
      { onSuccess: () => void start('verify', { nodeIds: ids, request: t.scheduledRequest }) },
    );
  });
  useEffect(() => {
    const editable = (el: Element | null) =>
      !!el && (el.matches('input, textarea, select') || (el as HTMLElement).isContentEditable);
    const onKey = (event: KeyboardEvent) => {
      if (hidden || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '/' && !editable(globalThis.document.activeElement) && search.current) {
        event.preventDefault();
        search.current.focus();
      } else if (event.key === 'Escape' && !editable(globalThis.document.activeElement) && changesOpen) {
        setChangesOpen(false);
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  });

  // With the dock beside it, the map keeps MIN_MAP_WIDTH and the changes list is laid over the dock instead.
  const overlay = dockOpen && areaWidth < MIN_MAP_WIDTH + PANEL_WIDTH;
  const uncovered = data?.coverage?.git ? (data.coverage.uncoveredCount ?? 0) : 0;
  // A plan not built yet has no code to compare with or check against: only cards the AI removed are worth a look.
  // A map that began as a plan is the contract, not a reading of the code, so the code it leaves off (the template's
  // server, its settings) is never news on it.
  const notices =
    !!data &&
    hasMap &&
    (planning
      ? !!data.removedCards?.length
      : (!planned && (uncovered > 0 || !!data.unmapped?.length)) || editedCount > 0 || !!data.removedCards?.length);

  // A deleted map starts over from nothing: its conversation is put away (archived, not deleted) and the next request
  // begins a new one, so nothing of the old drawing shows above the input.
  const details = useSetSessionDetails();
  const startOver = () => {
    rememberDrawing(null);
    setFlight(null);
    setDeletedHere(true);
    if (mapConversation && !anyActive) details.mutate({ sessionId: mapConversation.id, archived: true });
    onSession('');
  };

  // A conversation brought over from another app opens in the dock, as the map's other conversations do.
  const openImported = (id: string) => {
    onSession(id);
    onShowConversation?.();
  };

  // The AI's last answer, above the input until I close it (map-first 3): on a map, and on a plan once built or when
  // it ended without a question.
  const replyKey = `${REPLY_KEY}:${cwd}`;
  const [seenReply, setSeenReply] = useState<string | null>(() => {
    try {
      return localStorage.getItem(replyKey);
    } catch {
      return null;
    }
  });
  const reply = !workBusy && !building && !busy ? lastReply(work.data?.items ?? []) : null;
  const replyTime = !planned || phase === 'built' || (phase === 'asking' && !question);
  const showReply = !!reply && reply.id !== seenReply && replyTime;
  const markReplySeen = (id: string) => {
    setSeenReply(id);
    try {
      localStorage.setItem(replyKey, id);
    } catch {
      // Closed for this visit only.
    }
  };
  const closeReply = () => reply && markReplySeen(reply.id);
  // While a plan is decided and built, the plan's conversation answers nothing above the input; what it said last is
  // behind me, and must not come back as the answer once the product is built (the map talks there again).
  const passedReply = reply && !replyTime && reply.id !== seenReply ? reply.id : null;
  if (passedReply) markReplySeen(passedReply);
  const replyStop = reply?.stopped;
  const replyText = reply ? (reply.stopped ? plan[`stoppedWhy_${reply.stopped}`] : reply.text) : '';
  // Words from the map's one input: another answer while a decision of the AI is open, the plan's conversation (or
  // the build's) while it is a plan, else a request to the map.
  const sendWords = async (text: string, from: DOMRect | null) => {
    if (waitingCall && text)
      return answer
        .mutateAsync({
          sessionId: waitingCall.info.id,
          requestId: waitingCall.approval.id,
          decision: 'deny',
          feedback: text,
        })
        .then(
          () => true,
          () => {
            setError({ text: t.answerFailed });
            return false;
          },
        );
    if (pickReview && text) {
      changeDecision(text);
      nextReview();
      return true;
    }
    // A card's 부탁하기 names its card; looking at a screen in the app view names that screen (flow-spec 5.3).
    const looking = lookingAt(cwd);
    const about = aboutCard ? nodeOf(aboutCard) : looking ? nodeOf(looking) : null;
    if (about && text) {
      const taken = await askAbout(about, text);
      if (taken) setAboutCard(null);
      return taken;
    }
    if (planned && phase !== 'built') return say(text);
    return askMap(text, from);
  };
  // Words about one card: while planning or building they go to that conversation (map-first 37); otherwise a change
  // to the card, kept until the AI is free.
  const askAbout = (node: FlowNode, request: string): Promise<boolean> =>
    planned && phase !== 'built'
      ? Promise.resolve(say(plan.cardRequest(node.title, request)))
      : anyActive
        ? Promise.resolve(later.add(null, request, node.id)).then(() => true)
        : start('change', { node, request });
  // Everything said to the map sits under the conversation beside it; on its own the map keeps it on the canvas.
  const placeTalk = (content: ReactNode) => {
    if (!docked)
      return (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 mx-auto flex w-[min(640px,calc(100%-32px))] flex-col gap-2">
          {content}
        </div>
      );
    if (talkSlot)
      return createPortal(
        <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-canvas p-3 [&_.shadow-overlay]:shadow-none">
          {content}
        </div>,
        talkSlot,
      );
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
        <Button className="pointer-events-auto shadow-overlay" onClick={onShowTalk}>
          {t.talkOpen}
        </Button>
      </div>
    );
  };
  const waitsForWork = planned && phase !== 'built' ? workBusy : hasMap && anyActive;

  // Words sent from elsewhere (the 미리보기's 고쳐 달라고 하기) go where my own would, but never answer a decision.
  const requested = useMapRequest((state) => (state.request?.cwd === cwd ? state.request.text : null));
  const takeRequest = useEffectEvent((text: string) => {
    useMapRequest.getState().take();
    if (planned && phase !== 'built') say(text);
    else void askMap(text, null);
  });
  useEffect(() => {
    if (requested) takeRequest(requested);
  }, [requested]);

  // Why work could not start. Beside the conversation it shows under it, where the press was, so it is seen with the
  // app on view too (the map, and anything over it, is hidden then).
  const errorBar = error && (
    <div
      role="alert"
      className={clsx(
        'flex flex-wrap items-center gap-3 bg-diff-removed text-body text-danger',
        docked ? 'pointer-events-auto rounded-xl px-3 py-2' : 'border-b border-line px-5 py-3',
      )}
    >
      <span className="min-w-0 grow break-words">
        {error.text}
        {error.detail && error.detail !== error.text && (
          <details className="mt-1 text-meta text-fg-muted">
            <summary className="cursor-pointer">{t.technicalInfo}</summary>
            <span className="break-words">{error.detail}</span>
          </details>
        )}
      </span>
      {error.model && onFixConnection ? (
        <Button variant="primary" onClick={onFixConnection}>
          {plan.fixConnection}
        </Button>
      ) : (
        retry && (
          <Button disabled={busy || anyActive} onClick={() => void start(retry.action, retry.target)}>
            {t.retry}
          </Button>
        )
      )}
      <button
        type="button"
        aria-label={t.closeError}
        title={t.closeError}
        onClick={() => setError(null)}
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-hover"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
  const menuItems = data && (
    <MapMenuItems
      cwd={cwd}
      board={data}
      readOnly={readOnly}
      unseen={unseen}
      canStart={!(locked || board.isError)}
      planning={planning}
      onChanges={data.changes?.length ? openChanges : undefined}
      onRediscover={() => setConfirmRebuild(true)}
      onScope={() => setScopeOpen(true)}
      onDelete={() => setDeleting(true)}
      recheck={recheck.length}
      onRecheck={recheckAll}
      // The window's ⋯ has 기억 already.
      onMemory={menuInWindow ? undefined : onMemory}
    />
  );
  const mapMenu = menuItems && !menuInWindow && <MapMenu unseen={unseen}>{menuItems}</MapMenu>;
  // On the map's page the map's menu is the "지도" part of the window's ⋯, so the page has one ⋯. Before the first
  // card the map may already exist (being drawn, or stopped early), and its menu is there too.
  const registerMenu = useMapMenuStore((state) => state.register);
  const windowMenu = menuInWindow && (hasMap || workBusy || !!data?.exists) ? menuItems : null;
  useEffect(() => {
    registerMenu(cwd, windowMenu ? { items: windowMenu, dot: unseen > 0 } : null);
  });
  useEffect(() => () => registerMenu(cwd, null), [registerMenu, cwd]);

  return (
    <main ref={area} className="flex min-h-0 min-w-0 grow flex-col bg-canvas contain-inline-size" aria-label={t.title}>
      {/* Before the first card the map may already exist (being drawn, or stopped early): its menu (scope, delete)
          is here too, so a map is never out of reach. */}
      {!hasMap && data && (workBusy || data.exists) && mapMenu && (
        <div className="flex min-h-11 shrink-0 items-center gap-2 bg-canvas-sunken px-10 py-1.5">
          <span className="grow" />
          {mapMenu}
        </div>
      )}
      {/* Over the filmstrip, quiet: the search (a plan being decided has nothing to search yet), what wants a look
          only when something does, and the map's menu. */}
      {hasMap && data && (
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 bg-canvas-sunken px-10 py-1.5">
          {/* Every screen wears the look being tried: the map says whose. */}
          {tryingLook && (
            <p role="status" className="flex items-center gap-1.5 text-meta text-fg-muted">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-interactive" />
              {plan.previewingLook(tryingLook.label)}
            </p>
          )}
          {!planning && (
            <label className="relative flex w-52 min-w-36 items-center">
              <span className="sr-only">{t.searchLabel}</span>
              <Search size={13} className="pointer-events-none absolute left-2.5 text-fg-faint" />
              <input
                ref={search}
                type="search"
                value={query}
                placeholder={t.searchPlaceholder}
                onChange={(event) => {
                  hit.current = -1;
                  setQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    hit.current = -1;
                    setQuery('');
                  } else if (event.key === 'Enter' && query.trim()) {
                    event.preventDefault();
                    nextHit();
                  }
                }}
                className="h-8 w-full min-w-0 rounded-lg border border-line bg-canvas-raised pr-2 pl-8 text-body"
              />
            </label>
          )}
          {query.trim() && (
            <span className="flex items-center gap-2 text-meta text-fg-muted">
              <span className="tabular-nums">{t.found(hits.length)}</span>
              {hits.length > 1 && (
                <LinkButton aria-label={t.nextMatch} onClick={nextHit}>
                  {t.nextMatchShort}
                </LinkButton>
              )}
              {hits.length > 0 && !planning && (
                <LinkButton disabled={locked} onClick={verifyFound}>
                  {t.verifyFound}
                </LinkButton>
              )}
            </span>
          )}
          <span className="grow" />
          {lenses.failed.size > 0 && (
            <Chip pressed={lens === 'failed'} tone="danger" onClick={() => pick('failed')}>
              <CircleX size={13} aria-hidden />
              {t.lensFailed(lenses.failed.size)}
            </Chip>
          )}
          {lenses.recheck.size > 0 && (
            <Chip pressed={lens === 'recheck'} tone="attention" onClick={() => pick('recheck')}>
              <RotateCcw size={13} aria-hidden />
              {t.lensRecheck(lenses.recheck.size)}
            </Chip>
          )}
          {/* While a plan is drawn or built every card is the AI's change: only later ones are news. */}
          {lenses.changed.size > 0 && !planning && !building && (
            <Chip pressed={lens === 'changed'} onClick={() => pick('changed')}>
              <Sparkles size={13} aria-hidden />
              {t.lensChanged(lenses.changed.size)}
            </Chip>
          )}
          {memoryWaiting > 0 && onMemory && (
            <Chip pressed={false} tone="attention" onClick={onMemory}>
              <Brain size={13} aria-hidden />
              {t.memoryWaiting(memoryWaiting)}
            </Chip>
          )}
          <ImportLink cwd={cwd} onOpen={openImported} />
          {mapMenu}
        </div>
      )}
      {notices && data && (
        <ul
          aria-label={t.noticesLabel}
          className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line bg-canvas-sunken px-8 py-1"
        >
          {!planned && uncovered > 0 && data.coverage && (
            <Coverage coverage={data.coverage} exclude={data.exclude ?? []} disabled={locked} onSync={syncMap} />
          )}
          {!planned && <Unmapped parts={data.unmapped ?? []} disabled={locked} onContinue={continueMap} />}
          {!planning && editedCount > 0 && (
            <li data-edited className="flex min-h-7 items-center gap-2 px-2 text-body">
              {t.editedPromises(editedCount)}
              <LinkButton disabled={locked} onClick={checkEdited}>
                {t.editedCheck}
              </LinkButton>
            </li>
          )}
          {!!data.removedCards?.length && (
            <li>
              <Popover.Root>
                <Popover.Trigger className={noticeRow}>
                  {t.removedCardsShort(data.removedCards.length)}
                  <ChevronRight size={13} aria-hidden className="text-fg-muted" />
                </Popover.Trigger>
                <Popover.Popup align="start" className="w-96 gap-2 p-3">
                  <section aria-label={t.removedCards} className="flex flex-col gap-1.5">
                    <h2 className="text-meta text-attention">{t.removedCards}</h2>
                    <ul className="flex flex-col gap-1.5">
                      {data.removedCards.map((card) => (
                        <li key={card.id} className="flex flex-wrap items-center gap-x-2 text-body">
                          <span className="min-w-0 grow">{card.title}</span>
                          <LinkButton
                            disabled={review.isPending || anyActive || readOnly}
                            onClick={() => review.mutate({ cwd, target: 'card', action: 'accept', nodeId: card.id })}
                          >
                            {t.acceptChange}
                          </LinkButton>
                          <LinkButton
                            disabled={review.isPending || anyActive || readOnly}
                            onClick={() => review.mutate({ cwd, target: 'card', action: 'restore', nodeId: card.id })}
                          >
                            {t.restoreMine}
                          </LinkButton>
                        </li>
                      ))}
                    </ul>
                  </section>
                </Popover.Popup>
              </Popover.Root>
            </li>
          )}
        </ul>
      )}
      {confirmRebuild && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-canvas-sunken px-5 py-3 text-body">
          <span className="min-w-0 grow">{t.rediscoverConfirm}</span>
          {anyActive && !busy && <span className="text-meta text-fg-muted">{t.busyStartShort}</span>}
          <Button variant="primary" disabled={locked} onClick={() => void start('discover')}>
            {busy ? t.starting : t.rediscoverStart}
          </Button>
          <Button onClick={() => setConfirmRebuild(false)}>{t.cancel}</Button>
        </div>
      )}
      {scopeOpen && data && (
        <div className="flex items-start gap-3 border-b border-line bg-canvas-sunken px-5 py-3">
          <div className="min-w-0 grow">
            <ScopeEditor cwd={cwd} board={data} readOnly={readOnly} label={t.scopeTitle} />
          </div>
          <Button onClick={() => setScopeOpen(false)}>{t.close}</Button>
        </div>
      )}
      {deleting && <DeleteMap cwd={cwd} onClose={() => setDeleting(false)} onDeleted={startOver} />}
      {readOnly && (
        <p role="status" className="border-b border-line bg-canvas-sunken px-5 py-2 text-body">
          {t.readOnlyBanner}
        </p>
      )}
      {!!data?.problems?.length && (
        <details className="border-b border-line bg-canvas-sunken px-5 py-2 text-body">
          <summary className="cursor-pointer">{t.problemsBanner(data.problems.length)}</summary>
          <ul className="mt-2 flex flex-col gap-1 text-meta text-fg-muted" aria-label={t.problemsDetail}>
            {data.problems.map((problem) => (
              <li key={`${problem.file}-${problem.message}`}>
                {t.problemLine} <span className="font-mono break-all">{problem.file}</span>
                <details className="text-fg-faint">
                  <summary className="cursor-pointer">{t.technicalInfo}</summary>
                  {problem.message}
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
      {data?.review && (
        <div
          data-review
          className="flex flex-wrap items-center gap-3 border-b border-line bg-canvas-sunken px-5 py-3 text-body"
        >
          <div className="min-w-0 grow">
            <p className="font-medium">{t.reviewTitle}</p>
            {!!data.review.added?.length && (
              <p className="text-meta text-fg-muted">{t.reviewAdded(data.review.added.join(', '))}</p>
            )}
            {!!data.review.removed?.length && (
              <p className="text-meta text-fg-muted">{t.reviewRemoved(data.review.removed.join(', '))}</p>
            )}
            {!!data.review.changed?.length && (
              <p className="text-meta text-fg-muted">{t.reviewChanged(data.review.changed.join(', '))}</p>
            )}
            {review.isError && (
              <p role="alert" className="text-meta text-danger">
                {review.error instanceof ServerError && review.error.data?.reason === 'flow_busy'
                  ? t.busyEdit
                  : t.editFailed}
              </p>
            )}
          </div>
          <Button
            variant="primary"
            disabled={review.isPending || anyActive || readOnly}
            onClick={() => review.mutate({ cwd, target: 'map', action: 'accept' })}
          >
            {t.acceptChange}
          </Button>
          <Button
            disabled={review.isPending || anyActive || readOnly}
            onClick={() => review.mutate({ cwd, target: 'map', action: 'restore' })}
          >
            {t.reviewRestore}
          </Button>
        </div>
      )}
      {!docked && errorBar}
      {board.isError && data && (
        <p role="alert" className="border-b border-line bg-diff-removed px-5 py-2 text-meta text-danger">
          {t.loadFailed}
        </p>
      )}
      <div className="relative flex min-h-0 min-w-0 grow">
        {board.isError && !data ? (
          <div className="flex grow flex-col items-center justify-center gap-3 p-8">
            <p role="alert" className="text-body text-danger">
              {t.loadFailed}
            </p>
            <Button onClick={() => void board.refetch()}>{t.retry}</Button>
          </div>
        ) : !data ? (
          <p className="p-8 text-body text-fg-muted">{t.loading}</p>
        ) : !hasMap && planned ? (
          // A plan before its first card: the place of its first screen, drawn as the AI reads the one line (or, when
          // it stopped before a card, still a plan waiting to be drawn on; the bar under the conversation says so).
          <div className="flex min-w-0 grow flex-col items-center justify-center gap-4 bg-canvas-sunken p-8">
            <span
              aria-hidden
              className={clsx(
                'h-100 w-50 border border-dashed border-line',
                (drawing || busy) && 'animate-pulse motion-reduce:animate-none',
              )}
              style={{ borderRadius: 26 }}
            />
            {(drawing || busy) && <p className="text-body text-fg-muted">{film.firstScreens}</p>}
          </div>
        ) : !hasMap && (drawing || busy) && flight ? (
          // The stand-in card holds the first place until the first journey lands.
          <div className="min-w-0 grow" />
        ) : !hasMap && (drawing || busy) ? (
          // The canvas, still empty: the first cards land here as soon as the AI writes them.
          <div className="flex min-w-0 grow items-center justify-center">
            <span aria-hidden className="h-16 w-44 animate-pulse rounded-xl border border-dashed border-line" />
          </div>
        ) : !hasMap && checkingFolder ? (
          <p className="p-8 text-body text-fg-muted">{t.checkingFolder}</p>
        ) : !hasMap && emptyFolder ? (
          <div className="flex min-w-0 grow flex-col items-center justify-center gap-3 p-8 text-center">
            <h2 className="text-title font-semibold">{t.emptyFolder}</h2>
            <p className="max-w-90 text-body text-fg-muted">{t.emptyFolderLead}</p>
            <Button variant="primary" onClick={() => onNewHere?.(cwd)}>
              {t.newHere}
            </Button>
          </div>
        ) : !hasMap ? (
          <div className="flex min-w-0 grow flex-col items-center justify-center gap-3 p-8 text-center">
            <h2 className="text-title font-semibold">{t.empty}</h2>
            <p className="max-w-90 text-body text-fg-muted">{demo ? t.demo : t.emptyLead}</p>
            {deletedHere && onNewProject && (
              <p className="max-w-90 text-meta text-fg-muted">
                {t.deletedNewLead}{' '}
                <LinkButton className="min-h-5 px-0.5" onClick={onNewProject}>
                  {t.newProject}
                </LinkButton>
              </p>
            )}
            <ImportLink cwd={cwd} onOpen={openImported} />
            <details className="group mt-1 flex flex-col items-center">
              <summary className="cursor-pointer list-none text-meta text-interactive">{t.scopeBefore}</summary>
              <div className="mt-3 text-left">
                <ScopeEditor cwd={cwd} board={data} readOnly={readOnly} label={t.scopeTitle} />
              </div>
            </details>
          </div>
        ) : (
          treeMap && (
            <JourneyMap
              cwd={cwd}
              map={treeMap}
              board={data}
              seenAt={seenAt}
              start={(action, target) => start(action, target)}
              drawing={drawing}
              lit={lit}
              reveal={reveal}
              look={planned ? look : undefined}
              touching={touching}
              asked={phase === 'asking' ? (question?.about ?? null) : null}
              planned={planned}
              making={making}
              onChangePick={planned ? setReviewing : undefined}
              onPlan={planning ? (words) => void say(words) : undefined}
              // A plan takes words while it works; checks and fixes wait until the AI is free, and say so.
              waitNote={!planning && anyActive ? t.busyNote : null}
              stepParts={(cardId) => {
                const node = nodeOf(cardId);
                if (!node) return {};
                const mine = data.states?.[cardId];
                const canEdit = !readOnly && !anyActive;
                return {
                  title: <Title key={cardId} cwd={cwd} node={node} mine={mine?.overridden?.title} canEdit={canEdit} />,
                  howToTry: (
                    <HowToTry
                      key={`try-${cardId}`}
                      cwd={cwd}
                      node={node}
                      mine={mine?.overridden?.howToTry}
                      canEdit={canEdit}
                    />
                  ),
                  extras: (
                    <>
                      {!!mine?.removedPromises?.length && <PromiseMore {...promiseProps(node)} only={REMOVED} />}
                      {planned && aiPick(cardId) && (
                        <p className="flex flex-wrap items-baseline gap-x-1.5 rounded-md bg-canvas-sunken px-2 py-1 text-meta">
                          <span className="min-w-0 grow text-fg-muted">
                            {plan.aiDecided} · {aiPick(cardId)!.answer}
                          </span>
                          <LinkButton className="min-h-5 px-0.5" onClick={() => setReviewing(cardId)}>
                            {plan.change}
                          </LinkButton>
                        </p>
                      )}
                      {docked ? (
                        <p className="flex flex-wrap gap-2">
                          {/* The card closes: the input is beside the map, under the conversation. */}
                          <Dialog.Close
                            render={<Button />}
                            disabled={readOnly}
                            onClick={() => {
                              setAboutCard(cardId);
                              onShowTalk?.();
                            }}
                          >
                            {t.askAboutCard}
                          </Dialog.Close>
                          {!planning && (
                            <Button disabled={locked} onClick={() => void start('verify', { node })}>
                              {t.askRecheck}
                            </Button>
                          )}
                        </p>
                      ) : (
                        <CardAsk
                          key={cardId}
                          locked={locked}
                          // Words are taken while the AI works: they go when it is free.
                          askLocked={busy || readOnly}
                          onAsk={(request) => askAbout(node, request)}
                          onRecheck={planning ? undefined : () => void start('verify', { node })}
                        />
                      )}
                      {canOpenInApp && node.kind === 'screen' && node.phase === 'built' && (
                        <p>
                          <Dialog.Close render={<LinkButton />} onClick={() => openInApp(cardId)}>
                            {film.openInApp}
                          </Dialog.Close>
                        </p>
                      )}
                    </>
                  ),
                };
              }}
              promiseExtras={(cardId, promiseId) => {
                const node = nodeOf(cardId);
                return node && <PromiseMore key={promiseId} {...promiseProps(node)} only={promiseId} />;
              }}
              onSession={(id) => {
                onSession(id);
                onShowConversation?.();
              }}
            />
          )
        )}
        {flight && <AskFlight key={flight.at} {...flight} landed={landed} />}
        {placeTalk(
          <>
            {docked && errorBar}
            {phase && (
              <PlanBar
                docked={docked}
                phase={phase}
                thinking={talking && phase === 'asking'}
                busy={talking}
                question={shownQuestion}
                about={shownQuestion?.about ? (treeMap?.cards[shownQuestion.about]?.title ?? null) : null}
                preview={previewing}
                sample={
                  pending?.sample ||
                  Object.values(treeMap?.cards ?? {}).find((card) => card.screen?.kind === 'planned')?.screen?.src ||
                  ''
                }
                activity={activity}
                waiting={workInfo?.status === 'waiting'}
                left={data?.undecided?.length ?? 0}
                review={pickReview}
                built={{
                  checked: promisesAll.filter((p) => p.status === 'passed').length,
                  total: promisesAll.length,
                  aiPicks: aiPicked.length,
                  cards: cardCount,
                  done: builtCount,
                  screens: Object.values(treeMap?.cards ?? {}).filter(hasScreenArea).length,
                  tries: Object.values(treeMap?.cards ?? {})
                    .filter((card) => card.howToTry?.trim())
                    .map((card) => ({ cardId: card.id, card: card.title, text: card.howToTry!.trim() })),
                  open: Object.values(treeMap?.cards ?? {}).flatMap((card) =>
                    card.promises
                      .filter((promise) => promise.status !== 'passed')
                      .map((promise) => {
                        // Broken stays broken while the AI works on its card (shown there as being checked).
                        const failed = data?.states?.[card.id]?.promises?.[promise.id]?.status === 'failed';
                        return {
                          cardId: card.id,
                          card: card.title,
                          promiseId: promise.id,
                          text: promise.then,
                          note: failed ? promise.note : '',
                          failed,
                        };
                      }),
                  ),
                }}
                team={
                  buildTeam?.status === 'proposed' || buildTeam?.status === 'over'
                    ? {
                        status: buildTeam.status,
                        title: buildTeam.title,
                        agents: roomOf(buildTeam).planned,
                        minutes: buildTeam.minutes,
                        needed: buildTeam.needed,
                      }
                    : null
                }
                stop={{ reason: stopReason(buildItems ?? []), team: buildTeam?.status === 'interrupted' }}
                onTeam={answerTeam}
                onContinue={continueBuild}
                onAnswer={(option) => {
                  const picked = shownQuestion?.options[option];
                  if (!picked) return;
                  if (picked.look) setPickedLook({ css: picked.look, before: mapLook ?? '' });
                  say(picked.label);
                }}
                onPreview={(option) => shownQuestion && setLookPreview({ question: shownQuestion.id, option })}
                onHoverLook={(option) =>
                  setLookHover(option === null || !shownQuestion ? null : { question: shownQuestion.id, option })
                }
                onDecideRest={() => say(plan.decideRestMessage)}
                onAskOn={() => say(plan.askOnMessage)}
                onDrawOn={() => say(plan.drawOnMessage)}
                onDecide={(option) => {
                  const label = pickReview?.question.options[option]?.label;
                  // The answer it already has needs nothing sent.
                  if (label && option !== pickReview?.picked) changeDecision(label);
                  nextReview();
                }}
                onCloseReview={() => setReviewing(null)}
                onNextReview={nextReview}
                onReviewPicks={() => reviewOrder[0] && setReviewing(reviewOrder[0])}
                onFix={(cardId, promiseId) => {
                  const node = nodeOf(cardId);
                  const broken = node?.conditions?.find((condition) => condition.id === promiseId)?.expectation;
                  if (node && broken) void askAbout(node, tree.fixRequest(node.title, broken));
                }}
                onRecheck={(ids) => void start('verify', { nodeIds: ids, request: t.recheckAllRequest })}
                onOpenInApp={canOpenInApp ? openInApp : undefined}
                onPublish={onPublish}
                onFixConnection={() => onFixConnection?.()}
                onStop={stopWork}
                onLook={showWork}
              />
            )}
            {!docked &&
              ownLine &&
              workBusy &&
              (workInfo?.status === 'waiting' ? (
                <Bar title={t.workWaiting} hint={t.workWaitingHint}>
                  <Button variant="primary" onClick={showWork}>
                    {t.workLook}
                  </Button>
                  <Button onClick={stopWork}>{t.stopDrawing}</Button>
                </Bar>
              ) : (
                <Working key={workText} text={workText} stop={t.stopDrawing} onStop={stopWork} />
              ))}
            {!workBusy && others.length > 0 && (
              <p className="pointer-events-auto flex flex-wrap items-center gap-x-2 self-center rounded-xl bg-canvas-raised px-3 py-1.5 text-meta text-fg-muted shadow-overlay">
                <span>{t.otherWorking}</span>
                <LinkButton
                  className="min-h-5 px-0.5"
                  onClick={() => {
                    onSession(others[0]!.id);
                    onShowConversation?.();
                  }}
                >
                  {t.otherWorkingShow}
                </LinkButton>
              </p>
            )}
            {!docked && showReply && reply && (
              <section
                aria-label={t.replyFrom}
                className="pointer-events-auto motion-step flex items-start gap-3 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay"
              >
                <p className="line-clamp-3 min-w-0 grow text-body whitespace-pre-line text-fg">{replyText}</p>
                <span className="flex shrink-0 items-center gap-2">
                  {/* Stopped on the model connection (sign-in, credits, a plan's limit): fixed there, not here. */}
                  {replyStop && CONNECTION.has(replyStop) && (
                    <LinkButton className="min-h-5 px-0.5" onClick={() => onFixConnection?.()}>
                      {plan.fixConnection}
                    </LinkButton>
                  )}
                  <LinkButton className="min-h-5 px-0.5" onClick={showWork}>
                    {t.showConversation}
                  </LinkButton>
                  <LinkButton className="min-h-5 px-0.5" onClick={closeReply}>
                    {t.replyClose}
                  </LinkButton>
                </span>
              </section>
            )}
            {waitingWords.length > 0 && (
              <section
                aria-label={t.laterTitle}
                className="pointer-events-auto motion-step flex flex-col gap-1.5 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay"
              >
                <p className="text-meta text-fg-muted">{t.laterTitle}</p>
                <ul className="flex flex-col gap-1">
                  {waitingWords.map((word) => (
                    <li key={word.id} className="flex items-baseline gap-2 text-body">
                      <span className="min-w-0 grow truncate">{word.text}</span>
                      {word.failed && (
                        <>
                          <span className="shrink-0 text-meta text-danger">{t.laterFailed}</span>
                          <LinkButton className="min-h-5 px-0.5" onClick={() => later.fail(word.id, false)}>
                            {t.laterRetry}
                          </LinkButton>
                        </>
                      )}
                      <LinkButton className="min-h-5 px-0.5" onClick={() => later.drop(word.id)}>
                        {t.laterCancel}
                      </LinkButton>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data && !readOnly && !board.isError && !checkingFolder && !(emptyFolder && !hasMap) && (
              <MapAsk
                empty={!hasMap && !planned}
                disabled={busy || (!hasMap && !planned && anyActive && !approval)}
                // Beside the conversation the input only sends: 멈추기 is the top bar's, and words written while the
                // AI works wait for its turn.
                placeholder={
                  approval ? t.answerInstead : waitsForWork || (docked && (workBusy || talking)) ? t.busyAsk : undefined
                }
                onSend={sendWords}
                about={aboutCard ? (nodeOf(aboutCard)?.title ?? null) : null}
                onClearAbout={() => setAboutCard(null)}
                agent={
                  <>
                    {agentChip}
                    {modeChip}
                  </>
                }
              />
            )}
          </>,
        )}
        <div
          data-overlay={overlay || undefined}
          className={overlay ? 'absolute inset-y-0 right-0 z-20 flex bg-canvas shadow-overlay' : 'contents'}
        >
          <SlidingPanel open={!!data && changesOpen} width={PANEL_WIDTH}>
            {changesOpen && data && (
              <Changes
                board={data}
                since={viewedSince}
                onSelect={(id) => setReveal({ cardId: id, seq: Date.now() })}
                onClose={() => setChangesOpen(false)}
              />
            )}
          </SlidingPanel>
        </div>
      </div>
    </main>
  );
}

/** A status above the map that lights its cards; pressed again, it lets go. */
function Chip({
  pressed,
  tone,
  onClick,
  children,
}: {
  pressed: boolean;
  tone?: 'danger' | 'attention';
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-meta transition-colors',
        pressed ? 'border-interactive bg-selected text-fg' : 'border-line bg-canvas-raised hover:bg-hover',
        !pressed && (tone === 'danger' ? 'text-danger' : tone === 'attention' ? 'text-attention' : 'text-fg-muted'),
      )}
    >
      {children}
    </button>
  );
}
