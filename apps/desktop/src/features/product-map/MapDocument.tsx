import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';

import { useMessages } from '@/shared/i18n';

import { useBoardDevice } from './boardDevice';
import { layoutBoard } from './boardLayout';
import { DocExport } from './DocExport';
import { docMessages as messages } from './docMessages';
import { mark, readDocument } from './docModel';
import { filmMessages } from './filmMessages';
import { devicesOf } from './filmstripModel';
import { flowTreeMessages } from './flowTreeMessages';
import { hasScreenArea, isJourneyLink, type PromiseStatus, type TreeCard, type TreeMap } from './flowTreeModel';
import { WIREFRAME, type Device } from './planLook';
import { ScreenFace } from './screenFace';
import { Avatar, useText } from './treeParts';

/** A screen's frame in the document: small enough for a journey's screens to sit in one or two lines. */
const FRAME = { phone: { w: 120, h: 260 }, computer: { w: 280, h: 175 } } as const;

/**
 * The board as a planning document (10-25 design canvas, D): who uses the product, each journey with its real screens
 * in walk order, every promise, what was decided and what is left to decide. It is not written apart from the board:
 * the same map read top to bottom, so it always says what the board says. A screen opens on the board.
 */
export function MapDocument({
  map,
  undecided = [],
  look = WIREFRAME,
  onShowOnBoard,
}: {
  map: TreeMap;
  undecided?: string[];
  look?: string;
  onShowOnBoard: (cardId: string) => void;
}) {
  const t = useMessages(messages);
  const film = useMessages(filmMessages);
  const words = useMessages(flowTreeMessages);
  const text = useText();
  const device = useBoardDevice(map);
  const layout = useMemo(() => layoutBoard(map, device), [map, device]);
  const scroller = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState('people');

  const doc = useMemo(() => readDocument(map, layout), [map, layout]);
  const { people, journeys, homes, promises, statuses, decisions, screens } = doc;
  const journeyTitle = (id: string) => journeys.find((journey) => journey.id === id)?.title;

  const sections = [
    { id: 'people', label: t.people, depth: 0 },
    { id: 'flows', label: t.flows, depth: 0 },
    ...journeys.map((journey) => ({ id: `journey-${journey.id}`, label: text(journey.title), depth: 1 })),
    { id: 'promises', label: t.promises(promises.length), depth: 0 },
    ...(decisions.length ? [{ id: 'decisions', label: t.decisions(decisions.length), depth: 0 }] : []),
    ...(undecided.length ? [{ id: 'undecided', label: t.undecided(undecided.length), depth: 0 }] : []),
  ];
  const go = (id: string) => {
    setAt(id);
    scroller.current?.querySelector(`[data-doc="${id}"]`)?.scrollIntoView({ block: 'start' });
  };
  // The contents follow the reading: the last section whose heading has passed the top.
  const follow = () => {
    const pane = scroller.current;
    if (!pane) return;
    const top = pane.getBoundingClientRect().top + 96;
    let current = sections[0]!.id;
    for (const element of pane.querySelectorAll<HTMLElement>('[data-doc]'))
      if (element.getBoundingClientRect().top <= top) current = element.dataset.doc!;
    if (current !== at) setAt(current);
  };

  const frame = (card: TreeCard) => {
    const home = homes.get(card.id);
    const on: Device = home ? device(home) : 'phone';
    const size = FRAME[on];
    const number = layout.nodes[card.id]?.number;
    return (
      <li key={card.id} className="flex shrink-0 flex-col gap-1.5" style={{ width: size.w }}>
        <button
          type="button"
          aria-label={t.showOnBoard(card.title)}
          onClick={() => onShowOnBoard(card.id)}
          className="relative block cursor-pointer overflow-clip border border-line bg-canvas-raised shadow-card transition-shadow hover:shadow-overlay"
          style={{ width: size.w, height: size.h, borderRadius: on === 'phone' ? 18 : 8 }}
        >
          <ScreenFace card={card} device={on} ratio={size.h / size.w} look={look} touched={false} />
        </button>
        <span className="text-meta leading-snug">
          {number && <span className="mr-1 text-fg-faint tabular-nums">{number}</span>}
          {card.title}
        </span>
      </li>
    );
  };

  return (
    <div className="flex min-h-0 min-w-0 grow bg-canvas">
      <nav
        aria-label={t.contents}
        className="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line px-3 py-6"
      >
        <h2 className="px-2 pb-2 text-meta text-fg-muted">{t.contents}</h2>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={at === section.id ? 'location' : undefined}
            onClick={() => go(section.id)}
            className={clsx(
              'cursor-pointer truncate rounded-md py-1.5 pr-2 text-left text-body',
              section.depth ? 'pl-6' : 'pl-2',
              at === section.id ? 'bg-selected text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
            )}
          >
            {section.label}
          </button>
        ))}
      </nav>
      <div ref={scroller} onScroll={follow} className="min-w-0 grow overflow-y-auto">
        <article aria-label={t.label} className="mx-auto flex max-w-190 flex-col gap-12 px-10 pt-12 pb-24">
          <header className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-display font-medium">{map.product}</h1>
              <DocExport map={map} doc={doc} layout={layout} undecided={undecided} device={device} />
            </div>
            <p className="flex flex-wrap items-center gap-2 text-meta text-fg-muted">
              <span className="rounded-full bg-selected px-2 py-0.5 text-interactive">{t.sameAsBoard}</span>
              {t.counts(screens, promises.length)}
            </p>
            {(statuses.length > 0 || undecided.length > 0) && (
              <p aria-label={t.status} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
                {statuses.map(({ status, count }) => (
                  <span key={status} className={markTone(status)}>
                    {mark(status)} {words[status]} {count}
                  </span>
                ))}
                {undecided.length > 0 && <span className="text-fg-muted">{t.undecided(undecided.length)}</span>}
              </p>
            )}
          </header>

          <section data-doc="people" className="flex flex-col gap-4">
            <h2 className="text-title font-medium">{t.people}</h2>
            <ul className="grid grid-cols-2 gap-3">
              {people.map((person) => (
                <li key={person.id} className="flex gap-3 rounded-xl border border-line bg-canvas-raised p-4">
                  <Avatar person={person} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-body font-medium">
                      {text(person.name)}
                      <span className="text-fg-muted">
                        {' · '}
                        {devicesOf(person.journeys.filter((journey) => journey.steps.length).map(device))
                          .map((one) => film[one])
                          .join(', ')}
                      </span>
                    </p>
                    {text(person.role) && <p className="text-body text-fg-muted">{text(person.role)}</p>}
                    {text(person.start) && (
                      <p className="text-meta text-fg-muted">
                        {t.startsWith} · {text(person.start)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section data-doc="flows" className="flex flex-col gap-10">
            <h2 className="text-title font-medium">{t.flows}</h2>
            {journeys.map((journey) => {
              const person = people.find((one) => one.journeys.includes(journey))!;
              return (
                <section key={journey.id} data-doc={`journey-${journey.id}`} className="flex flex-col gap-3">
                  <h3 className="flex items-center gap-2 text-lead font-medium">
                    <Avatar person={person} small />
                    {text(journey.title)}
                  </h3>
                  {text(journey.goal) && <p className="text-reading text-fg-muted">{text(journey.goal)}</p>}
                  {journey.trigger && text(journey.trigger) && (
                    <p className="text-meta text-fg-muted">
                      {t.startsWith} · {text(journey.trigger)}
                    </p>
                  )}
                  <ol className="flex flex-wrap items-start gap-4 rounded-xl border border-line bg-canvas-sunken p-4">
                    {journey.steps.map((step) => {
                      if (isJourneyLink(step)) {
                        const id = step.slice('flow:'.length);
                        const title = journeyTitle(id);
                        return (
                          title && (
                            <li key={step} className="self-center">
                              <button
                                type="button"
                                onClick={() => go(`journey-${id}`)}
                                className="cursor-pointer rounded-full border border-line bg-canvas-raised px-3 py-1 text-meta text-interactive hover:bg-hover"
                              >
                                → {t.goesThrough(text(title))}
                              </button>
                            </li>
                          )
                        );
                      }
                      const card = map.cards[step];
                      if (!card) return null;
                      if (hasScreenArea(card)) return frame(card);
                      return (
                        <li
                          key={step}
                          className="flex w-30 shrink-0 flex-col gap-1 self-center rounded-lg border border-dashed border-line bg-canvas-raised px-3 py-2"
                        >
                          <span className="text-meta text-fg-faint">{t.noScreen}</span>
                          <span className="text-meta">{card.title}</span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </section>

          <section data-doc="promises" className="flex flex-col gap-3">
            <h2 className="text-title font-medium">{t.promises(promises.length)}</h2>
            {promises.length === 0 && <p className="text-body text-fg-muted">{t.noPromises}</p>}
            <ul className="flex flex-col gap-2">
              {promises.map(({ card, promise }) => {
                const situation = promise.state ? card.states?.find((one) => one.id === promise.state) : undefined;
                return (
                  <li key={`${card.id}/${promise.id}`} className="flex gap-2.5 text-body">
                    <span aria-hidden className={clsx('w-3 shrink-0 text-center', markTone(promise.status))}>
                      {mark(promise.status)}
                    </span>
                    <span className="min-w-0 grow">
                      {promise.when ? `${promise.when}, ${promise.then}` : promise.then}
                      <span className="text-meta text-fg-muted">
                        {' · '}
                        {card.title}
                        {situation && ` · ${situation.title}`}
                      </span>
                    </span>
                    <span className={clsx('shrink-0 text-meta', markTone(promise.status))}>
                      {words[promise.status]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {decisions.length > 0 && (
            <section data-doc="decisions" className="flex flex-col gap-3">
              <h2 className="text-title font-medium">{t.decisions(decisions.length)}</h2>
              <ul className="flex flex-col gap-2">
                {decisions.map((decision, index) => (
                  <li
                    key={index}
                    className="flex flex-col gap-0.5 rounded-lg border border-line bg-canvas-raised px-4 py-3"
                  >
                    <span className="text-body">{decision.answer}</span>
                    <span className="text-meta text-fg-muted">
                      {decision.question && `${decision.question} · `}
                      {decision.cards.map((card) => card.title).join(' · ')} ·{' '}
                      {decision.by === 'ai' ? t.byAi : t.byPerson}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {undecided.length > 0 && (
            <section data-doc="undecided" className="flex flex-col gap-3">
              <h2 className="text-title font-medium">{t.undecided(undecided.length)}</h2>
              <ul className="flex flex-col gap-2">
                {undecided.map((question) => (
                  <li key={question} className="rounded-lg bg-note px-4 py-3 text-body text-note-ink">
                    {question}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </div>
    </div>
  );
}

const markTone = (status: PromiseStatus) =>
  status === 'passed' ? 'text-interactive' : status === 'failed' ? 'text-danger' : 'text-fg-faint';
