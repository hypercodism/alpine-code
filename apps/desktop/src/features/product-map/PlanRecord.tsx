import { LinkButton } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { ChevronRight, CircleCheck, CircleX, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { HtmlFrame } from '@/shared/components/html-frame';
import { useMessages } from '@/shared/i18n';

import { MapAsk } from './MapAsk';
import { PromiseLine } from './PlanMap';
import { sketchPage, stepsFor, type Plan, type PlanCard, type RecordStep, type RecordThread } from './planModel';
import { planMessages as messages } from './planMessages';

/**
 * What used to be the session screen, folded into the map: every request and the work it led to is a thread kept
 * under the cards it touched. A card opened beside the map shows its screen, its promises with what their checks saw,
 * and the threads that touched it; the record shows every thread, the ones that touched no card too.
 */

/** A card opened beside the map: its screen large, its promises, what was done on it, and a box to ask about it. */
export function CardRecord({
  card,
  theme,
  threads,
  onClose,
}: {
  card: PlanCard;
  theme: string;
  threads: RecordThread[];
  onClose: () => void;
}) {
  const t = useMessages(messages);
  const touched = threads.filter((thread) => stepsFor(thread, card.id).length > 0).reverse();
  return (
    <Panel title={card.title} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-4 pb-4">
        <HtmlFrame
          key={card.capture ? 'capture' : 'sketch'}
          html={sketchPage(card.capture ?? card.sketch)}
          title={card.title}
          pageWidth={390}
          ratio={1.1}
          theme={theme}
          inert
          className="shrink-0 rounded-lg border border-line-subtle bg-canvas"
        />
        {card.promises.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-meta text-fg-muted">{t.promises}</h3>
            <ul className="flex flex-col gap-1">
              {card.promises.map((promise) => (
                <PromiseLine key={promise.id} promise={promise} showNote />
              ))}
            </ul>
          </section>
        )}
        <section className="flex flex-col gap-1.5">
          <h3 className="text-meta text-fg-muted">{t.doneHere}</h3>
          {touched.length === 0 ? (
            <p className="text-body text-fg-muted">{t.nothingYet}</p>
          ) : (
            touched.map((thread, i) => (
              <Thread key={thread.id} thread={thread} steps={stepsFor(thread, card.id)} startOpen={i === 0} />
            ))
          )}
        </section>
      </div>
      <div className="shrink-0 border-t border-line-subtle p-3">
        <MapAsk empty={false} disabled={false} placeholder={t.askCard(card.title)} onSend={async () => true} />
      </div>
    </Panel>
  );
}

/** Every thread of the map, newest first, each with the cards it touched (or none) and its steps one click away. */
export function AllRecords({
  plan,
  threads,
  open,
  onOpenCard,
  onClose,
}: {
  plan: Plan;
  threads: RecordThread[];
  /** A thread to show opened. */
  open?: string | null;
  onOpenCard: (cardId: string) => void;
  onClose: () => void;
}) {
  const t = useMessages(messages);
  return (
    <Panel title={t.record} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto px-4 pb-4">
        {[...threads].reverse().map((thread) => (
          <Thread
            key={thread.id}
            thread={thread}
            steps={thread.steps}
            startOpen={thread.id === open}
            cards={
              <span className="flex flex-wrap gap-1">
                {thread.cards.length === 0 ? (
                  <span className="rounded-md bg-canvas-sunken px-1.5 text-meta text-fg-muted">{t.offMap}</span>
                ) : (
                  thread.cards.slice(0, 3).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onOpenCard(id)}
                      className="cursor-pointer rounded-md bg-canvas-sunken px-1.5 text-meta text-fg-muted hover:bg-hover hover:text-fg"
                    >
                      {plan.cards[id]?.title ?? id}
                    </button>
                  ))
                )}
                {thread.cards.length > 3 && (
                  <span className="px-0.5 text-meta text-fg-faint">{t.more(thread.cards.length - 3)}</span>
                )}
              </span>
            }
          />
        ))}
      </div>
    </Panel>
  );
}

