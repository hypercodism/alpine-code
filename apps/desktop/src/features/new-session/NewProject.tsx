import type { CloudStatus } from '@alpine/protocol';
import { AutoHeight, Button, Dialog, LinkButton } from '@alpine/ui/primitives';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Pencil } from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useStore } from 'zustand';

import { AlpineSignIn, NodeInstall, UpgradeSheet } from '@/shared/components/cloud';
import { AgentChip, Composer, type Mode } from '@/shared/components/composer';
import { CloneDialog } from '@/shared/components/project-add';
import { Snowscape } from '@/shared/components/snowscape';
import { useLocale, useMessages } from '@/shared/i18n';
import { useOpenFolder } from '@/shared/platform';
import {
  ServerError,
  cloudKey,
  useAgents,
  useCloudEnabled,
  useCloudStatus,
  useConnections,
  useCreateProject,
  useJudgeNewProject,
  useNewSession,
  useNodeTools,
  useOpenProject,
  usePrepareFlow,
  useSendMessage,
  useServer,
  useSessions,
  useSettings,
  type TemplateId,
} from '@/shared/server';

import { Creating, type CreateFailure } from './Creating';
import { messages } from './messages';
import { useNewProjectStore, type ChoosingStage, type CreatingStage, type Stage } from './newProjectStore';
import { TemplateCards, useTemplates } from './TemplateCards';
import { isUnavailable, Unavailable } from './Unavailable';
import { WhereChip } from './WhereChip';

const DEFAULT_AGENT = 'default';

/** The setup chosen when the agent gave no pick. */
const FALLBACK_TEMPLATE: TemplateId = 'web-lite';

/** What a folder may hold and still count as empty, as on the server (`EMPTY_ANYWAY` in templates.py). */
const EMPTY_ANYWAY = new Set(['.DS_Store', '.git']);

/** What stands between 만들기 and making the project: the Alpine account and Pro (a realtime web app), or Node.js (any web app). */
type Gate = { kind: 'sign-in' | 'upgrade' | 'node'; chosen: ChoosingStage };

/** What a rejected `projects/create` means for the person: nothing made, or the project made without the AI started. */
function failureOf(creating: CreatingStage, error: unknown): CreateFailure {
  const detail = error instanceof Error && error.message ? error.message : null;
  if (creating.steps.includes('folder')) return { kind: 'not_started', detail };
  const reason = error instanceof ServerError ? error.data?.reason : undefined;
  return {
    kind: reason === 'not_found' || reason === 'invalid_config' || reason === 'not_empty' ? reason : 'other',
    detail,
  };
}

/**
 * The one place a new product starts (map-first 39): "무엇을 만들어 볼까요?", one line, and where to make it (a new
 * folder in the clone folder, or an empty folder the person made). The agent picks a setup for the idea
 * (`projects/judge` with `newProject`, which first fetches the setups when it is time; when they cannot be had it says
 * why, and when only the pick fails the usual setup shows with no pick), 만들기 makes the project (`projects/create`:
 * the template in its folder, its web address too when signed in to Alpine) and starts its map conversation planning
 * the idea; then the map opens (`onPlanning`). Existing projects are not started from here: they are their maps
 * (map-first 40), and the line under the input only opens one (a folder on this computer) or gets one (a repository),
 * so 새 프로젝트 is the one way in for both. Where it got to is kept for the server connection (`useNewProjectStore`), so leaving and coming back
 * finds it there, and a making that ended meanwhile says how.
 */
