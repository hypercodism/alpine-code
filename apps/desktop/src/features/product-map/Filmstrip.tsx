import { LinkButton } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { HtmlFrame } from '@/shared/components/html-frame';
import { FallingSnow } from '@/shared/components/snowscape';
import { useMessages } from '@/shared/i18n';

import { filmMessages as messages } from './filmMessages';
import { flowTreeMessages } from './flowTreeMessages';
import {
  deviceOf,
  devicesOf,
  filmSteps,
  journeyCounts,
  personCounts,
  type FilmStep,
  type FilmWay,
} from './filmstripModel';
import { CardDialog, type FlowTreeProps, type Focus } from './FlowTree';
import {
  LiveScreen,
  missingButtons,
  plannedLinks,
  SituationCheck,
  SituationChip,
  situationResult,
  useLayout,
  useLiveApp,
  useLiveLayouts,
} from './liveScreens';
import {
  hasScreenArea,
  isJourneyLink,
  tally,
  UNPLACED,
  type Journey,
  type Person,
  type TreeCard,
  type TreeMap,
  type TreePromise,
} from './flowTreeModel';
import { screenPage, screenWidthFor, WIREFRAME, type Device } from './planLook';
import { Avatar, RemovedNotice, useText, type PromiseTarget } from './treeParts';

export interface FilmstripProps extends FlowTreeProps {
  /** A product that began as a plan: what the AI decided shows under its screens, and a built card is real. */
  planned?: boolean;
  /** The card being built now: it rises over a night sky with snow falling, and its row comes into view. */
  making?: string | null;
  /** Opens what the AI decided on a card, to answer it again. */
  onChangePick?: (cardId: string) => void;
}

/** A phone row shows this many screens at most; a longer one shows one less and a tile for the rest. */
const PHONE_FIT = 4;
/** Promises listed under a screen before the rest are counted. */
const PROMISE_ROWS = 4;
/** The frames are pictures of a phone and a browser window, drawn to their own measure rather than the app's. */
const PHONE_RADIUS = 26;
const PHONE_SHADOW = '0 1px 0 rgb(27 45 64 / .04), 0 10px 24px -14px rgb(27 45 64 / .25)';
const BROWSER_SHADOW = '0 1px 0 rgb(27 45 64 / .04), 0 14px 30px -18px rgb(27 45 64 / .3)';
/** The screen being built, lifted over the night sky. */
const RISEN_SHADOW = '0 26px 50px -16px rgb(8 22 36 / .55)';
const SKY_SHADOW = '0 24px 50px -20px rgb(20 40 60 / .45)';
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** What the strip does for every screen it shows, so the rows need not pass each part along. */
interface Strip {
  map: TreeMap;
  look: string;
  planned: boolean;
  planning: boolean;
  making: string | null;
  fresh: ReadonlySet<string>;
  touching?: ReadonlySet<string>;
  asked?: string | null;
  lit?: Set<string> | null;
  open: (personId: string, journeyId: string, cardId: string, state?: string | null) => void;
  /** Opens a person's or a journey's details (what holds, what to do next, grouping, adding). */
  show: (focus: Focus) => void;
  seek: (cardId: string) => void;
  seekJourney: (journeyId: string) => void;
  onChangePick?: (cardId: string) => void;
}

/**
 * The map as a filmstrip of the product's screens (map-first, 10-25): per person who uses it, each of their journeys
 * with its screens in the order they are walked, on the device the journey is used on. A phone journey is a row of
 * phone frames with arrows between them; a computer journey is a column of browser windows, each with its words beside
 * it. Under every screen: its name, how it stands (a drawing, being built, real) and its promises. Pressing a screen
 * opens its card. What the AI works on is outlined with snow on it; the screen being built rises over a night sky.
 */
