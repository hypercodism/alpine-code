import type { CloudStatus, JudgedNew, ProjectInfo } from '@alpine/protocol';
import { AutoHeight, Button, Dialog } from '@alpine/ui/primitives';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { AlpineSignIn, NodeInstall, UpgradeSheet } from '@/shared/components/cloud';
import { AgentChip, Composer, type Mode } from '@/shared/components/composer';
import { Snowscape } from '@/shared/components/snowscape';
import { useLocale, useMessages } from '@/shared/i18n';
import {
  ServerError,
  cloudKey,
  useAgents,
  useCloudStatus,
  useConnections,
  useCreateProject,
  useJudgeNewProject,
  useNodeTools,
  useSettings,
  type CreateStep,
  type TemplateId,
} from '@/shared/server';

import { Creating, type CreateFailure } from './Creating';
import { messages } from './messages';
import { TemplateCards, useTemplates } from './TemplateCards';
import { WhereChip } from './WhereChip';

const DEFAULT_AGENT = 'default';

/**
 * After sending: the agent picking a setup for the idea, then the setups with its pick chosen, then the project being
 * made. `judged` is the pick; `null` when the agent gave none (or could not be asked), so the usual setup is chosen
 * and nobody recommends it.
 */
type Stage =
  | { name: 'judging'; text: string }
  | { name: 'choosing'; text: string; judged: JudgedNew | null; template: TemplateId }
  | CreatingStage;

/** The setup chosen when the agent gave no pick. */
const FALLBACK_TEMPLATE: TemplateId = 'web-lite';

/** What stands between 만들기 and making the project: the Alpine account and Pro (a realtime web app), or Node.js (any web app). */
type Gate = { kind: 'sign-in' | 'upgrade' | 'node'; chosen: Extract<Stage, { name: 'choosing' }> };

