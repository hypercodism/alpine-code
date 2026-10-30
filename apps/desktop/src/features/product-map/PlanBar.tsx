import type { RunStoppedItem } from '@alpine/protocol';
import { Button, LinkButton } from '@alpine/ui/primitives';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import { HtmlFrame } from '@/shared/components/html-frame';
import { useMessages } from '@/shared/i18n';

import type { PlanActivity, PlanPhase, PlanQuestion } from './planData';
import { SCREEN_WIDTH, screenPage } from './planLook';
import { planMessages as messages } from './planMessages';

/** The build's TF while it waits for the person: its yes (`proposed`), or more agents than planned (`over`). */
export interface PlanTeam {
  status: 'proposed' | 'over';
  title: string;
  agents: number;
  /** Every step has one agent: they work one after another. */
  oneByOne: boolean;
  /** The most agents working at once. */
  most: number;
  /** How many agents it needs once over; `null` when it did not say. */
  needed: number | null;
}

/** Why a build stopped with cards left, when the facts say: the run's own reason, a question it asked, its TF cut off. */
export interface PlanStop {
  reason: RunStoppedItem['reason'] | null;
  /** The build's TF was cut off (the app closed): continuing resumes it. */
  team: boolean;
}

/**
 * A promise the finished product does not keep (`failed`), or that nobody saw it keep: never checked, or to be checked
 * again since what it rests on changed. With the screen it is on.
 */
export interface PlanOpenPromise {
  cardId: string;
  card: string;
  promiseId: string;
  text: string;
  /** What the last check saw, when it failed. */
  note: string;
  failed: boolean;
}

/** How far the build got: cards built of all. */
export interface PlanBuilt {
  cards: number;
  done: number;
}

/** What the person can say to the build's TF from the map, as on its card in the conversation. */
export type PlanTeamAnswer = 'start' | 'decline' | 'allowMore' | 'takeResults';

/** Stop reasons the person fixes in the model connection, not by continuing. */
export const CONNECTION = new Set<RunStoppedItem['reason']>(['signed_out', 'credits_exhausted', 'plan_limit']);

/**
 * What a planned map says just above its input, from facts only: the question the AI waits on (on the card it
 * changes), that everything is decided (이대로 만들기 itself is in the top bar), what the AI does now while it builds
 * (with 멈추기, and a call to look when it waits for my OK). Once built it says nothing (app-first): what is broken
 * stands over the app as one red line, and 인터넷에 올리기 is in the top bar.
 */
