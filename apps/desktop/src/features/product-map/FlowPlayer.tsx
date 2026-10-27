import { Button, LinkButton } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useMessages } from '@/shared/i18n';

import { useJourneyDevice } from './boardDevice';
import { filmMessages as messages } from './filmMessages';
import { hasScreenArea, isJourneyLink, type Journey, type Person, type TreeCard, type TreeMap } from './flowTreeModel';
import { useLayout } from './liveScreens';
import { WIREFRAME, type Device } from './planLook';
import { ScreenFace } from './screenFace';
import { Avatar, useText } from './treeParts';

/**
 * One step of a journey played: its card, the journey and person it belongs to (a called journey's own), and the
 * journey the board draws the card in (the first that walks it), whose device its screen is shown on.
 */
export interface WalkStep {
  cardId: string;
  journey: Journey;
  person: Person;
  home: Journey;
}

/**
 * A journey as it is walked, step by step: its steps in order, a step that calls another journey (`flow:<id>`) played
 * as that journey's own steps in their place (once: a journey that calls back is not walked again).
 */
export function flowWalk(map: TreeMap, journeyId: string): WalkStep[] {
  const owners = new Map(
    map.people.flatMap((person) => person.journeys.map((journey) => [journey.id, { journey, person }] as const)),
  );
  const homes = new Map<string, Journey>();
  for (const person of map.people)
    for (const journey of person.journeys)
      for (const step of journey.steps) if (!homes.has(step)) homes.set(step, journey);
  const walked = new Set<string>();
  const walk = (id: string): WalkStep[] => {
    const owner = owners.get(id);
    if (!owner || walked.has(id)) return [];
    walked.add(id);
    return owner.journey.steps.flatMap((step) =>
      isJourneyLink(step)
        ? walk(step.slice('flow:'.length))
        : map.cards[step]
          ? [{ cardId: step, journey: owner.journey, person: owner.person, home: homes.get(step)! }]
          : [],
    );
  };
  return walk(journeyId).filter((step, index, all) => index === 0 || all[index - 1]!.cardId !== step.cardId);
}

/** How long one step shows while the flow plays. */
export const STEP_MS = 4000;

/**
 * 흐름 재생 (the 10-25 design canvas's Play): one person's journey shown as the real screens they walk, one after
 * another, each large, with the button that leads on outlined and beside it who walks it, what the screen promises and
 * where it goes next. A step with no screen says what happens there. It plays by itself, a step every few seconds, or a
 * step at a time with 이전 and 다음 (← →, space to pause, Esc to close).
 */