interface CreatingStage {
  name: 'creating';
  text: string;
  judged: JudgedNew | null;
  template: TemplateId;
  /** The steps the server has announced, and the project they are about. */
  steps: CreateStep[];
  project: ProjectInfo | null;
  /** The web address the server made, once it says so. */
  address: string | null;
  outcome: { status: 'working' } | { status: 'done' } | { status: 'failed'; error: unknown };
}

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
 * (`projects/judge` with `newProject`; if it fails the usual setup shows with no pick), 만들기 makes the project
 * (`projects/create`: the template in its folder, its web address too when signed in to Alpine) and starts its map
 * conversation planning the idea; then the map opens (`onPlanning`). Existing projects are not started from here:
 * they are their maps (map-first 40).
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
  // Picked here, or given by the map's 여기서 새로 만들기 (the screen is made again for another folder).
  const [folder, setFolder] = useState<string | null>(presetFolder);
  const [picked, setPicked] = useState<string | null>(null);
  const agents = useAgents().data?.agents;
  const defaultMode = useSettings().data?.mode;
  const [mode, setMode] = useState<Mode | null>(null);
  const shownMode = mode ?? defaultMode;
  const { locale } = useLocale();
  const judge = useJudgeNewProject();
  const createProject = useCreateProject();
  const templates = useTemplates();
  const signedIn = useCloudStatus().data?.signedIn ?? false;
  const queryClient = useQueryClient();
  const node = useNodeTools(true);
  const [gate, setGate] = useState<Gate | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  // Putting a message back in the input, after a project that could not be made.
  const [prefill, setPrefill] = useState<{ text: string; key: number } | undefined>();
  // Which send or create is the latest: a slower answer to an earlier one is ignored, and so is any once I have left.
  const turn = useRef(0);
  useEffect(
    () => () => {
      turn.current++;
    },
    [],
  );

  const wanted = picked ?? agent ?? DEFAULT_AGENT;
  // Until the agents are read (or when they cannot be), no agent is sent, so the server applies its own choice.
  const known = agents?.some((a) => a.id === wanted) ?? false;
  const shown = known ? wanted : DEFAULT_AGENT;
  const sent = known ? wanted : null;
  const shownAgent = agents?.find((a) => a.id === shown);

  // Sending hands the text over at once (the input empties) and the agent picks a setup; sending again while it
  // judges or while the setups are shown starts over with the new text.
  const send = (text: string) => {
    const mine = ++turn.current;
    setStage({ name: 'judging', text });
    void judge
      .mutateAsync({ text: text.trim(), locale, newProject: true })
      .then(
        (judgement) => (judgement.kind === 'new' ? judgement : null),
        () => null,
      )
      .then((judged) => {
        if (mine !== turn.current) return;
        setStage({ name: 'choosing', text, judged, template: judged?.template ?? FALLBACK_TEMPLATE });
      });
    return Promise.resolve();
  };

  const create = (chosen: Extract<Stage, { name: 'choosing' }>) => {
    const mine = ++turn.current;
    const update = (change: (creating: CreatingStage) => CreatingStage) =>
      setStage((last) => (mine === turn.current && last?.name === 'creating' ? change(last) : last));
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

  // 만들기: first what the setup needs. A realtime web app needs the Alpine account (decision 23), a web app needs
  // Node.js (6.3); each is asked for in a sheet, and 만들기 goes on by itself when it is there.
  const requestCreate = (chosen: Extract<Stage, { name: 'choosing' }>, skip?: Gate['kind']) => {
    const web = chosen.template === 'web-lite' || chosen.template === 'web-pro';
    // What is true now, not at the last render: this runs right after signing in or starting the trial.
    const now = queryClient.getQueryData<CloudStatus>(cloudKey);
    if (chosen.template === 'web-pro' && !now?.signedIn && skip !== 'sign-in')
      return setGate({ kind: 'sign-in', chosen });
    if (chosen.template === 'web-pro' && now?.limits && !now.limits.webPro && skip !== 'upgrade')
      return setGate({ kind: 'upgrade', chosen });
    if (web && node.data?.ready === false && skip !== 'node') return setGate({ kind: 'node', chosen });
    setGate(null);
    create(chosen);
  };

  // After a failure: back to the setups, or (the project exists, only the AI did not start) on to its map.
  const back = (creating: CreatingStage, failure: CreateFailure) => {
    if (failure.kind === 'not_started' && creating.project) return onPlanning(creating.project.path);
    if (failure.kind === 'not_empty') {
      setStage(null);
      setPrefill({ text: creating.text, key: Date.now() });
      return;
    }
    setStage({ ...creating, name: 'choosing' });
  };

  const locked = stage?.name === 'creating';
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
                  <Asked text={stage.text} />
                  <p role="status" className="inline-flex items-center gap-2 text-body text-fg-muted">
                    <Dots />
                    {t.judging}
                  </p>
                </div>
              ) : stage?.name === 'choosing' ? (
                <div key="choosing" className="motion-step flex flex-col gap-4">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Asked text={stage.text} />
                    <h1 className="text-title font-semibold">{t.pickSetupHeading}</h1>
                  </div>
                  <TemplateCards
                    templates={templates}
                    value={stage.template}
                    onChange={(template) => setStage({ ...stage, template })}
                    recommendation={stage.judged ?? undefined}
                  />
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-meta text-fg-muted">{signedIn ? t.liveNote : t.localNote}</span>
                    <Button variant="primary" autoFocus onClick={() => requestCreate(stage)}>
                      {t.create}
                    </Button>
                  </div>
                </div>
              ) : stage?.name === 'creating' ? (
                <CreatingFrom key="creating" stage={stage} online={signedIn} onOpen={onPlanning} onBack={back} />
              ) : (
                <div key="start" className="motion-step flex flex-col items-center gap-6">
                  <h1 className="text-center text-display font-semibold">{t.newHeading}</h1>
                </div>
              )}
            </AutoHeight>
          </div>
        </div>
        <div className="mx-auto w-full max-w-205 shrink-0 px-6">
          <Composer
            large
            placeholder={t.newPlaceholder}
            locked={locked}
            onSend={send}
            prefill={prefill}
            mode={shownMode ? { value: shownMode, onChange: setMode } : undefined}
            project={<WhereChip folder={folder} disabled={locked} onChange={setFolder} />}
            agent={
              <AgentChip
                context="new"
                agentId={shown}
                model={shownAgent?.model ?? defaultModel ?? null}
                onChange={setPicked}
              />
            }
          />
        </div>
        <div className="grow basis-0" />
      </div>
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
}: {
  stage: CreatingStage;
  online: boolean;
  onOpen: (projectPath: string) => void;
  onBack: (stage: CreatingStage, failure: CreateFailure) => void;
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
    />
  );
}

/** What I sent, quoted back while the agent works on it. */
function Asked({ text }: { text: string }) {
  return (
    <p className="max-w-full self-center rounded-2xl bg-hover px-4 py-2.5 text-left text-reading break-words text-fg">
      {text}
    </p>
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