/** The AI's answer to something asked in the map's input, above it: what I asked, what it said, and where it is kept. */
export function RecordReply({ thread, onOpen }: { thread: RecordThread; onOpen: () => void }) {
  const t = useMessages(messages);
  const asked = thread.steps.find((step) => step.kind === 'me');
  const answer = [...thread.steps].reverse().find((step) => step.kind === 'ai');
  return (
    <section
      aria-label={t.reply}
      className="pointer-events-auto motion-step flex flex-col gap-2 rounded-xl border border-line bg-canvas-raised p-3 shadow-overlay"
    >
      {asked && <p className="self-end rounded-xl bg-hover px-3 py-1.5 text-body text-fg">{asked.text}</p>}
      {answer && <p className="text-reading text-fg">{answer.text}</p>}
      <div className="flex items-center gap-3 text-meta text-fg-muted">
        {answer?.detail && <span className="min-w-0 grow truncate">{t.changed(answer.detail.length)}</span>}
        <LinkButton className="ml-auto min-h-5 px-0.5" onClick={onOpen}>
          {t.seeInRecord}
        </LinkButton>
      </div>
    </section>
  );
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useMessages(messages);
  return (
    <aside
      aria-label={title}
      className="motion-step flex w-96 shrink-0 flex-col border-l border-line-subtle bg-canvas-raised"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <h2 className="min-w-0 grow truncate text-title text-fg">{title}</h2>
        <button
          type="button"
          aria-label={t.close}
          onClick={onClose}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
        >
          <X size={15} aria-hidden />
        </button>
      </header>
      {children}
    </aside>
  );
}

/** One request: my words and when, opening to what was said and done; what it changed opens one level further. */
function Thread({
  thread,
  steps,
  startOpen,
  cards,
}: {
  thread: RecordThread;
  steps: RecordStep[];
  startOpen: boolean;
  /** The cards it touched, under its title. */
  cards?: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="flex flex-col rounded-lg">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-baseline gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
      >
        <ChevronRight
          size={13}
          aria-hidden
          className={clsx('shrink-0 translate-y-0.5 text-fg-faint transition-transform', open && 'rotate-90')}
        />
        <span className="min-w-0 grow text-body text-fg">{thread.title}</span>
        <span className="shrink-0 text-meta text-fg-faint">{thread.at}</span>
      </button>
      {cards && <div className="pb-1 pl-7">{cards}</div>}
      {open && (
        <ol className="motion-content flex flex-col gap-2 pt-1 pb-3 pl-7">
          {steps
            // The title is already my words.
            .filter((step, i) => !(i === 0 && step.kind === 'me' && step.text === thread.title))
            .map((step, i) => (
              <Step key={i} step={step} />
            ))}
        </ol>
      )}
    </div>
  );
}

function Step({ step }: { step: RecordStep }) {
  const t = useMessages(messages);
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col gap-1">
      {step.kind === 'me' ? (
        <p className="self-start rounded-lg bg-hover px-2.5 py-1 text-body text-fg">{step.text}</p>
      ) : step.kind === 'ai' ? (
        <p className="text-body text-fg">{step.text}</p>
      ) : (
        <p className={clsx('flex items-start gap-1.5 text-body', step.kind === 'failed' ? 'text-danger' : 'text-fg')}>
          {step.kind === 'passed' ? (
            <CircleCheck size={13} className="mt-1 shrink-0" aria-label={t.promisePassed} />
          ) : (
            <CircleX size={13} className="mt-1 shrink-0" aria-label={t.promiseFailed} />
          )}
          {step.text}
        </p>
      )}
      {step.detail && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex cursor-pointer items-center gap-1 self-start text-meta text-fg-muted hover:text-fg"
          >
            {t.changed(step.detail.length)}
            <ChevronRight size={12} aria-hidden className={clsx('transition-transform', open && 'rotate-90')} />
          </button>
          {open && (
            <ul className="motion-content flex flex-col rounded-md bg-canvas-sunken px-2 py-1.5 font-mono text-meta text-fg-muted">
              {step.detail.map((line) => (
                <li key={line} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <span className="sr-only">{step.at}</span>
    </li>
  );
}
