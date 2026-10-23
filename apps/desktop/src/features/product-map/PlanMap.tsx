import { Button, LinkButton } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { ArrowRight, Circle, CircleCheck, CircleX, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

import { HtmlFrame } from '@/shared/components/html-frame';
import { FallingSnow } from '@/shared/components/snowscape';
import { useLocale, useMessages } from '@/shared/i18n';

import type { Person, TreePromise } from './flowTreeModel';
import { MapAsk } from './MapAsk';
import {
  planOrder,
  sketchPage,
  type Plan,
  type PlanActivity,
  type PlanCard,
  type PlanPhase,
  type PlanQuestion,
} from './planModel';
import { planMessages as messages } from './planMessages';
import { WIREFRAME, type PlanLook } from './planThemes';

/** Sketches are drawn as a phone screen, then made smaller to fit their card. */
const SKETCH_WIDTH = 390;
const AVATARS = {
  1: 'bg-avatar-1 text-avatar-1-ink',
  2: 'bg-avatar-2 text-avatar-2-ink',
  3: 'bg-avatar-3 text-avatar-3-ink',
  4: 'bg-avatar-4 text-avatar-4-ink',
  5: 'bg-avatar-5 text-avatar-5-ink',
} as const;

/**
 * A product planned on its map, as the main screen of a new project: who uses it and the steps they take, each step
 * with a sketch of its screen and its promises. The AI asks one thing at a time just above the input, outlining the
 * card the question changes; an answer changes the map in place. The look is the last question, and picking a look
 * restyles every sketch at once.
 *
 * Once nothing is left to decide, one button hands it to the AI, which builds it in its own order; the person need
 * not watch. The map changes only on facts: what the AI is doing now and the cards it touches, a screen captured from
 * the running app in place of its sketch, a promise ticked when it was checked (or failed, with what was seen). A
 * question the map did not answer is answered by the AI with its pick so the work goes on, and stays on its card for
 * the person to change whenever they like.
 */
export function PlanMap({
  plan,
  phase,
  question,
  left,
  look,
  preview,
  thinking,
  activity,
  reviewing,
  sample,
  onAnswer,
  onAnswerInWords,
  onPreview,
  onDecideRest,
  onBuild,
  onReview,
  onDecide,
  onOpenApp,
  selected = null,
  onOpenCard,
  headerEnd,
  reply,
  side,
}: {
  plan: Plan;
  phase: PlanPhase;
  question: PlanQuestion | null;
  /** Questions still open, this one included. */
  left: number;
  /** The look the sketches wear; `null` until one is picked (grey lines). */
  look: PlanLook | null;
  /** The option of the look question being looked at. */
  preview: number;
  thinking: boolean;
  /** What the AI is doing now, while building. */
  activity: PlanActivity | null;
  /** The card whose question, answered by the AI while building, is open. */
  reviewing: string | null;
  /** The screen a look option shows itself with. */
  sample: string;
  onAnswer: (option: number) => void;
  onAnswerInWords: (words: string) => void;
  onPreview: (option: number) => void;
  onDecideRest: () => void;
  onBuild: () => void;
  /** Opens (or with `null` closes) a question the AI answered while building. */
  onReview: (cardId: string | null) => void;
  /** The person's own pick for the open question. */
  onDecide: (option: number) => void;
  onOpenApp: () => void;
  /** The card opened beside the map. */
  selected?: string | null;
  /** Cards can be opened: what was done on them, beside the map. */
  onOpenCard?: (cardId: string) => void;
  /** At the end of the top bar, e.g. the record's button. */
  headerEnd?: ReactNode;
  /** The AI's latest answer to something asked in the map's input, shown above it in place of the summary. */
  reply?: ReactNode;
  /** A panel beside the map, inside its frame. */
  side?: ReactNode;
}) {
  const t = useMessages(messages);
  const order = planOrder(plan);
  const cards = order.flatMap((id) => plan.cards[id] ?? []);
  const promises = cards.flatMap((card) => card.promises);
  const decided = cards.filter((card) => card.decided);
  const theme = (look ?? WIREFRAME).css;
  const open = reviewing ? plan.cards[reviewing] : undefined;
  const focus = open ? open.id : phase === 'asking' && !thinking ? (question?.about ?? null) : null;
  const touching = new Set(phase === 'building' ? (activity?.touching ?? []) : []);
  // Real screens are named only while some cards still show a sketch; once all are real, saying so is noise.
  const mixed = cards.some((card) => card.capture) && cards.some((card) => !card.capture);

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas-sunken">
      <header className="flex h-11 shrink-0 items-center gap-1.5 px-4 text-meta text-fg-muted">
        <span className="text-body text-fg">{plan.product}</span>
        <span>· {t.map}</span>
        <span className="grow" />
        {phase === 'building' ? (
          <span className="flex items-center gap-1.5 text-interactive">
            <LoaderCircle size={13} className="animate-spin" aria-hidden />
            {t.building}
          </span>
        ) : phase === 'built' ? (
          <span className="flex items-center gap-1.5 text-fg">
            <CircleCheck size={13} aria-hidden />
            {t.built}
          </span>
        ) : (
          <span>{phase === 'drawing' ? t.drawing : t.draft}</span>
        )}
        {headerEnd}
      </header>

      <div className="mx-2 mb-2 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-line-subtle bg-canvas">
        <div className="relative min-w-0 flex-1">
          <div className="h-full overflow-auto px-6 pt-5 pb-80">
            <div className="mb-6 flex items-center gap-2">
              <h1 className="text-title text-fg">{plan.product}</h1>
              {phase === 'asking' && (
                <span className="rounded-full border border-line px-2.5 text-meta text-attention">{t.left(left)}</span>
              )}
              {(phase === 'ready' || phase === 'building' || phase === 'built') && (
                <span className="rounded-full border border-line px-2.5 text-meta text-fg-muted">{t.decided}</span>
              )}
            </div>
            <div className="flex flex-col gap-7">
              {plan.people.map((person) => (
                <Lane key={person.id} person={person}>
                  {person.journeys.flatMap((journey) =>
                    journey.steps.map((id, i) => {
                      const card = plan.cards[id];
                      if (!card) return null;
                      return (
                        <div key={id} className="flex shrink-0 items-start gap-2">
                          {i > 0 && <ArrowRight size={14} className="mt-28 shrink-0 text-fg-faint" aria-hidden />}
                          <StepCard
                            card={card}
                            theme={theme}
                            focused={focus === id}
                            touched={touching.has(id)}
                            labelCapture={mixed}
                            selected={selected === id}
                            onOpen={onOpenCard && (() => onOpenCard(id))}
                            onReview={() => onReview(id)}
                          />
                        </div>
                      );
                    }),
                  )}
                </Lane>
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4">
            <div className="flex w-full max-w-160 flex-col gap-2">
              {open?.decided ? (
                <Question
                  key={`decided-${open.id}`}
                  question={open.decided.question}
                  about={open.title}
                  lead={phase === 'building' ? t.decidedWhileBuilding : t.decidedAfterBuilding}
                  picked={open.decided.picked}
                  preview={0}
                  sample={sample}
                  onAnswer={onDecide}
                  onPreview={onPreview}
                  onClose={() => onReview(null)}
                />
              ) : phase === 'drawing' || thinking ? (
                <Working text={phase === 'drawing' ? t.drawingLine : t.thinkingLine} />
              ) : phase === 'asking' && question ? (
                <Question
                  key={question.id}
                  question={question}
                  about={question.about ? (plan.cards[question.about]?.title ?? null) : null}
                  preview={preview}
                  sample={sample}
                  onAnswer={onAnswer}
                  onPreview={onPreview}
                  onDecideRest={onDecideRest}
                />
              ) : phase === 'ready' ? (
                <section className="pointer-events-auto motion-step flex items-center gap-3 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay">
                  <div className="flex min-w-0 grow flex-col">
                    <p className="text-reading text-fg">{t.ready}</p>
                    <p className="text-meta text-fg-muted">{t.readyHint}</p>
                  </div>
                  <Button variant="primary" onClick={onBuild}>
                    {t.build}
                  </Button>
                </section>
              ) : phase === 'building' && activity ? (
                <Working key={activity.text} text={activity.text} hint={t.leaveHint} />
              ) : reply ? (
                reply
              ) : phase === 'built' ? (
                <Done
                  checked={promises.filter((p) => p.status === 'passed').length}
                  total={promises.length}
                  decided={decided.length}
                  onReviewFirst={() => decided[0] && onReview(decided[0].id)}
                  onOpenApp={onOpenApp}
                />
              ) : null}
              <MapAsk
                empty={false}
                disabled={phase === 'drawing' || thinking}
                onSend={async (text) => {
                  if (text) onAnswerInWords(text);
                  return true;
                }}
              />
            </div>
          </div>
        </div>
        {side}
      </div>
    </div>
  );
}

/** A person and their steps in one row: who they are on the left, what they do in order on the right. */
function Lane({ person, children }: { person: Person; children: ReactNode }) {
  const { locale } = useLocale();
  const name = person.name[locale];
  const goal = person.journeys[0]?.goal[locale] ?? person.role[locale];
  return (
    <section aria-label={name} className="motion-step grid grid-cols-[104px_1fr] items-start gap-3">
      <div className="flex flex-col gap-1 pt-1">
        <span
          aria-hidden
          className={clsx('flex size-8 items-center justify-center rounded-full text-body', AVATARS[person.tone])}
        >
          {name.slice(0, 1)}
        </span>
        <span className="text-body text-fg">{name}</span>
        <span className="text-meta text-fg-muted">{goal}</span>
      </div>
      <div className="flex items-start gap-2">{children}</div>
    </section>
  );
}

/**
 * One step: its screen (the sketch, or once there is one the capture of the running app), its name, a line of what
 * was decided, a question the AI answered while building, and its promises. The card a question is about grows and is
 * outlined, so its screen can be read while answering. A step that waits on a question is dashed. A card the AI is
 * working on now is outlined too, its screen frosted over with snow falling on it until the AI moves on.
 */
function StepCard({
  card,
  theme,
  focused,
  touched,
  labelCapture,
  selected,
  onOpen,
  onReview,
}: {
  card: PlanCard;
  theme: string;
  focused: boolean;
  touched: boolean;
  /** Say that the screen is a real one. */
  labelCapture: boolean;
  /** Opened beside the map. */
  selected: boolean;
  /** Opens the card beside the map, when cards can be opened. */
  onOpen?: () => void;
  onReview: () => void;
}) {
  const t = useMessages(messages);
  const self = useRef<HTMLElement>(null);
  // The card being asked about comes into view above the question, once it has grown.
  useEffect(() => {
    if (!focused) return;
    const id = window.setTimeout(() => self.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 380);
    return () => window.clearTimeout(id);
  }, [focused]);
  const decided = card.decided;
  return (
    <article
      ref={self}
      aria-label={card.title}
      aria-current={focused || undefined}
      className={clsx(
        'relative flex shrink-0 scroll-mt-6 scroll-mb-80 flex-col gap-2 rounded-xl border p-1.5 transition-[width,border-color,box-shadow,background-color] duration-(--motion-panel)',
        focused
          ? 'w-72 border-interactive shadow-overlay ring-3 ring-interactive/15'
          : touched
            ? 'w-44 border-interactive ring-2 ring-interactive/20'
            : selected
              ? 'w-44 border-fg ring-2 ring-fg/10'
              : clsx('w-44 border-line', onOpen && 'hover:border-fg-faint'),
        card.maybe ? 'border-dashed bg-canvas' : 'bg-canvas-raised',
        // Plays once, when the card first appears.
        'motion-step',
      )}
    >
      {onOpen && (
        <button
          type="button"
          aria-label={card.title}
          aria-pressed={selected}
          onClick={onOpen}
          className="absolute inset-0 z-10 cursor-pointer rounded-xl"
        />
      )}
      <div className="relative overflow-hidden rounded-lg">
        <HtmlFrame
          key={card.capture ? 'capture' : 'sketch'}
          html={sketchPage(card.capture ?? card.sketch)}
          title={card.title}
          pageWidth={SKETCH_WIDTH}
          ratio={1.25}
          theme={theme}
          inert
          className={clsx(
            'motion-step rounded-lg border border-line-subtle bg-canvas transition-[filter] duration-(--motion-panel)',
            card.maybe && 'opacity-50',
            touched && 'blur-[1.5px]',
          )}
        />
        {touched && (
          <div aria-hidden className="motion-content absolute inset-0 rounded-lg bg-brand-blue/15">
            <FallingSnow />
          </div>
        )}
        {card.capture && labelCapture && (
          <span className="absolute right-1.5 bottom-1.5 rounded-full bg-canvas-raised/90 px-2 text-meta text-fg-muted shadow-overlay">
            {t.captured}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 px-1 pb-1">
        <h3 className={clsx('truncate text-body', card.maybe ? 'text-fg-muted' : 'text-fg')}>{card.title}</h3>
        {card.note && <p className="truncate text-meta text-fg-muted">{card.note}</p>}
        {decided && (
          <div className="motion-arrive flex flex-wrap items-baseline gap-x-1.5 rounded-md bg-canvas-sunken px-2 py-1 text-meta">
            <span className="min-w-0 grow text-fg-muted">
              {t.aiDecided} · {decided.question.options[decided.picked]?.label}
            </span>
            <LinkButton className="relative z-20 min-h-5 shrink-0 px-0.5" onClick={onReview}>
              {t.change}
            </LinkButton>
          </div>
        )}
        {card.promises.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {card.promises.map((promise) => (
              <PromiseLine key={promise.id} promise={promise} />
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** A promise and where it stands: planned, being checked, checked, or failed with what the check saw. */
/** With `showNote`, what the check saw is shown for every promise, not only for one that failed. */
export function PromiseLine({ promise, showNote = false }: { promise: TreePromise; showNote?: boolean }) {
  const t = useMessages(messages);
  const icon =
    promise.status === 'passed' ? (
      <CircleCheck size={12} className="mt-1 shrink-0 text-fg" aria-label={t.promisePassed} />
    ) : promise.status === 'failed' ? (
      <CircleX size={12} className="mt-1 shrink-0 text-danger" aria-label={t.promiseFailed} />
    ) : promise.status === 'checking' ? (
      <LoaderCircle size={12} className="mt-1 shrink-0 animate-spin text-interactive" aria-label={t.promiseChecking} />
    ) : (
      <Circle size={12} className="mt-1 shrink-0 text-fg-faint" aria-label={t.promisePlanned} />
    );
  return (
    <li className="motion-arrive flex flex-col rounded-sm">
      <span className="flex items-start gap-1.5 text-meta text-fg">
        {icon}
        {promise.then}
      </span>
      {promise.note && (promise.status === 'failed' || showNote) && (
        <span className={clsx('pl-4.5 text-meta', promise.status === 'failed' ? 'text-danger' : 'text-fg-muted')}>
          {promise.note}
        </span>
      )}
    </li>
  );
}

/**
 * One question: what it is about, the question, the answers. While planning the AI's pick comes first, marked; for a
 * question the AI answered while building, the answer it went with is marked instead and the card can be closed.
 */
function Question({
  question,
  about,
  lead,
  picked,
  preview,
  sample,
  onAnswer,
  onPreview,
  onDecideRest,
  onClose,
}: {
  question: PlanQuestion;
  about: string | null;
  /** A line above the question saying why it is asked now. */
  lead?: string;
  /** The answer the AI went with, for a question it answered itself. */
  picked?: number;
  preview: number;
  sample: string;
  onAnswer: (option: number) => void;
  onPreview: (option: number) => void;
  onDecideRest?: () => void;
  onClose?: () => void;
}) {
  const t = useMessages(messages);
  const looks = question.options.every((o) => o.look);
  const marked = (i: number) => (picked === undefined ? !!question.options[i]?.recommended : picked === i);
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
        <div className="grid grid-cols-3 gap-2">
          {question.options.map((option, i) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={i === preview}
              onClick={() => onPreview(i)}
              className={clsx(
                'flex cursor-pointer flex-col gap-1.5 rounded-lg p-1.5 text-left',
                i === preview ? 'bg-selected' : 'hover:bg-hover',
              )}
            >
              <HtmlFrame
                html={sketchPage(sample)}
                title={option.label}
                pageWidth={SKETCH_WIDTH}
                ratio={0.62}
                theme={option.look?.css}
                inert
                className="rounded-md border border-line-subtle bg-canvas"
              />
              <span className="flex items-baseline gap-1.5 px-0.5">
                <span className="truncate text-body text-fg">{option.label}</span>
                {option.recommended && <span className="shrink-0 text-meta text-interactive">{t.recommended}</span>}
              </span>
              {option.detail && <span className="px-0.5 text-meta text-fg-muted">{option.detail}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((option, i) => {
            const tag = picked === undefined ? option.recommended && t.recommended : picked === i && t.aiWentWith;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => onAnswer(i)}
                className={clsx(
                  'flex min-h-8 cursor-pointer items-baseline gap-1.5 rounded-lg border px-3 py-1.5 text-left text-body',
                  marked(i)
                    ? 'border-interactive bg-selected text-interactive hover:bg-hover'
                    : 'border-line bg-canvas-raised text-fg hover:bg-hover',
                )}
              >
                {option.label}
                {(tag || option.detail) && (
                  <span className="text-meta text-fg-muted">{[tag, option.detail].filter(Boolean).join(' · ')}</span>
                )}
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
        ) : onClose ? (
          <LinkButton onClick={onClose}>{t.close}</LinkButton>
        ) : (
          onDecideRest && <LinkButton onClick={onDecideRest}>{t.decideRest}</LinkButton>
        )}
      </div>
    </section>
  );
}

/** Built: what was checked, what the AI decided on its own, and the app itself. */
function Done({
  checked,
  total,
  decided,
  onReviewFirst,
  onOpenApp,
}: {
  checked: number;
  total: number;
  decided: number;
  onReviewFirst: () => void;
  onOpenApp: () => void;
}) {
  const t = useMessages(messages);
  return (
    <section className="pointer-events-auto motion-step flex items-center gap-3 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay">
      <div className="flex min-w-0 grow flex-col">
        <p className="text-reading text-fg">{t.builtTitle}</p>
        <p className="text-meta text-fg-muted">
          {checked === total ? t.checkedAll(total) : t.checkedSome(checked, total)}
          {decided > 0 && (
            <>
              {' · '}
              <LinkButton className="min-h-5 px-0.5" onClick={onReviewFirst}>
                {t.aiPicks(decided)}
              </LinkButton>
            </>
          )}
        </p>
      </div>
      <Button variant="primary" onClick={onOpenApp}>
        {t.openApp}
      </Button>
    </section>
  );
}

/** What the AI is doing while there is nothing to answer, and, while building, that no one needs to watch. */
function Working({ text, hint }: { text: string; hint?: string }) {
  return (
    <p className="pointer-events-auto motion-step flex items-center gap-2 self-center rounded-full bg-canvas-raised px-3 py-1 text-meta shadow-overlay">
      <span className="size-1.5 animate-pulse rounded-full bg-interactive" aria-hidden />
      <span className="text-fg">{text}</span>
      {hint && <span className="text-fg-muted">· {hint}</span>}
    </p>
  );
}