export function PlanBar({
  docked = false,
  phase,
  thinking,
  question,
  about,
  preview,
  sample,
  activity,
  waiting,
  left,
  built,
  team,
  stop,
  onAnswer,
  onPreview,
  onHoverLook,
  onDecideRest,
  onAskOn,
  onDrawOn,
  onTeam,
  onContinue,
  onFixConnection,
  onStop,
  onLook,
}: {
  /**
   * Under the conversation beside the map (map-first 43): what the conversation itself shows (the OK it waits on,
   * what the AI does now, with 멈추기 in the input) is not said again here.
   */
  docked?: boolean;
  phase: PlanPhase;
  /** The AI is changing the map after an answer. */
  thinking: boolean;
  /** The question waiting: the plan's while planning, the build's once it stopped. */
  question: PlanQuestion | null;
  /** The title of the card the question is about. */
  about: string | null;
  /** The option of a look question being looked at. */
  preview: number;
  /** The screen the look options show themselves with. */
  sample: string;
  activity: PlanActivity | null;
  /** The AI at work waits for my OK on something it wants to do. */
  waiting: boolean;
  /** How many product decisions are still open. */
  left: number;
  built: PlanBuilt;
  /** The build's TF while it waits for the person. */
  team: PlanTeam | null;
  stop: PlanStop;
  onAnswer: (option: number) => void;
  onPreview: (option: number) => void;
  /** The pointer is on a look option (`null`: off them): the map wears it while it stays there. */
  onHoverLook?: (option: number | null) => void;
  onDecideRest: () => void;
  /** Asks the AI to go on asking what is left. */
  onAskOn: () => void;
  /** Asks the AI to go on drawing a plan that stopped before its first card. */
  onDrawOn: () => void;
  onTeam: (answer: PlanTeamAnswer) => void;
  /** Continues a build that stopped with cards left. */
  onContinue: () => void;
  onFixConnection: () => void;
  /** Stops what the AI is doing now. */
  onStop: () => void;
  /** Shows the conversation at work, where what it waits on is. */
  onLook: () => void;
}) {
  const t = useMessages(messages);
  if (docked && (phase === 'building' || phase === 'drawing' || thinking)) return null;
  if (waiting && (phase === 'building' || phase === 'drawing' || thinking))
    return (
      <Bar title={t.waitingTitle} hint={phase === 'building' ? t.waitingHint : t.waitingPlanHint}>
        <Button variant="primary" onClick={onLook}>
          {t.waitingLook}
        </Button>
        <Button onClick={onStop}>{t.stop}</Button>
      </Bar>
    );
  if (phase === 'drawing' || thinking)
    return <Working text={phase === 'drawing' ? t.drawingLine : t.thinkingLine} stop={t.stop} onStop={onStop} />;
  if (phase === 'asking' && question)
    return (
      <Question
        key={question.id}
        question={question}
        about={about}
        preview={preview}
        sample={sample}
        onAnswer={onAnswer}
        onPreview={onPreview}
        onHoverLook={onHoverLook}
        onDecideRest={onDecideRest}
      />
    );
  // The AI ended its turn without a question (stopped, failed, or just talked): what is left stays answerable.
  if (phase === 'asking' && built.cards === 0)
    return (
      <Bar title={t.noMapTitle}>
        <Button variant="primary" onClick={onDrawOn}>
          {t.drawOn}
        </Button>
      </Bar>
    );
  if (phase === 'asking' && left > 0)
    return (
      <Bar title={t.leftTitle(left)} hint={t.leftHint}>
        <Button variant="primary" onClick={onAskOn}>
          {t.askOn}
        </Button>
        <Button onClick={onDecideRest}>{t.decideRest}</Button>
      </Bar>
    );
  if (phase === 'ready') return <Bar title={t.ready} hint={t.readyHint} />;
  if (phase === 'building' && activity)
    return <Working key={activity.text} text={activity.text} hint={t.leaveHint} stop={t.stop} onStop={onStop} />;
  if (phase === 'team' && team?.status === 'proposed')
    return (
      <Bar title={t.teamTitle(team.agents)} hint={t.teamHint(team.title, team.oneByOne, team.most)}>
        <Button variant="primary" onClick={() => onTeam('start')}>
          {t.teamStart}
        </Button>
        <Button onClick={() => onTeam('decline')}>{t.teamAlone}</Button>
      </Bar>
    );
  if (phase === 'team' && team?.status === 'over')
    return (
      <Bar
        title={team.needed !== null ? t.teamOverTitle(team.agents, team.needed) : t.teamOverHint}
        hint={team.needed !== null ? t.teamOverHint : undefined}
      >
        {team.needed !== null && (
          <Button variant="primary" onClick={() => onTeam('allowMore')}>
            {t.teamOverContinue(team.needed - team.agents)}
          </Button>
        )}
        <Button onClick={() => onTeam('takeResults')}>{t.takeResults}</Button>
      </Bar>
    );
  if (phase === 'stopped' && question)
    return (
      <Question
        key={question.id}
        question={question}
        about={about}
        lead={t.stoppedQuestion}
        preview={preview}
        sample={sample}
        onAnswer={onAnswer}
        onPreview={onPreview}
      />
    );
  if (phase === 'stopped') {
    const why = stop.reason && stop.reason !== 'interrupted' ? t[`stoppedWhy_${stop.reason}`] : null;
    const connection = !!stop.reason && CONNECTION.has(stop.reason);
    return (
      <Bar title={t.stoppedTitle} hint={[why, t.stoppedCards(built.done, built.cards)].filter(Boolean).join(' · ')}>
        {connection && (
          <Button variant="primary" onClick={onFixConnection}>
            {t.fixConnection}
          </Button>
        )}
        <Button variant={connection ? undefined : 'primary'} onClick={onContinue}>
          {t.continueBuild}
        </Button>
        {stop.team && <LinkButton onClick={() => onTeam('takeResults')}>{t.takeResults}</LinkButton>}
      </Bar>
    );
  }
  return null;
}