export function Filmstrip(props: FilmstripProps) {
  const t = useMessages(messages);
  const tree = useMessages(flowTreeMessages);
  const { map } = props;
  const [focus, setFocus] = useState<Focus | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState(0);
  // What to bring into view next: a screen, or a whole journey (a step that goes through it).
  const [target, setTarget] = useState<{ cardId?: string; journeyId?: string; at: number } | null>(null);
  const wall = useRef<HTMLDivElement>(null);
  const zoom = useWallZoom(wall);
  const wide = useWideScreens(map);
  const fresh = useJustBuilt(map);

  const where = (cardId: string) => {
    for (const person of map.people)
      for (const journey of person.journeys) if (journey.steps.includes(cardId)) return { person, journey };
    return null;
  };
  const open = (personId: string, journeyId: string, cardId: string, state?: string | null) =>
    setFocus({ kind: 'step', personId, journeyId, cardId, state: state ?? null });
  // A screen the "more" tile holds opens its row first.
  const seek = (cardId: string) => {
    const holding = map.people
      .flatMap((person) => person.journeys)
      .filter(
        (journey) =>
          !expanded.has(journey.id) &&
          journey.steps.length > PHONE_FIT &&
          journey.steps.indexOf(cardId) >= PHONE_FIT - 1,
      );
    if (holding.length) setExpanded((current) => new Set([...current, ...holding.map((journey) => journey.id)]));
    setTarget((current) => ({ cardId, at: (current?.at ?? 0) + 1 }));
  };
  useEffect(() => {
    if (!target || !wall.current) return;
    const found = [
      ...wall.current.querySelectorAll<HTMLElement>(target.cardId ? '[data-card]' : '[data-journey]'),
    ].find((element) =>
      target.cardId ? element.dataset.card === target.cardId : element.dataset.journey === target.journeyId,
    );
    found?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [target]);

  // The card a question is about, and the one being built, come into view (without opening).
  const [followed, setFollowed] = useState<{ asked?: string | null; making?: string | null }>({});
  if (props.asked !== followed.asked || props.making !== followed.making) {
    setFollowed({ asked: props.asked, making: props.making });
    if (props.asked && props.asked !== followed.asked) seek(props.asked);
    else if (props.making && props.making !== followed.making) seek(props.making);
  }

  // The page asks for a card (a search hit, a change): bring it into view and open it.
  const [answered, setAnswered] = useState<number | null>(null);
  const asked = props.reveal;
  if (asked && asked.seq !== answered) {
    setAnswered(asked.seq);
    const found = where(asked.cardId);
    if (found) setFocus({ kind: 'step', personId: found.person.id, journeyId: found.journey.id, cardId: asked.cardId });
    seek(asked.cardId);
  }

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(0), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const person =
    focus && focus.kind !== 'addPerson' ? map.people.find((candidate) => candidate.id === focus.personId) : undefined;
  // A person renamed or regrouped (here or by the AI) gets a new id; what is open follows their journeys there.
  const [held, setHeld] = useState('');
  const heldNow = person?.journeys.map((journey) => journey.id).join(' ') ?? held;
  if (heldNow !== held) setHeld(heldNow);
  if (focus && focus.kind !== 'addPerson' && !person && held) {
    const moved = map.people.find((candidate) =>
      candidate.journeys.some((journey) => held.split(' ').includes(journey.id)),
    );
    if (moved) setFocus({ ...focus, personId: moved.id });
  }
  const strip: Strip = {
    map,
    look: props.look ?? WIREFRAME,
    planned: !!props.planned,
    planning: !!props.planning,
    making: props.making ?? null,
    fresh,
    touching: props.touching,
    asked: props.asked,
    lit: props.lit,
    open,
    show: setFocus,
    seek,
    seekJourney: (journeyId) => setTarget((current) => ({ journeyId, at: (current?.at ?? 0) + 1 })),
    onChangePick: props.onChangePick,
  };

  return (
    <div className="relative flex min-h-0 min-w-0 grow">
      <div
        ref={wall}
        role="region"
        aria-label={t.label}
        className="min-h-0 min-w-0 grow overflow-auto bg-canvas-sunken px-10 pb-20 text-body text-fg"
      >
        <div style={zoom.level === 1 ? undefined : { zoom: zoom.level }}>
          {map.people.map((one) => (
            <PersonRows
              key={one.id}
              person={one}
              strip={strip}
              expanded={expanded}
              onExpand={(journeyId) => setExpanded((current) => new Set(current).add(journeyId))}
              device={(journey) => deviceOf(journey, map, wide)}
            />
          ))}
          <AddButton onClick={() => setFocus({ kind: 'addPerson' })}>{tree.addPerson}</AddButton>
        </div>
      </div>
      <ZoomControls zoom={zoom} />
      <SituationCheck map={map} />
      {notice > 0 && (
        <RemovedNotice
          key={notice}
          onUndo={() => {
            props.onUndoRemove();
            setNotice(0);
          }}
        />
      )}
      <CardDialog
        map={map}
        focus={focus}
        person={person}
        props={props}
        onShow={(target, personId) => {
          const journey = map.people
            .find((candidate) => candidate.id === personId)
            ?.journeys.find((candidate) => candidate.steps.includes(target.cardId));
          if (journey) setFocus({ kind: 'promise', personId, journeyId: journey.id, ...target });
        }}
        onFocus={(next) => {
          setFocus(next);
          if (next.kind === 'step' || next.kind === 'promise') seek(next.cardId);
        }}
        onRemove={(target: PromiseTarget) => {
          props.onRemovePromise(target);
          if (focus?.kind === 'promise' && focus.promiseId === target.promiseId)
            setFocus({ kind: 'step', personId: focus.personId, journeyId: focus.journeyId, cardId: focus.cardId });
          setNotice(Date.now());
        }}
        onDone={setFocus}
      />
    </div>
  );
}

// ---------------------------------------------------------------- people and journeys

function PersonRows({
  person,
  strip,
  expanded,
  onExpand,
  device,
}: {
  person: Person;
  strip: Strip;
  expanded: ReadonlySet<string>;
  onExpand: (journeyId: string) => void;
  device: (journey: Journey) => Device;
}) {
  const t = useMessages(messages);
  const text = useText();
  const tree = useMessages(flowTreeMessages);
  const loose = person.journeys.length === 1 && person.journeys[0]!.id === UNPLACED;
  const counts = personCounts(strip.map, person);
  const devices = loose ? [] : devicesOf(person.journeys.map(device));
  return (
    <section aria-label={text(person.name)} data-person={person.id}>
      <header className="sticky top-0 z-20 -mx-10 flex h-11 items-center gap-2 bg-canvas-sunken px-10 text-body text-fg">
        <h2 className="-ml-2 min-w-0">
          <button
            type="button"
            onClick={() => strip.show({ kind: 'person', personId: person.id })}
            className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-hover"
          >
            {!loose && <Avatar person={person} small />}
            <span className="truncate">{text(person.name)}</span>
          </button>
        </h2>
        {devices.map((one) => (
          <span key={one} className="flex shrink-0 items-center gap-1 text-fg-faint">
            <DeviceIcon device={one} />
            {t[one]}
          </span>
        ))}
        {!loose && (
          <span className="ml-auto shrink-0 text-meta text-fg-faint">
            {t.personCounts(counts.journeys, counts.screens)}
          </span>
        )}
      </header>
      {person.journeys.map((journey) => (
        <JourneyRow
          key={journey.id}
          person={person}
          journey={journey}
          strip={strip}
          loose={loose}
          device={device(journey)}
          expanded={expanded.has(journey.id)}
          onExpand={() => onExpand(journey.id)}
        />
      ))}
      {!loose && (
        <AddButton onClick={() => strip.show({ kind: 'addJourney', personId: person.id })}>{tree.addJourney}</AddButton>
      )}
    </section>
  );
}

function JourneyRow({
  person,
  journey,
  strip,
  loose,
  device,
  expanded,
  onExpand,
}: {
  person: Person;
  journey: Journey;
  strip: Strip;
  loose: boolean;
  device: Device;
  expanded: boolean;
  onExpand: () => void;
}) {
  const t = useMessages(messages);
  const text = useText();
  const steps = filmSteps(journey);
  const counts = journeyCounts(strip.map, journey);
  return (
    <section data-journey={journey.id} aria-label={loose ? undefined : text(journey.title)} className="mt-1.5 mb-8">
      {!loose && (
        <h3 className="mb-4 ml-7.5 flex flex-wrap items-baseline gap-x-2.5">
          <button
            type="button"
            onClick={() => strip.show({ kind: 'journey', personId: person.id, journeyId: journey.id })}
            className="-ml-1.5 cursor-pointer rounded-md px-1.5 text-left text-title font-medium transition-colors hover:bg-hover"
          >
            {text(journey.title)}
          </button>
          <span className="text-meta text-fg-muted">
            {strip.planning
              ? t.journeyPlanned(counts.screens, counts.promises)
              : t.journeyChecked(counts.screens, counts.promises, counts.checked)}
          </span>
          <SituationsShown journey={journey} strip={strip} />
        </h3>
      )}
      {!loose && (journey.situations?.length ?? 0) > 0 && (
        <div
          role="group"
          aria-label={t.journeySituations}
          className="-mt-2 mb-4 ml-7.5 flex flex-wrap items-center gap-1.5"
        >
          <span className="text-meta text-fg-muted">{t.journeySituations}</span>
          {journey.situations!.map((situation) => {
            const screen = situation.screen ? strip.map.cards[situation.screen] : undefined;
            const own = screen?.states?.find((one) => one.id === situation.id);
            return (
              <SituationChip
                key={situation.id}
                cardId={screen?.id ?? ''}
                situation={own ?? { id: situation.id, title: situation.title, why: situation.why }}
                onClick={() => screen && strip.open(person.id, journey.id, screen.id, situation.id)}
              />
            );
          })}
        </div>
      )}
      {device === 'computer' && !loose ? (
        <ComputerColumn person={person} journey={journey} steps={steps} strip={strip} />
      ) : (
        <PhoneRow
          person={person}
          journey={journey}
          steps={steps}
          strip={strip}
          loose={loose}
          expanded={expanded}
          onExpand={onExpand}
        />
      )}
    </section>
  );
}

/** A phone journey: frames side by side; a long one shows three and a tile that opens the rest onto the next lines. */
function PhoneRow({
  person,
  journey,
  steps,
  strip,
  loose,
  expanded,
  onExpand,
}: {
  person: Person;
  journey: Journey;
  steps: FilmStep[];
  strip: Strip;
  loose: boolean;
  expanded: boolean;
  onExpand: () => void;
}) {
  const t = useMessages(messages);
  const long = !loose && !expanded && steps.length > PHONE_FIT;
  const shown = long ? steps.slice(0, PHONE_FIT - 1) : steps;
  const rest = long ? steps.slice(PHONE_FIT - 1) : [];
  const sky = shown.some((step) => step.id === strip.making);
  return (
    <div className={clsx('flex flex-wrap items-start gap-y-7.5 pl-7.5', sky && 'pt-7')}>
      {shown.map((step, index) => (
        <Fragment key={`${step.id}-${index}`}>
          {index > 0 &&
            (loose ? (
              <span className="w-6 shrink-0" />
            ) : (
              <Between before={shown[index - 1]!} after={step} strip={strip} />
            ))}
          <PhoneStep person={person} journey={journey} step={step} strip={strip} />
        </Fragment>
      ))}
      {long && (
        <>
          <Arrow />
          <button
            type="button"
            onClick={onExpand}
            className="flex h-100 w-28 shrink-0 cursor-pointer flex-col items-center justify-center gap-3.5 rounded-2xl text-fg-muted transition-colors hover:bg-canvas-raised/50"
          >
            <span aria-hidden className="relative h-27.5 w-15">
              <span className="absolute top-0 left-2 h-25 w-13 rounded-xl border border-line bg-canvas-raised opacity-70" />
              <span className="absolute top-2 left-0 h-25 w-13 rounded-xl border border-line bg-canvas-raised" />
            </span>
            <span className="text-body font-medium text-fg">{t.more(rest.length)}</span>
            <span className="flex flex-col items-center text-center text-meta">
              {rest.map((step, index) => (
                <span key={`${step.id}-${index}`}>{stepTitle(strip.map, step.id)}</span>
              ))}
            </span>
          </button>
        </>
      )}
    </div>
  );
}

/** What joins two phone frames: an arrow, or after a screen that forks, its ways as small stacked rows. */
function Between({ before, after, strip }: { before: FilmStep; after: FilmStep; strip: Strip }) {
  if (!before.forks.length) return <LinkArrow from={before.id} to={after.id} strip={strip} />;
  return (
    <span className="flex h-100 w-36 shrink-0 flex-col justify-center gap-1.5 px-2">
      <Ways ways={before.forks} strip={strip} />
    </span>
  );
}

function Ways({ ways, strip }: { ways: FilmWay[]; strip: Strip }) {
  return ways.map((way) => (
    <button
      key={`${way.to}-${way.label}`}
      type="button"
      onClick={() => strip.seek(way.to)}
      className="flex min-w-0 cursor-pointer flex-col rounded-md px-2 py-1 text-left text-meta transition-colors hover:bg-canvas-raised/60"
    >
      {way.label && <span className="truncate text-fg-muted">{way.label}</span>}
      <span className="flex min-w-0 items-center gap-1 text-fg">
        <span aria-hidden className="text-fg-faint">
          →
        </span>
        <span className="truncate">{stepTitle(strip.map, way.to)}</span>
      </span>
    </button>
  ));
}

/** A quiet way to add a journey or a person, after the rows it adds to. */
function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-6 ml-7.5 flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-line px-3 text-meta text-fg-muted transition-colors hover:border-interactive hover:text-fg"
    >
      <Plus size={12} aria-hidden />
      {children}
    </button>
  );
}