export function NewProject({
  folder: presetFolder = null,
  agent,
  onPlanning,
}: {
  /** An empty folder to make the project in, when the screen was opened for one (a map's 여기서 새로 만들기). */
  folder?: string | null;
  /** The agent to start with, unless one is picked here. */
  agent?: string;
  /** A project was made: its map, where the AI plans the idea with me. */
  onPlanning: (projectPath: string) => void;
}) {
  const t = useMessages(messages);
  const defaultModel = useConnections().data?.defaultModel;
  const store = useNewProjectStore();
  const stage = useStore(store, (state) => state.stage);
  const folder = useStore(store, (state) => state.folder);
  const [picked, setPicked] = useState<string | null>(null);
  const agents = useAgents().data?.agents;
  const defaultMode = useSettings().data?.mode;
  const [mode, setMode] = useState<Mode | null>(null);
  const shownMode = mode ?? defaultMode;
  const { locale } = useLocale();
  const judge = useJudgeNewProject();
  const createProject = useCreateProject();
  const cloud = useCloudEnabled();
  const templates = useTemplates(cloud);
  const signedIn = (useCloudStatus(cloud).data?.signedIn ?? false) && cloud;
  const queryClient = useQueryClient();
  const server = useServer();
  const sessions = useSessions().data;
  const newSession = useNewSession();
  const prepare = usePrepareFlow();
  const sendMessage = useSendMessage();
  const openProject = useOpenProject();
  const navigate = useNavigate();
  const node = useNodeTools(true);
  const [gate, setGate] = useState<Gate | null>(null);
  // Putting a message back in the input: after a project that could not be made, or to change what was sent.
  const [prefill, setPrefill] = useState<{ text: string; key: number } | undefined>();
  // A folder picked for the project that has files in it: not taken, and said why.
  const [filled, setFilled] = useState<string | null>(null);
  const [getting, setGetting] = useState(false);
  const showProject = (path: string) => void navigate({ to: '/', search: { project: path } });
  const openFolder = useOpenFolder(showProject);

  const setStage = (next: Stage | null) => store.setState({ stage: next });
  const setFolder = (next: string | null) => store.setState({ folder: next });
  /** A new send or create: answers to the earlier ones are ignored from now on. */
  const nextTurn = () => {
    const turn = store.getState().turn + 1;
    store.setState({ turn });
    return turn;
  };
  const latest = (turn: number) => store.getState().turn === turn;

  // Opened for a folder (a map's 여기서 새로 만들기): that folder, starting over, unless a making is still under way.
  useLayoutEffect(() => {
    if (presetFolder === null) return;
    const now = store.getState();
    if (now.folder === presetFolder) return;
    if (now.stage?.name === 'creating' && now.stage.outcome.status === 'working') return;
    store.setState((state) => ({ turn: state.turn + 1, folder: presetFolder, stage: null }));
  }, [presetFolder, store]);

  // A done screen that has been seen is forgotten once I leave it (`useForgetFinished`).
  const finished = stage?.name === 'creating' && stage.outcome.status === 'done' && !stage.seen;
  useEffect(() => {
    const now = store.getState().stage;
    if (finished && now?.name === 'creating') store.setState({ stage: { ...now, seen: true } });
  }, [finished, store]);

  const wanted = picked ?? agent ?? DEFAULT_AGENT;
  // Until the agents are read (or when they cannot be), no agent is sent, so the server applies its own choice.
  const known = agents?.some((a) => a.id === wanted) ?? false;
  const shown = known ? wanted : DEFAULT_AGENT;
  const sent = known ? wanted : null;
  const shownAgent = agents?.find((a) => a.id === shown);

  // Sending hands the text over at once (the input empties) and the agent picks a setup; sending again while it
  // judges or while the setups are shown starts over with the new text.
  const send = (text: string) => {
    const mine = nextTurn();
    setFilled(null);
    setStage({ name: 'judging', text });
    void judge
      .mutateAsync({ text: text.trim(), locale, newProject: true })
      .then(
        (judgement) => ({ judged: judgement.kind === 'new' ? judgement : null, error: null }),
        (error: unknown) => ({ judged: null, error }),
      )
      .then(({ judged, error }) => {
        if (!latest(mine)) return;
        if (isUnavailable(error)) return setStage({ name: 'unavailable', text, error });
        setStage({ name: 'choosing', text, judged, template: judged?.template ?? FALLBACK_TEMPLATE });
      });
    return Promise.resolve();
  };

  // 고치기: what was sent goes back into the input, and the answer to it, if one still comes, is not shown.
  const edit = (text: string) => {
    nextTurn();
    setStage(null);
    setPrefill({ text, key: Date.now() });
  };

  const create = (chosen: ChoosingStage) => {
    const mine = nextTurn();
    // The answers land in the store whether or not this screen is still shown.
    const update = (change: (creating: CreatingStage) => CreatingStage) => {
      const last = store.getState().stage;
      if (latest(mine) && last?.name === 'creating') setStage(change(last));
    };
    setStage({ ...chosen, name: 'creating', steps: [], project: null, address: null, outcome: { status: 'working' } });
    createProject
      .mutateAsync({
        idea: chosen.text.trim(),
        template: chosen.template,
        // Without a pick there is no name either: the server names the folder itself.
        name: chosen.judged?.name ?? '',
        ...(folder ? { folder } : {}),
        ...(sent ? { agent: sent } : {}),
        ...(mode ? { mode } : {}),
        onStep: (step, made, address) =>
          update((creating) => ({
            ...creating,
            steps: [...creating.steps, step],
            project: made,
            address: address ?? creating.address,
          })),
      })
      .then(
        ({ project: made, address }) => {
          setMode(null);
          update((creating) => ({
            ...creating,
            project: made,
            address: address ?? creating.address,
            outcome: { status: 'done' },
          }));
        },
        (error: unknown) => update((creating) => ({ ...creating, outcome: { status: 'failed', error } })),
      );
  };

  // 다시 시작, when the project was made but the AI did not start: its map conversation (the one there is, else a new
  // one) gets the idea as the plan of its map, as `projects/create` would have done.
  const restart = (creating: CreatingStage) => {
    const project = creating.project;
    if (!project) return;
    const mine = nextTurn();
    const update = (outcome: CreatingStage['outcome']) => {
      const last = store.getState().stage;
      if (latest(mine) && last?.name === 'creating') setStage({ ...last, outcome });
    };
    setStage({ ...creating, steps: creating.steps.filter((step) => step !== 'agent'), outcome: { status: 'working' } });
    const cwd = project.path;
    void (async () => {
      const conversation =
        sessions?.find((s) => s.cwd === cwd && s.purpose === 'map')?.id ??
        (await newSession.mutateAsync({ cwd, purpose: 'map', agent: sent ?? undefined, mode: mode ?? undefined })).id;
      const { revision } = await server.request('flow/get', { cwd });
      const { prompt } = await prepare.mutateAsync({
        cwd,
        revision,
        action: 'plan',
        request: creating.text.trim(),
        sessionId: conversation,
      });
      await sendMessage.mutateAsync({ sessionId: conversation, text: prompt });
    })().then(
      () => update({ status: 'done' }),
      (error: unknown) => update({ status: 'failed', error }),
    );
  };

  // 만들기: first what the setup needs. A realtime web app needs the Alpine account (decision 23), a web app needs
  // Node.js (6.3); each is asked for in a sheet, and 만들기 goes on by itself when it is there.
  const requestCreate = (chosen: ChoosingStage, skip?: Gate['kind']) => {
    const web = chosen.template === 'web-lite' || chosen.template === 'web-pro';
    // What is true now, not at the last render: this runs right after signing in or starting the trial.
    const now = queryClient.getQueryData<CloudStatus>(cloudKey);
    if (cloud && chosen.template === 'web-pro' && !now?.signedIn && skip !== 'sign-in')
      return setGate({ kind: 'sign-in', chosen });
    if (cloud && chosen.template === 'web-pro' && now?.limits && !now.limits.webPro && skip !== 'upgrade')
      return setGate({ kind: 'upgrade', chosen });
    if (web && node.data?.ready === false && skip !== 'node') return setGate({ kind: 'node', chosen });
    setGate(null);
    create(chosen);
  };

  // On to the map: what was made here is done with, so 새 프로젝트 starts empty next time.
  const planning = (path: string) => {
    nextTurn();
    store.setState({ stage: null, folder: null });
    onPlanning(path);
  };

  // After a failure: back to the setups, or (the project exists, only the AI did not start) on to its map.
  const back = (creating: CreatingStage, failure: CreateFailure) => {
    if (failure.kind === 'not_started' && creating.project) return planning(creating.project.path);
    if (failure.kind === 'not_empty') {
      setStage(null);
      setPrefill({ text: creating.text, key: Date.now() });
      return;
    }
    setStage({ ...creating, name: 'choosing' });
  };

  // A folder picked for the project is taken at once (sending right away makes it there) and looked into: one with
  // files in it is a project to open, not a place to start one, so it is given back. When it cannot be looked into
  // the server decides on 만들기.
  const pick = (next: string | null) => {
    setFilled(null);
    const before = folder;
    setFolder(next);
    if (next === null || next === before) return;
    void server.request('files/list', { cwd: next, path: '', limit: 20 }).then(
      ({ entries }) => {
        if (store.getState().folder !== next || !entries.some((entry) => !EMPTY_ANYWAY.has(entry.name))) return;
        setFolder(before);
        setFilled(next);
      },
      () => {},
    );
  };

  const openFilled = (path: string) =>
    openProject.mutate(path, {
      onSuccess: () => {
        setFilled(null);
        void navigate({ to: '/board', search: { project: path } });
      },
    });

  const working = stage?.name === 'creating' && stage.outcome.status === 'working';
  // A setup that is not shown (a realtime web app once Alpine Cloud is off) is neither chosen nor recommended.
  const offered = (template: TemplateId | undefined) => templates.some((shown) => shown.id === template);
  const choosing =
    stage?.name === 'choosing'
      ? {
          ...stage,
          judged: offered(stage.judged?.template) ? stage.judged : null,
          template: offered(stage.template) ? stage.template : FALLBACK_TEMPLATE,
        }
      : null;
  return (
    <main aria-label={t.newProject} className="relative flex min-h-0 min-w-120 grow flex-col overflow-hidden bg-canvas">
      {/* The snow scene is the face of the start screen; while something is being made it steps back. */}
      <Snowscape className={clsx('transition-opacity duration-500', stage && 'opacity-20')} />
      <div className="relative flex min-h-0 grow flex-col overflow-y-auto">
        {/* What is said above the input sits on top of it, so the input itself is the middle of the screen. */}
        <div className="flex grow basis-0 flex-col justify-end">
          <div className="mx-auto flex w-full max-w-175 shrink-0 flex-col gap-6 px-6 pt-6 pb-6">
            <AutoHeight className="w-full">
              {stage?.name === 'judging' ? (
                <div key="judging" className="motion-step flex flex-col items-center gap-4 text-center">
                  <Asked text={stage.text} onEdit={() => edit(stage.text)} />
                  <p role="status" className="inline-flex items-center gap-2 text-body text-fg-muted">
                    <Dots />
                    {t.judging}
                  </p>
                </div>
              ) : stage?.name === 'unavailable' ? (
                <div key="unavailable" className="motion-step flex flex-col gap-4">
                  <Asked text={stage.text} onEdit={() => edit(stage.text)} />
                  <Unavailable error={stage.error} onRetry={() => void send(stage.text)} />
                </div>
              ) : choosing ? (
                <div key="choosing" className="motion-step flex flex-col gap-4">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Asked text={choosing.text} onEdit={() => edit(choosing.text)} />
                    <h1 className="text-title font-semibold">{t.pickSetupHeading}</h1>
                  </div>
                  <TemplateCards
                    templates={templates}
                    value={choosing.template}
                    onChange={(template) => setStage({ ...choosing, template })}
                    recommendation={choosing.judged ?? undefined}
                  />
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-meta text-fg-muted">
                      {!cloud ? t.localNoteOff : signedIn ? t.liveNote : t.localNote}
                    </span>
                    <Button variant="primary" autoFocus onClick={() => requestCreate(choosing)}>
                      {t.create}
                    </Button>
                  </div>
                </div>
              ) : stage?.name === 'creating' ? (
                <CreatingFrom
                  key="creating"
                  stage={stage}
                  online={signedIn}
                  onOpen={planning}
                  onBack={back}
                  onRestart={restart}
                />
              ) : (
                <div key="start" className="motion-step flex flex-col items-center gap-6">
                  <h1 className="text-center text-display font-semibold">{t.newHeading}</h1>
                </div>
              )}
            </AutoHeight>
            {filled && (
              <div
                role="alert"
                className="motion-step flex items-center gap-3 rounded-xl border border-line bg-canvas-raised px-4 py-3"
              >
                <p className="grow text-body text-fg">
                  {t.folderHasFiles(filled.split('/').filter(Boolean).at(-1) ?? filled)}
                </p>
                <Button onClick={() => setFilled(null)}>{t.dismiss}</Button>
                <Button variant="primary" disabled={openProject.isPending} onClick={() => openFilled(filled)}>
                  {t.openAsProject}
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="mx-auto w-full max-w-205 shrink-0 px-6">
          <Composer
            large
            placeholder={t.newPlaceholder}
            locked={working}
            onSend={send}
            prefill={prefill}
            mode={shownMode ? { value: shownMode, onChange: setMode } : undefined}
            project={<WhereChip folder={folder} disabled={working} onChange={pick} />}
            agent={
              <AgentChip
                context="new"
                agentId={shown}
                model={shownAgent?.model ?? defaultModel ?? null}
                onChange={setPicked}
              />
            }
          />
          {!stage && (
            // Over the snow scene, so on its own ground to be read.
            <p className="mx-auto mt-3 flex w-fit flex-wrap items-center justify-center gap-x-1 rounded-full bg-canvas-raised/85 px-3 text-meta text-fg-muted backdrop-blur-sm">
              {t.existingLead}
              <LinkButton onClick={() => void openFolder()}>{t.openExisting}</LinkButton>
              <span aria-hidden="true">·</span>
              <LinkButton onClick={() => setGetting(true)}>{t.getExisting}</LinkButton>
            </p>
          )}
        </div>
        <div className="grow basis-0" />
      </div>
      <CloneDialog open={getting} onOpenChange={setGetting} onDone={showProject} />
      <Dialog.Root open={gate?.kind === 'sign-in'} onOpenChange={(open) => !open && setGate(null)}>
        <Dialog.Popup>
          {gate?.kind === 'sign-in' && (
            <AlpineSignIn
              reason={t.proSignInReason}
              onBack={() => setGate(null)}
              onDone={() => requestCreate(gate.chosen, 'sign-in')}
            />
          )}
        </Dialog.Popup>
      </Dialog.Root>
      <Dialog.Root open={gate?.kind === 'upgrade'} onOpenChange={(open) => !open && setGate(null)}>
        <Dialog.Popup>
          {gate?.kind === 'upgrade' && (
            <UpgradeSheet
              reason={t.proUpgradeReason}
              onBack={() => setGate(null)}
              onDone={() => requestCreate(gate.chosen, 'upgrade')}
            />
          )}
        </Dialog.Popup>
      </Dialog.Root>
      <NodeInstall
        open={gate?.kind === 'node'}
        onReady={() => gate && requestCreate(gate.chosen, 'node')}
        onClose={() => setGate(null)}
      />
    </main>
  );
}

/** The Creating screen for a stage: what the server announced, and how the request ended. */
function CreatingFrom({
  stage,
  online,
  onOpen,
  onBack,
  onRestart,
}: {
  stage: CreatingStage;
  online: boolean;
  onOpen: (projectPath: string) => void;
  onBack: (stage: CreatingStage, failure: CreateFailure) => void;
  onRestart: (stage: CreatingStage) => void;
}) {
  const { outcome } = stage;
  const failure = outcome.status === 'failed' ? failureOf(stage, outcome.error) : null;
  return (
    <Creating
      online={online}
      template={stage.template}
      steps={stage.steps}
      project={stage.project}
      address={stage.address}
      done={outcome.status === 'done'}
      failure={failure}
      onOpen={() => outcome.status === 'done' && stage.project && onOpen(stage.project.path)}
      onBack={() => failure && onBack(stage, failure)}
      onRestart={() => onRestart(stage)}
    />
  );
}

/** What I sent, quoted back while the agent works on it, with 고치기 to put it back in the input. */
function Asked({ text, onEdit }: { text: string; onEdit: () => void }) {
  const t = useMessages(messages);
  return (
    <div className="flex max-w-full items-start gap-1 self-center">
      <p className="max-w-full rounded-2xl bg-hover px-4 py-2.5 text-left text-reading break-words text-fg">{text}</p>
      <button
        type="button"
        aria-label={t.editLabel}
        title={t.editLabel}
        onClick={onEdit}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-meta text-fg-muted hover:bg-hover hover:text-fg"
      >
        <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
        {t.edit}
      </button>
    </div>
  );
}

/** Three dots taking turns, for "the agent is thinking". Still under reduced motion. */
function Dots() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-pulse rounded-full bg-interactive motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
