import { Button, LinkButton } from '@alpine/ui/primitives';
import clsx from 'clsx';

import { HtmlFrame } from '@/shared/components/html-frame';
import { useMessages } from '@/shared/i18n';

import type { PlanActivity, PlanPhase, PlanQuestion } from './planData';
import { SCREEN_WIDTH, screenPage } from './planLook';
import { planMessages as messages } from './planMessages';

/** A question the AI answered on its own, opened from its card to pick another answer. */
export interface PlanReview {
  card: string;
  question: PlanQuestion;
  picked: number;
}

/**
 * What a planned map says just above its input, from facts only: the question the AI waits on (on the card it
 * changes), "이대로 만들기" once nothing is left, what the AI does now while it builds, and once built, what was
 * checked and what the AI decided on its own. A question the AI answered while building can be opened from its card
 * and answered again here.
 */
export function PlanBar({
  phase,
  thinking,
  question,
  about,
  preview,
  sample,
  activity,
  review,
  built,
  team,
  onAnswer,
  onPreview,
  onDecideRest,
  onBuild,
  onDecide,
  onCloseReview,
  onReviewPicks,
  onOpenApp,
  onTeam,
  onContinue,
}: {
  phase: PlanPhase;
  /** The AI is changing the map after an answer. */
  thinking: boolean;
  question: PlanQuestion | null;
  /** The title of the card the question is about. */
  about: string | null;
  /** The option of a look question being looked at. */
  preview: number;
  /** The screen the look options show themselves with. */
  sample: string;
  activity: PlanActivity | null;
  review: PlanReview | null;
  built: { checked: number; total: number; aiPicks: number; cards: number; done: number };
  /** The TF the build proposed, waiting for the person's yes. */
  team: { title: string; agents: number; minutes: number } | null;
  onAnswer: (option: number) => void;
  onPreview: (option: number) => void;
  onDecideRest: () => void;
  onBuild: () => void;
  onDecide: (option: number) => void;
  onCloseReview: () => void;
  onReviewPicks: () => void;
  onOpenApp: () => void;
  /** The person's answer to the TF the build proposed: start it, or let one AI build alone. */
  onTeam: (start: boolean) => void;
  /** Continues a build that stopped with cards left. */
  onContinue: () => void;
}) {
  const t = useMessages(messages);
  if (review)
    return (
      <Question
        key={`review-${review.card}`}
        question={review.question}
        about={review.card}
        lead={phase === 'building' ? t.decidedWhileBuilding : t.decidedAfterBuilding}
        picked={review.picked}
        preview={0}
        sample={sample}
        onAnswer={onDecide}
        onPreview={onPreview}
        onClose={onCloseReview}
      />
    );
  if (phase === 'drawing' || thinking) return <Working text={phase === 'drawing' ? t.drawingLine : t.thinkingLine} />;
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
        onDecideRest={onDecideRest}
      />
    );
  if (phase === 'ready')
    return (
      <section className="pointer-events-auto motion-step flex items-center gap-3 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay">
        <div className="flex min-w-0 grow flex-col">
          <p className="text-reading text-fg">{t.ready}</p>
          <p className="text-meta text-fg-muted">{t.readyHint}</p>
        </div>
        <Button variant="primary" onClick={onBuild}>
          {t.build}
        </Button>
      </section>
    );
  if (phase === 'building' && activity) return <Working key={activity.text} text={activity.text} hint={t.leaveHint} />;
  if (phase === 'team' && team)
    return (
      <section className="pointer-events-auto motion-step flex items-center gap-3 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay">
        <div className="flex min-w-0 grow flex-col">
          <p className="text-reading text-fg">{t.teamTitle(team.agents)}</p>
          <p className="text-meta text-fg-muted">{t.teamHint(team.title, team.minutes)}</p>
        </div>
        <Button variant="primary" onClick={() => onTeam(true)}>
          {t.teamStart}
        </Button>
        <Button onClick={() => onTeam(false)}>{t.teamAlone}</Button>
      </section>
    );
  if (phase === 'stopped')
    return (
      <section className="pointer-events-auto motion-step flex items-center gap-3 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay">
        <div className="flex min-w-0 grow flex-col">
          <p className="text-reading text-fg">{t.stoppedTitle}</p>
          <p className="text-meta text-fg-muted">{t.stoppedCards(built.done, built.cards)}</p>
        </div>
        <Button variant="primary" onClick={onContinue}>
          {t.continueBuild}
        </Button>
      </section>
    );
  if (phase === 'built')
    return (
      <section className="pointer-events-auto motion-step flex items-center gap-3 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay">
        <div className="flex min-w-0 grow flex-col">
          <p className="text-reading text-fg">{t.builtTitle}</p>
          <p className="text-meta text-fg-muted">
            {built.checked === built.total ? t.checkedAll(built.total) : t.checkedSome(built.checked, built.total)}
            {built.aiPicks > 0 && (
              <>
                {' · '}
                <LinkButton className="min-h-5 px-0.5" onClick={onReviewPicks}>
                  {t.aiPicks(built.aiPicks)}
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
  return null;
}

/**
 * One question: what it is about, the question, the answers. While planning the AI's pick comes first, marked; for a
 * question the AI answered while building, the answer it went with is marked instead and the question can be closed.
 * A look question shows every option on the same screen, and looking at one restyles the whole map.
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
  lead?: string;
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
                html={screenPage(sample)}
                title={option.label}
                pageWidth={SCREEN_WIDTH}
                ratio={0.62}
                theme={option.look}
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