export function FlowPlayer({
  map,
  journeyId,
  device,
  look = WIREFRAME,
  onClose,
  onOpenCard,
}: {
  map: TreeMap;
  journeyId: string;
  device: (journey: Journey) => Device;
  look?: string;
  onClose: () => void;
  onOpenCard: (personId: string, journeyId: string, cardId: string) => void;
}) {
  const t = useMessages(messages);
  const text = useText();
  const uses = useJourneyDevice(map);
  const steps = flowWalk(map, journeyId);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const at = Math.min(index, Math.max(steps.length - 1, 0));
  const step = steps[at];
  const last = at >= steps.length - 1;
  const go = (to: number) => setIndex(Math.max(0, Math.min(steps.length - 1, to)));

  useEffect(() => {
    if (!playing || last) return;
    const timer = setTimeout(() => setIndex((current) => current + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, last, at]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') setIndex((current) => Math.min(current + 1, steps.length - 1));
      else if (event.key === 'ArrowLeft') setIndex((current) => Math.max(current - 1, 0));
      else if (event.key === ' ') setPlaying((current) => !current);
      else return;
      event.preventDefault();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onClose, steps.length]);

  const first = steps[0];
  const card = step ? map.cards[step.cardId] : undefined;
  const nextCard = steps[at + 1] ? map.cards[steps[at + 1]!.cardId] : undefined;
  return (
    <div
      role="dialog"
      aria-label={t.playerLabel}
      className="motion-content absolute inset-0 z-30 flex flex-col bg-canvas-sunken text-body text-fg"
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-5">
        <Play size={14} aria-hidden className="text-interactive" />
        <h2 className="min-w-0 truncate font-medium">
          {t.playerLabel} · {first ? text(first.journey.title) : ''}
        </h2>
        {first && (
          <span className="flex shrink-0 items-center gap-1.5 text-meta text-fg-muted">
            <Avatar person={first.person} small />
            {text(first.person.name)} · {t[uses(first.journey)]}
          </span>
        )}
        <span className="grow" />
        <button
          type="button"
          aria-label={t.closePlayer}
          onClick={onClose}
          className="flex size-8 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
        >
          <X size={16} aria-hidden />
        </button>
      </header>
      {!step || !card ? (
        <p className="m-auto text-fg-muted">{t.nothingToPlay}</p>
      ) : (
        <div className="flex min-h-0 grow gap-8 px-8 py-6">
          <div className="flex min-w-0 grow items-center justify-center">
            <PlayedScreen key={`${at}-${card.id}`} card={card} next={nextCard} device={device(step.home)} look={look} />
          </div>
          <aside aria-label={card.title} className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto py-2">
            <p className="text-meta text-fg-muted tabular-nums">
              {t.stepOf(at + 1, steps.length)} · {text(step.person.name)}
            </p>
            <h3 className="text-display font-medium">{card.title}</h3>
            {!hasScreenArea(card) && <p className="text-meta text-fg-muted">{t.noScreenStep}</p>}
            {card.description && <p className="text-reading text-fg-muted">{card.description}</p>}
            {card.promises.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h4 className="text-meta text-fg-muted">{t.screenPromises}</h4>
                <ul className="flex flex-col gap-1">
                  {card.promises
                    .filter((promise) => !promise.state)
                    .map((promise) => (
                      <li key={promise.id} className="flex gap-1.5 text-body">
                        <span
                          aria-hidden
                          className={clsx(
                            'w-3 shrink-0 text-center',
                            promise.status === 'passed'
                              ? 'text-interactive'
                              : promise.status === 'failed'
                                ? 'text-danger'
                                : 'text-fg-faint',
                          )}
                        >
                          {promise.status === 'passed' ? '✓' : promise.status === 'failed' ? '✗' : '·'}
                        </span>
                        <span className="min-w-0">{promise.then}</span>
                      </li>
                    ))}
                </ul>
              </section>
            )}
            <NextLine card={card} next={nextCard} />
            <LinkButton
              className="self-start px-0.5"
              onClick={() => onOpenCard(step.person.id, step.journey.id, card.id)}
            >
              {t.openCard}
            </LinkButton>
          </aside>
        </div>
      )}
      <footer className="flex shrink-0 flex-col gap-3 border-t border-line px-5 py-3">
        <ol aria-label={t.playerSteps} className="flex gap-1.5 overflow-x-auto">
          {steps.map((one, position) => (
            <li key={`${position}-${one.cardId}`} className="shrink-0">
              <button
                type="button"
                aria-current={position === at ? 'step' : undefined}
                onClick={() => {
                  go(position);
                  setPlaying(false);
                }}
                className={clsx(
                  'flex h-8 max-w-48 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-meta transition-colors',
                  position === at
                    ? 'border-interactive bg-interactive text-on-fill'
                    : position < at
                      ? 'border-line bg-canvas-raised text-fg'
                      : 'border-line text-fg-muted hover:text-fg',
                )}
              >
                <span className="tabular-nums">{String(position + 1).padStart(2, '0')}</span>
                <span className="truncate">{map.cards[one.cardId]?.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-center gap-2">
          <Button disabled={at === 0} onClick={() => go(at - 1)}>
            <ChevronLeft size={14} aria-hidden />
            {t.previous}
          </Button>
          {last ? (
            <Button
              variant="primary"
              onClick={() => {
                go(0);
                setPlaying(true);
              }}
            >
              {t.fromStart}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setPlaying(!playing)}>
              {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
              {playing ? t.pause : t.play}
            </Button>
          )}
          <Button disabled={last} onClick={() => go(at + 1)}>
            {t.next}
            <ChevronRight size={14} aria-hidden />
          </Button>
        </div>
      </footer>
    </div>
  );
}

/**
 * The screen of a step, large: the real one with the button that leads to the next step outlined, or, for a step with
 * nothing to see, a card saying what happens.
 */
function PlayedScreen({
  card,
  next,
  device,
  look,
}: {
  card: TreeCard;
  next: TreeCard | undefined;
  device: Device;
  look: string;
}) {
  const t = useMessages(messages);
  const layout = useLayout(card.id);
  const button = next ? layout?.targets.find((target) => target.to === next.id) : undefined;
  if (!hasScreenArea(card))
    return (
      <div className="flex w-full max-w-120 flex-col gap-2 rounded-2xl border border-dashed border-line bg-canvas-raised px-8 py-10 text-center">
        <span className="text-meta text-fg-muted">{t.noScreenStep}</span>
        <span className="text-title">{card.title}</span>
      </div>
    );
  const phone = device === 'phone';
  const ratio = phone ? 844 / 390 : 0.625;
  return (
    <div
      className={clsx(
        'relative overflow-clip border border-line bg-canvas-raised shadow-overlay',
        phone ? 'h-full max-h-200 p-2' : 'w-full max-w-240 rounded-xl p-1.5',
      )}
      // A phone's corners, as the board draws them.
      style={{ aspectRatio: phone ? '390 / 844' : '16 / 10', borderRadius: phone ? 28 : undefined }}
    >
      <span
        className={clsx('relative block size-full overflow-clip', !phone && 'rounded-lg')}
        style={{ borderRadius: phone ? 22 : undefined }}
      >
        <ScreenFace
          card={card}
          device={device}
          ratio={ratio}
          look={look}
          touched={false}
          overlay={(scale) =>
            button && (
              <span
                role="img"
                aria-label={t.nextByButton(button.label || next!.title)}
                className="absolute animate-pulse rounded-lg border-3 border-interactive motion-reduce:animate-none"
                style={{
                  // Wider than tall around it, so a small text link reads as outlined, not circled.
                  left: button.x * scale - 8,
                  top: button.y * scale - 4,
                  width: button.w * scale + 16,
                  height: button.h * scale + 8,
                }}
              />
            )
          }
        />
      </span>
    </div>
  );
}

/** Where the step leads: the next screen and the button that goes there, a missing button, or the journey's end. */
function NextLine({ card, next }: { card: TreeCard; next: TreeCard | undefined }) {
  const t = useMessages(messages);
  const layout = useLayout(card.id);
  if (!next) return <p className="text-meta text-fg-muted">{t.walkEnd}</p>;
  const button = layout?.targets.find((target) => target.to === next.id);
  // Only once the real screen drew itself with its marks can it be said to have no button.
  const missing = !button && !!layout?.screen && hasScreenArea(card) && hasScreenArea(next);
  return (
    <section className="flex flex-col gap-0.5 rounded-lg bg-canvas-raised px-3 py-2">
      <p className="text-meta text-fg-muted">{t.nextStep}</p>
      <p className="text-body">{next.title}</p>
      {button ? (
        <p className="text-meta text-interactive">{t.nextByButton(button.label || next.title)}</p>
      ) : missing ? (
        <p className="text-meta text-attention">{t.missingButton(next.title)}</p>
      ) : null}
    </section>
  );
}