/** One line of where the plan (or the map's work) stands and the answers to it. */
export function Bar({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <section className="pointer-events-auto motion-step flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay">
      <div className="flex min-w-0 grow basis-60 flex-col">
        <p className="text-reading text-fg">{title}</p>
        {hint && <p className="text-meta text-fg-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * One question: what it is about, the question, the answers, the AI's pick first and marked.
 * A look question shows every option on the same screen, and looking at one restyles the whole map.
 */
function Question({
  question,
  about,
  lead,
  preview,
  sample,
  onAnswer,
  onPreview,
  onHoverLook,
  onDecideRest,
}: {
  question: PlanQuestion;
  about: string | null;
  lead?: string;
  preview: number;
  sample: string;
  onAnswer: (option: number) => void;
  onPreview: (option: number) => void;
  onHoverLook?: (option: number | null) => void;
  onDecideRest?: () => void;
}) {
  const t = useMessages(messages);
  const looks = question.options.every((o) => o.look);
  return (
    <section
      aria-label={t.question}
      className="pointer-events-auto motion-step flex flex-col gap-3 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay"
    >
      <div className="flex flex-col">
        {about && <p className="text-meta text-fg-muted">{about}</p>}
        <p className="text-reading text-fg">{question.text}</p>
        {lead && <p className="text-meta text-fg-muted">{lead}</p>}
      </div>
      {looks ? (
        // As many columns as options (up to three), so two looks each get half the room and their names fit.
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.min(Math.max(question.options.length, 1), 3)}, minmax(0, 1fr))`,
          }}
        >
          {question.options.map((option, i) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={i === preview}
              onClick={() => onPreview(i)}
              onMouseEnter={() => onHoverLook?.(i)}
              onMouseLeave={() => onHoverLook?.(null)}
              className={clsx(
                'flex cursor-pointer flex-col gap-1.5 rounded-lg p-1.5 text-left',
                i === preview ? 'bg-selected' : 'hover:bg-hover',
              )}
            >
              <HtmlFrame
                html={screenPage(sample)}
                title={option.label}
                pageWidth={SCREEN_WIDTH}
                ratio={0.62}
                theme={option.look}
                inert
                className="rounded-md border border-line-subtle bg-canvas"
              />
              <span className="flex items-baseline gap-1.5 px-0.5">
                <span className="line-clamp-2 min-w-0 text-body break-keep text-fg">{option.label}</span>
                {option.recommended && <span className="shrink-0 text-meta text-interactive">{t.recommended}</span>}
              </span>
              {option.detail && <span className="px-0.5 text-meta text-fg-muted">{option.detail}</span>}
            </button>
          ))}
        </div>
      ) : (
        // One option per line, the full width: its label (and the pick's mark), then why under it, so both read
        // well beside the conversation.
        <div className="flex flex-col gap-1.5">
          {question.options.map((option, i) => {
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => onAnswer(i)}
                className={clsx(
                  'flex min-h-8 w-full cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-1.5 text-left text-body',
                  option.recommended
                    ? 'border-interactive bg-selected text-interactive hover:bg-hover'
                    : 'border-line bg-canvas-raised text-fg hover:bg-hover',
                )}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="min-w-0">{option.label}</span>
                  {option.recommended && <span className="shrink-0 text-meta">{t.recommended}</span>}
                </span>
                {option.detail && <span className="text-meta text-fg-muted">{option.detail}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-3">
        <p className="min-w-0 grow text-meta text-fg-muted">{looks ? t.lookHint : t.otherwise}</p>
        {looks ? (
          <Button variant="primary" onClick={() => onAnswer(preview)}>
            {t.lookPick}
          </Button>
        ) : (
          onDecideRest && <LinkButton onClick={onDecideRest}>{t.decideRest}</LinkButton>
        )}
      </div>
    </section>
  );
}

/**
 * What the AI is doing while there is nothing to answer, and, while building, that no one needs to watch; with
 * `onStop`, the way to stop it.
 */
export function Working({
  text,
  hint,
  stop,
  onStop,
}: {
  text: string;
  hint?: string;
  stop?: string;
  onStop?: () => void;
}) {
  return (
    <p
      role="status"
      className={clsx(
        'pointer-events-auto motion-step flex max-w-full items-center gap-2 self-center rounded-full bg-canvas-raised py-1 pl-3 text-meta shadow-overlay',
        onStop ? 'pr-1' : 'pr-3',
      )}
    >
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-interactive" aria-hidden />
      <span className="min-w-0 truncate text-fg">{text}</span>
      {hint && <span className="shrink-0 text-fg-muted">· {hint}</span>}
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          className="shrink-0 cursor-pointer rounded-full px-2 text-fg-muted hover:bg-hover hover:text-fg"
        >
          {stop}
        </button>
      )}
    </p>
  );
}