function Arrow({ tone = 'quiet', label }: { tone?: 'quiet' | 'checked' | 'missing'; label?: string }) {
  return (
    <span
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      title={label}
      className={clsx(
        'flex h-100 w-9 shrink-0 items-center justify-center',
        tone === 'checked' ? 'text-interactive' : tone === 'missing' ? 'text-attention' : 'text-fg-faint/60',
      )}
    >
      <svg width="24" height="10" viewBox="0 0 24 10" fill="none">
        <path
          d="M1 5h21M18 1.5 22 5l-4 3.5"
          stroke="currentColor"
          strokeWidth={tone === 'quiet' ? 1.2 : 1.6}
          strokeDasharray={tone === 'missing' ? '3 3' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * The arrow between two screens, checked against the real screen once it has been seen: the button that leads on
 * (blue, its words as the arrow's label), or none (orange, dashed) when the plan has a way on the screen has no button
 * for.
 */
function LinkArrow({ from, to, strip }: { from: string; to: string; strip: Strip }) {
  const t = useMessages(messages);
  const layout = useLayout(from);
  if (!layout?.screen || !plannedLinks(strip.map).get(from)?.has(to)) return <Arrow />;
  const button = layout.targets.find((target) => target.to === to);
  return button ? (
    <Arrow tone="checked" label={button.label} />
  ) : (
    <Arrow tone="missing" label={t.missingButton(stepTitle(strip.map, to))} />
  );
}

/** A computer journey: one browser window per row, its words beside it, and a quiet "다음" down to the next. */
function ComputerColumn({
  person,
  journey,
  steps,
  strip,
}: {
  person: Person;
  journey: Journey;
  steps: FilmStep[];
  strip: Strip;
}) {
  const t = useMessages(messages);
  return steps.map((step, index) => (
    <Fragment key={`${step.id}-${index}`}>
      {index > 0 &&
        (steps[index - 1]!.forks.length ? (
          <span className="ml-7.5 flex w-150 flex-wrap justify-center gap-1 py-2">
            <Ways ways={steps[index - 1]!.forks} strip={strip} />
          </span>
        ) : (
          <span
            aria-hidden
            className="ml-7.5 flex h-12 w-150 flex-col items-center justify-center text-meta text-fg-faint before:h-2 before:w-px before:bg-line after:h-2 after:w-px after:bg-line"
          >
            <span className="py-0.5">{t.next}</span>
          </span>
        ))}
      <ComputerStep person={person} journey={journey} step={step} strip={strip} />
    </Fragment>
  ));
}

// ---------------------------------------------------------------- screens

/** The title of a step: its card's, or the journey it goes through. */
function stepTitle(map: TreeMap, id: string) {
  if (isJourneyLink(id)) {
    const flow = id.slice('flow:'.length);
    return map.people.flatMap((person) => person.journeys).find((journey) => journey.id === flow)?.title.ko ?? flow;
  }
  return map.cards[id]?.title ?? id;
}

/** How one screen stands on the strip now. */
function standing(card: TreeCard, strip: Strip) {
  return {
    making: card.id === strip.making,
    touched: card.id !== strip.making && !!strip.touching?.has(card.id),
    asked: card.id === strip.asked,
    dim: !!strip.lit && !strip.lit.has(card.id),
    fresh: card.id !== strip.making && strip.fresh.has(card.id),
  };
}

function PhoneStep({
  person,
  journey,
  step,
  strip,
}: {
  person: Person;
  journey: Journey;
  step: FilmStep;
  strip: Strip;
}) {
  const t = useMessages(messages);
  if (isJourneyLink(step.id))
    return (
      <span className="w-50 shrink-0 pt-35">
        <LinkTile step={step} strip={strip} />
      </span>
    );
  const card = strip.map.cards[step.id];
  if (!card) return null;
  const look = standing(card, strip);
  const open = () => strip.open(person.id, journey.id, card.id);
  if (!hasScreenArea(card))
    return (
      <div data-card={card.id} className={clsx('w-50 shrink-0 pt-35 transition-opacity', look.dim && 'opacity-35')}>
        <NoScreen card={card} outlined={look.touched || look.asked || look.making} onOpen={open} />
        <Caption card={card} step={step} strip={strip} />
      </div>
    );
  return (
    <div
      data-card={card.id}
      className={clsx('relative w-50 shrink-0 transition-opacity', look.making && 'mx-6', look.dim && 'opacity-35')}
    >
      {look.making && <NightSky />}
      {look.fresh && <JustReal />}
      {!look.making && (card.states?.length ?? 0) > 0 && <Deck />}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t.open(card.title)}
        onClick={open}
        className={clsx(
          'relative block h-100 w-50 cursor-pointer border bg-canvas-raised p-1.5 transition-[border-color,box-shadow,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
          look.making
            ? '-translate-y-1.5 border-brand-snow'
            : look.touched || look.asked
              ? 'border-interactive ring-3 ring-interactive/20'
              : 'border-line hover:border-interactive',
          look.fresh && 'motion-arrive',
          card.tentative && 'border-dashed',
        )}
        style={{ borderRadius: PHONE_RADIUS, boxShadow: look.making ? RISEN_SHADOW : PHONE_SHADOW }}
      >
        {look.making && <MakingTag />}
        {look.making && <SnowCap />}
        <span
          className="relative block h-96.5 w-46.5 overflow-hidden bg-canvas-raised"
          style={{ borderRadius: PHONE_RADIUS - 6 }}
        >
          <ScreenFace card={card} device="phone" ratio={386 / 186} look={strip.look} touched={look.touched} />
        </span>
      </button>
      <Caption
        card={card}
        step={step}
        strip={strip}
        onSituation={(state) => strip.open(person.id, journey.id, card.id, state)}
      />
    </div>
  );
}

function ComputerStep({
  person,
  journey,
  step,
  strip,
}: {
  person: Person;
  journey: Journey;
  step: FilmStep;
  strip: Strip;
}) {
  const t = useMessages(messages);
  if (isJourneyLink(step.id))
    return (
      <div className="ml-7.5 w-150">
        <LinkTile step={step} strip={strip} />
      </div>
    );
  const card = strip.map.cards[step.id];
  if (!card) return null;
  const look = standing(card, strip);
  const open = () => strip.open(person.id, journey.id, card.id);
  return (
    <div
      data-card={card.id}
      // Where the window beside it is too narrow for the words, they go under the frame rather than past the edge.
      className={clsx(
        'flex flex-wrap items-start gap-x-7 gap-y-3 pl-7.5 transition-opacity',
        look.dim && 'opacity-35',
        look.making && 'py-5',
      )}
    >
      {hasScreenArea(card) ? (
        <div className="relative shrink-0">
          {look.making && <NightSky wide />}
          {look.fresh && <JustReal />}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={t.open(card.title)}
            onClick={open}
            className={clsx(
              'relative block w-150 cursor-pointer overflow-hidden rounded-xl border bg-canvas-raised text-left transition-[border-color,box-shadow,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
              look.making
                ? '-translate-y-1.5 border-brand-snow'
                : look.touched || look.asked
                  ? 'border-interactive ring-3 ring-interactive/20'
                  : 'border-line hover:border-interactive',
              look.fresh && 'motion-arrive',
              card.tentative && 'border-dashed',
            )}
            style={{ boxShadow: look.making ? RISEN_SHADOW : BROWSER_SHADOW }}
          >
            {look.making && <MakingTag />}
            <span className="flex h-6.5 items-center gap-1.5 border-b border-line-subtle bg-canvas-sunken/60 px-2.5">
              {[0, 1, 2].map((dot) => (
                <span key={dot} aria-hidden className="size-1.75 rounded-full bg-line" />
              ))}
              <span className="mx-auto flex h-4.5 max-w-80 items-center truncate rounded-sm border border-line-subtle bg-canvas-raised px-3 text-meta text-fg-faint">
                {card.path || strip.map.product}
              </span>
            </span>
            <span className="relative block h-93.75 w-150 overflow-hidden">
              <ScreenFace card={card} device="computer" ratio={0.625} look={strip.look} touched={look.touched} />
            </span>
          </button>
        </div>
      ) : (
        <span className="w-150 shrink-0">
          <NoScreen card={card} outlined={look.touched || look.asked || look.making} onOpen={open} />
        </span>
      )}
      <Caption
        card={card}
        step={step}
        strip={strip}
        wide
        onSituation={(state) => strip.open(person.id, journey.id, card.id, state)}
      />
    </div>
  );
}

/**
 * What a frame shows: a capture of the running app, else the planned screen in the map's look (the look being tried,
 * while one is), else the sketch drawn from the code, else the empty frame with the screen's name.
 */
function ScreenFace({
  card,
  device,
  ratio,
  look,
  touched,
}: {
  card: TreeCard;
  device: Device;
  ratio: number;
  look: string;
  touched: boolean;
}) {
  const app = useLiveApp();
  const screen = card.screen;
  const face = !screen ? (
    <span className="flex size-full items-center justify-center p-4 text-center text-meta text-fg-faint">
      {card.title}
    </span>
  ) : screen.kind === 'planned' ? (
    <HtmlFrame
      html={screenPage(screen.src)}
      title=""
      pageWidth={screenWidthFor(screen.device ?? device)}
      ratio={ratio}
      theme={look}
      inert
    />
  ) : (
    <img src={screen.src} alt="" draggable={false} className="size-full object-contain object-top" />
  );
  return (
    <>
      <span
        className={clsx('block size-full transition-[filter] duration-(--motion-panel)', touched && 'blur-[1.5px]')}
      >
        {app && card.path && card.kind === 'screen' ? (
          <LiveScreen
            cardId={card.id}
            path={card.path}
            device={device}
            ratio={ratio}
            title={card.title}
            fallback={face}
          />
        ) : (
          face
        )}
      </span>
      {touched && (
        <span aria-hidden className="motion-content absolute inset-0 bg-brand-blue/15">
          <FallingSnow />
        </span>
      )}
    </>
  );
}

/** A step with nothing to see (data kept, a message sent, work on a timer): a low card where its screen would be. */
function NoScreen({ card, outlined, onOpen }: { card: TreeCard; outlined: boolean; onOpen: () => void }) {
  const t = useMessages(messages);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={t.open(card.title)}
      onClick={onOpen}
      className={clsx(
        'flex min-h-22 w-full cursor-pointer flex-col justify-center gap-0.5 rounded-2xl border border-dashed bg-canvas-raised/60 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
        outlined ? 'border-interactive ring-3 ring-interactive/20' : 'border-line hover:border-interactive',
      )}
    >
      <span className="text-meta text-fg-faint">{t.noScreen}</span>
      <span className="line-clamp-2 text-body text-fg">{card.title}</span>
    </button>
  );
}

/** A step that goes through another journey: its name, and pressing it goes there. */
function LinkTile({ step, strip }: { step: FilmStep; strip: Strip }) {
  const t = useMessages(messages);
  return (
    <button
      type="button"
      onClick={() => strip.seekJourney(step.id.slice('flow:'.length))}
      className="flex min-h-22 w-full cursor-pointer flex-col justify-center gap-0.5 rounded-2xl border border-dashed border-interactive/50 px-4 py-3 text-left transition-colors hover:border-interactive"
    >
      <span className="text-meta text-interactive">{t.throughJourney}</span>
      <span className="line-clamp-2 text-body text-fg">{stepTitle(strip.map, step.id)}</span>
    </button>
  );
}

/** Under a screen (or beside it, for a computer): its name and state, its promises, where it leads back, a pick. */
function Caption({
  card,
  step,
  strip,
  wide,
  onSituation,
}: {
  card: TreeCard;
  step: FilmStep;
  strip: Strip;
  wide?: boolean;
  /** Opens the card on one of its situations. */
  onSituation?: (state: string) => void;
}) {
  const t = useMessages(messages);
  const layout = useLayout(card.id);
  const missing = missingButtons(strip.map, card.id, layout);
  const pick = strip.planned ? card.picks?.findLast((one) => one.by === 'ai') : undefined;
  const shown = card.promises.slice(0, PROMISE_ROWS);
  const name = (
    <span className={clsx('min-w-0 truncate font-medium', wide ? 'text-title' : 'text-body')}>{card.title}</span>
  );
  return (
    <div
      data-caption
      className={clsx(
        wide ? 'max-w-150 min-w-60 flex-1 basis-70 pt-1' : 'px-1 pt-3',
        strip.making === card.id && !wide && 'pt-7',
      )}
    >
      {wide ? (
        <>
          <p className="flex">{name}</p>
          <State card={card} strip={strip} className="mt-1" />
        </>
      ) : (
        <p className="flex items-center justify-between gap-2">
          {name}
          <State card={card} strip={strip} />
        </p>
      )}
      {card.promises.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {shown.map((promise, index) => (
            <PromiseLine
              key={promise.id}
              promise={promise}
              now={strip.making === card.id && index === card.promises.findIndex((one) => one.status !== 'passed')}
              wide={wide}
            />
          ))}
          {card.promises.length > shown.length && (
            <li className="pl-4.5 text-meta text-fg-faint">+{card.promises.length - shown.length}</li>
          )}
        </ul>
      )}
      {(card.states?.length ?? 0) > 0 && (
        <div role="group" aria-label={t.situationCount(card.states!.length)} className="mt-2 flex flex-wrap gap-1">
          {card.states!.map((situation) => (
            <SituationChip
              key={situation.id}
              cardId={card.id}
              situation={situation}
              onClick={() => onSituation?.(situation.id)}
            />
          ))}
        </div>
      )}
      {missing.map((to) => (
        <p key={to} className="mt-1.5 truncate text-meta text-attention">
          {t.missingButton(stepTitle(strip.map, to))}
        </p>
      ))}
      {step.loops.map((loop) => (
        <p key={loop.to} className="mt-1.5 truncate text-meta text-fg-muted" title={loop.label || undefined}>
          {t.backTo(stepTitle(strip.map, loop.to))}
        </p>
      ))}
      {pick && (
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1 text-meta text-fg-muted">
          <span className="min-w-0">
            {t.aiPicked} · {pick.answer}
          </span>
          {strip.onChangePick && (
            <>
              <span aria-hidden>·</span>
              <LinkButton className="min-h-5 px-0.5" onClick={() => strip.onChangePick!(card.id)}>
                {t.change}
              </LinkButton>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** A screen's state as a dot and a word: what to fix, being built, real, or a drawing. */
function State({ card, strip, className }: { card: TreeCard; strip: Strip; className?: string }) {
  const t = useMessages(messages);
  const failed = tally(card.promises).failed;
  const real = card.screen?.kind === 'shot' || (strip.planned && card.phase === 'built');
  const [dot, word, tone] = failed
    ? ['bg-danger', t.toFix(failed), 'text-danger']
    : card.id === strip.making
      ? ['bg-attention animate-pulse motion-reduce:animate-none', t.stateMaking, 'text-fg-muted']
      : real
        ? ['bg-interactive', t.stateReal, 'text-fg-muted']
        : card.screen
          ? ['bg-fg-faint/50', t.stateSketch, 'text-fg-muted']
          : [null, null, null];
  if (!word) return null;
  return (
    <span className={clsx('flex shrink-0 items-center gap-1.5 text-meta whitespace-nowrap', tone, className)}>
      <span aria-hidden className={clsx('size-1.75 shrink-0 rounded-full', dot)} />
      {word}
    </span>
  );
}

function PromiseLine({ promise, now, wide }: { promise: TreePromise; now: boolean; wide?: boolean }) {
  const t = useMessages(messages);
  const checking = now || promise.status === 'checking';
  const [mark, tone] =
    promise.status === 'passed'
      ? ['✓', 'text-interactive']
      : promise.status === 'failed'
        ? ['✗', 'text-danger']
        : promise.status === 'recheck'
          ? ['↻', 'text-attention']
          : ['·', 'text-fg-faint'];
  return (
    <li
      className={clsx(
        'flex gap-1.5',
        wide ? 'text-body' : 'text-meta leading-4.5',
        promise.status === 'failed' || checking ? 'text-fg' : 'text-fg-muted',
      )}
    >
      <span aria-hidden className={clsx('w-3 shrink-0 text-center', tone)}>
        {checking ? (
          <span className="inline-block size-2.25 animate-spin rounded-full border border-dashed border-attention align-[-1px] [animation-duration:2.4s] motion-reduce:animate-none" />
        ) : (
          mark
        )}
      </span>
      <span className="min-w-0">
        {promise.when ? `${promise.when} → ${promise.then}` : promise.then}
        {checking && <span className="text-attention"> · {t.checking}</span>}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------- the build's stage

/** The night sky the screen being built rises over, with pixel snow falling and a snowy hill at its foot. */
function NightSky({ wide }: { wide?: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'pointer-events-none absolute -inset-x-7 -top-5 overflow-hidden bg-brand-blue',
        wide ? 'h-110' : 'h-109.5',
      )}
      style={{ borderRadius: PHONE_RADIUS - 4, boxShadow: SKY_SHADOW }}
    >
      <span className="absolute inset-0 bg-linear-to-b from-brand-ink/45 via-transparent via-60% to-brand-snow/10" />
      <FallingSnow seed={11} />
      <svg className="absolute inset-x-0 bottom-0 h-10 w-full" viewBox="0 0 256 40" preserveAspectRatio="none">
        {HILL}
      </svg>
    </span>
  );
}

const HILL = Array.from({ length: 43 }, (_, i) => {
  const x = i * 6;
  const h = Math.max(6, Math.round((16 + 8 * Math.sin(x / 34) + 5 * Math.sin(x / 11)) / 6) * 6);
  return <rect key={x} x={x} y={40 - h} width="6" height={h} fill="#fdfeff" />;
});

/** Snow lying on top of the frame being built. */
function SnowCap() {
  return (
    <svg
      aria-hidden
      className="absolute -top-1.75 left-2.5 z-3 h-2.5 w-[calc(100%-20px)]"
      viewBox="0 0 180 10"
      preserveAspectRatio="none"
    >
      {CAP}
    </svg>
  );
}

const CAP = Array.from({ length: 45 }, (_, i) => {
  const x = i * 4;
  const h = 4 + ((x * 7) % 9 > 5 ? 4 : 0) + ((x * 13) % 11 > 8 ? 2 : 0);
  return <rect key={x} x={x} y={10 - h} width="4" height={h} fill="#fdfeff" />;
});

function MakingTag() {
  const t = useMessages(messages);
  return (
    <span className="absolute -top-3.5 left-1/2 z-4 flex -translate-x-1/2 items-center gap-1.25 rounded-full bg-brand-snow px-2 text-meta whitespace-nowrap text-fg shadow-overlay">
      <span aria-hidden className="size-1.75 animate-pulse rounded-full bg-attention motion-reduce:animate-none" />
      {t.stateMaking}
    </span>
  );
}

function JustReal(): ReactNode {
  const t = useMessages(messages);
  return (
    <span className="absolute -top-2.75 left-1/2 z-4 -translate-x-1/2 rounded-full bg-interactive px-2.25 text-meta whitespace-nowrap text-on-fill">
      {t.justReal}
    </span>
  );
}

function DeviceIcon({ device }: { device: Device }) {
  return device === 'phone' ? (
    <svg aria-hidden width="9" height="12" viewBox="0 0 9 12" fill="none">
      <rect x=".6" y=".6" width="7.8" height="10.8" rx="1.6" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ) : (
    <svg aria-hidden width="13" height="11" viewBox="0 0 13 11" fill="none">
      <rect x=".6" y=".6" width="11.8" height="7.8" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
      <path d="M4 10.4h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** How many of a journey's situations Alpine saw show as real screens, once it has looked at any. */
function SituationsShown({ journey, strip }: { journey: Journey; strip: Strip }) {
  const t = useMessages(messages);
  const layouts = useLiveLayouts((store) => store.byKey);
  const situations = journey.steps.flatMap((id) =>
    (strip.map.cards[id]?.states ?? [])
      .filter((situation) => situation.handled !== false)
      .map((situation) => situationResult(layouts, id, situation.id)),
  );
  const seen = situations.filter((result) => result !== 'unseen');
  if (!seen.length) return null;
  const shown = seen.filter((result) => result === 'shows').length;
  return (
    <span className={clsx('text-meta', shown < situations.length ? 'text-attention' : 'text-fg-muted')}>
      · {t.situationsShown(shown, situations.length)}
    </span>
  );
}

/** The frames behind a screen that has situations besides its usual day: one card, several screens. */
function Deck() {
  return (
    <>
      {[10, 5].map((offset) => (
        <span
          key={offset}
          aria-hidden
          className="absolute top-0 left-0 h-100 w-50 border border-line bg-canvas-raised"
          style={{
            borderRadius: PHONE_RADIUS,
            transform: `translate(${offset}px, ${offset}px)`,
            opacity: 0.55 + offset / 40,
          }}
        />
      ))}
    </>
  );
}

const ZOOMS = [0.4, 0.55, 0.7, 0.85, 1, 1.15];

/** How large the wall is drawn: ⌘ or Ctrl with the wheel or a pinch zooms it, like a design canvas. */
function useWallZoom(wall: React.RefObject<HTMLDivElement | null>) {
  const [level, setLevel] = useState(1);
  useEffect(() => {
    const element = wall.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setLevel((current) =>
        Math.min(1.15, Math.max(0.4, Math.round(current * Math.exp(-event.deltaY * 0.01) * 100) / 100)),
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [wall]);
  const step = (direction: 1 | -1) =>
    setLevel((current) =>
      direction > 0
        ? (ZOOMS.find((one) => one > current + 0.001) ?? current)
        : (ZOOMS.findLast((one) => one < current - 0.001) ?? current),
    );
  return { level, step, reset: () => setLevel(1) };
}

function ZoomControls({ zoom }: { zoom: ReturnType<typeof useWallZoom> }) {
  const t = useMessages(messages);
  const percent = Math.round(zoom.level * 100);
  return (
    <div className="absolute bottom-4 left-4 z-30 flex items-center rounded-lg border border-line bg-canvas-raised text-meta text-fg-muted shadow-overlay">
      <button
        type="button"
        aria-label={t.zoomOut}
        title={t.zoomOut}
        onClick={() => zoom.step(-1)}
        className="size-8 cursor-pointer rounded-l-lg hover:bg-hover hover:text-fg"
      >
        −
      </button>
      <button
        type="button"
        title={t.zoomFit(percent)}
        onClick={zoom.reset}
        className="h-8 min-w-12 cursor-pointer px-1 hover:bg-hover hover:text-fg"
      >
        {percent}%
      </button>
      <button
        type="button"
        aria-label={t.zoomIn}
        title={t.zoomIn}
        onClick={() => zoom.step(1)}
        className="size-8 cursor-pointer rounded-r-lg hover:bg-hover hover:text-fg"
      >
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- facts the strip learns as it shows them

/** Whether each picture (capture or sketch) is wider than tall, once it has loaded; unknown until then. */
function useWideScreens(map: TreeMap) {
  const [shapes, setShapes] = useState<Record<string, boolean>>({});
  const sources = useMemo(
    () =>
      [
        ...new Set(
          map.people
            .flatMap((person) => person.journeys)
            .filter((journey) => !journey.device)
            .flatMap((journey) => journey.steps)
            .map((id) => map.cards[id]?.screen)
            .filter((screen) => !!screen && screen.kind !== 'planned')
            .map((screen) => screen!.src),
        ),
      ].join('\n'),
    [map],
  );
  useEffect(() => {
    let live = true;
    for (const src of sources.split('\n').filter(Boolean)) {
      const image = new Image();
      image.onload = () =>
        live &&
        image.naturalWidth > 0 &&
        setShapes((current) =>
          src in current ? current : { ...current, [src]: image.naturalWidth > image.naturalHeight },
        );
      image.src = src;
    }
    return () => {
      live = false;
    };
  }, [sources]);
  return (src: string): boolean | undefined => shapes[src];
}

/** Cards that turned built while the strip was on screen, for a few seconds ("방금 실제 화면으로"). */
function useJustBuilt(map: TreeMap) {
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [phases, setPhases] = useState(() => phasesOf(map));
  const now = phasesOf(map);
  const key = [...now].map(([id, phase]) => `${id}:${phase}`).join(' ');
  const [seenKey, setSeenKey] = useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    setPhases(now);
    const turned = [...now].filter(([id, phase]) => phase === 'built' && phases.has(id) && phases.get(id) !== 'built');
    if (turned.length) setFresh((current) => new Set([...current, ...turned.map(([id]) => id)]));
  }
  const freshKey = [...fresh].join(' ');
  useEffect(() => {
    if (!freshKey) return;
    const timer = setTimeout(() => setFresh(new Set()), 8000);
    return () => clearTimeout(timer);
  }, [freshKey]);
  return fresh;
}

const phasesOf = (map: TreeMap) =>
  new Map(Object.values(map.cards).map((card) => [card.id, card.phase ?? null] as const));
