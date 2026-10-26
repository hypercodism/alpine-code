import { LinkButton } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { Play, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useMessages } from '@/shared/i18n';

import { filmMessages as messages } from './filmMessages';
import { flowTreeMessages } from './flowTreeMessages';
import { FlowPlayer } from './FlowPlayer';
import { ScreenFace } from './screenFace';
import { BOARD, layoutBoard, route, type BoardEdge, type BoardLayout, type BoardNode, type Point } from './boardLayout';
import { deviceOf, devicesOf, journeyCounts, personCounts } from './filmstripModel';
import { CardDialog, type FlowTreeProps, type Focus } from './FlowTree';
import {
  missingButtons,
  plannedLinks,
  SituationCheck,
  SituationChip,
  situationResult,
  useLayout,
  useLiveLayouts,
  WallZoom,
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
} from './flowTreeModel';
import { screenWidthFor, WIREFRAME, type Device } from './planLook';
import { Avatar, RemovedNotice, useText, type PromiseTarget } from './treeParts';

export interface FilmstripProps extends FlowTreeProps {
  /** While planning: the product decisions still open, listed beside the board. */
  undecided?: string[];
  /** A product that began as a plan: what the AI decided shows under its screens, and a built card is real. */
  planned?: boolean;
  /** The card being built now: it rises over a night sky with snow falling, and its row comes into view. */
  making?: string | null;
  /** Opens what the AI decided on a card, to answer it again. */
  onChangePick?: (cardId: string) => void;
}

/** The frames are pictures of a phone and a browser window, drawn to their own measure rather than the app's. */
const PHONE_RADIUS = 26;
const PHONE_SHADOW = '0 1px 0 rgb(27 45 64 / .04), 0 10px 24px -14px rgb(27 45 64 / .25)';
const BROWSER_SHADOW = '0 1px 0 rgb(27 45 64 / .04), 0 14px 30px -18px rgb(27 45 64 / .3)';
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
  /** Plays a journey: its real screens one after another (흐름 재생). */
  play: (journeyId: string) => void;
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
  const { map } = props;
  const [focus, setFocus] = useState<Focus | null>(null);
  const [notice, setNotice] = useState(0);
  // The journey being played (흐름 재생), over the board.
  const [playing, setPlaying] = useState<string | null>(null);
  // What to bring into view next: a screen, or a whole journey (a step that goes through it).
  const [target, setTarget] = useState<{ cardId?: string; journeyId?: string; at: number } | null>(null);
  const wall = useRef<HTMLDivElement>(null);
  const zoom = useWallZoom(wall);
  const wide = useWideScreens(map);
  const device = useCallback((journey: Journey) => deviceOf(journey, map, wide), [map, wide]);
  const fresh = useJustBuilt(map);

  const where = (cardId: string) => {
    for (const person of map.people)
      for (const journey of person.journeys) if (journey.steps.includes(cardId)) return { person, journey };
    return null;
  };
  const open = (personId: string, journeyId: string, cardId: string, state?: string | null) =>
    setFocus({ kind: 'step', personId, journeyId, cardId, state: state ?? null });
  const seek = (cardId: string) => setTarget((current) => ({ cardId, at: (current?.at ?? 0) + 1 }));
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
    play: setPlaying,
    onChangePick: props.onChangePick,
  };

  return (
    <div className="relative flex min-h-0 min-w-0 grow">
      <div
        ref={wall}
        role="region"
        aria-label={t.label}
        style={DOTTED}
        // A board on dotted paper; the flows panel floats over its top left corner, so the board starts past it.
        className="min-h-0 min-w-0 grow overflow-auto bg-canvas-sunken pt-3 pb-20 pl-62 text-body text-fg"
      >
        <WallZoom.Provider value={zoom.level}>
          <div style={zoom.level === 1 ? undefined : { zoom: zoom.level }}>
            <BoardCanvas strip={strip} device={device} />
          </div>
        </WallZoom.Provider>
      </div>
      <FlowsPanel strip={strip} undecided={props.undecided ?? []} />
      {playing && (
        <FlowPlayer
          map={map}
          journeyId={playing}
          device={device}
          look={props.look}
          onClose={() => setPlaying(null)}
          onOpenCard={(personId, journeyId, cardId) => {
            setPlaying(null);
            open(personId, journeyId, cardId);
          }}
        />
      )}
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

// ---------------------------------------------------------------- the board

/** Where the board draws a node's frame inside its box, and the frame's own inner box (the screen). */
const FRAME_PAD = 6;

/**
 * The map as one board (10-27): a lane per person, the band of what has no screen between the first lane and the
 * rest, each screen once with its number, and an arrow for every way between them, out of the button that leads on
 * when the real screen shows it. Pressing a screen opens its card, as before.
 */
function BoardCanvas({ strip, device }: { strip: Strip; device: (journey: Journey) => Device }) {
  const t = useMessages(messages);
  const text = useText();
  const tree = useMessages(flowTreeMessages);
  const { map } = strip;
  const board = useMemo(
    () => layoutBoard(map, device, (id) => strip.planned && !!map.cards[id]?.picks?.some((one) => one.by === 'ai')),
    [map, device, strip.planned],
  );
  // The ways not drawn as arrows, by the card they leave: said under it.
  const back = new Map<string, BoardEdge[]>();
  for (const edge of board.edges)
    if (edge.from !== edge.to && !forward(board, edge)) back.set(edge.from, [...(back.get(edge.from) ?? []), edge]);
  return (
    <div className="relative" style={{ width: board.width, height: board.height }}>
      {/* Under everything: the lanes' paper; over it the arrows; over them the cards, so no arrow crosses a screen. */}
      {board.lanes.map((lane) => (
        <div
          key={lane.person.id}
          aria-hidden
          className="absolute rounded-2xl border border-line bg-canvas-raised/70 shadow-card"
          style={{ left: BOARD.pad, top: lane.y, width: board.width - BOARD.pad * 2, height: lane.height }}
        />
      ))}
      <svg
        aria-hidden={false}
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={board.width}
        height={board.height}
      >
        <defs>
          {(['quiet', 'checked', 'missing'] as const).map((tone) => (
            <marker
              key={tone}
              id={`board-arrow-${tone}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
              className={edgeTone[tone]}
            >
              <path d="M1,1 L9,5 L1,9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </marker>
          ))}
        </defs>
        {board.edges
          .filter((edge) => forward(board, edge))
          .map((edge) => (
            <BoardArrow key={`${edge.from}>${edge.to}`} edge={edge} board={board} strip={strip} />
          ))}
      </svg>
      {board.lanes.map((lane) => (
        <section
          key={lane.person.id}
          aria-label={text(lane.person.name)}
          data-person={lane.person.id}
          className="absolute"
          style={{
            left: BOARD.pad + 1,
            top: lane.y + 1,
            width: board.width - BOARD.pad * 2 - 2,
            height: lane.height - 2,
          }}
        >
          <LaneHeader person={lane.person} strip={strip} device={device} />
          {lane.rows.map((row) => {
            // The row holds its journey's title, its screens and its strip; its cards are placed from its corner.
            const origin = { x: BOARD.pad + 1, y: row.y - ROW_HEAD };
            return (
              <section
                key={row.journey.id}
                aria-label={text(row.journey.title)}
                data-journey={row.journey.id}
                className="absolute inset-x-0"
                style={{ top: origin.y - lane.y - 1, height: row.height + ROW_HEAD }}
              >
                <div className="absolute" style={{ left: BOARD.lanePad, top: 0 }}>
                  <JourneyTitle person={lane.person} journey={row.journey} strip={strip} />
                </div>
                {row.band && (
                  <div
                    role="group"
                    aria-label={t.noScreenLane}
                    className="absolute rounded-xl border border-dashed border-line bg-canvas-sunken/50"
                    style={{
                      left: BOARD.lanePad - 10,
                      right: BOARD.lanePad - 10,
                      top: row.band.y - origin.y,
                      height: row.band.height,
                    }}
                  >
                    <p className="px-3 pt-1.5 text-meta text-fg-muted">{t.noScreenLane}</p>
                  </div>
                )}
                {Object.values(board.nodes)
                  .filter((node) => node.journeyId === row.journey.id && node.personId === lane.person.id)
                  .map((node) => (
                    <BoardCard key={node.id} node={node} origin={origin} strip={strip} back={back.get(node.id) ?? []} />
                  ))}
              </section>
            );
          })}
        </section>
      ))}
      <div className="absolute" style={{ left: BOARD.pad, top: board.height - BOARD.pad + 8 }}>
        <AddButton onClick={() => strip.show({ kind: 'addPerson' })}>{tree.addPerson}</AddButton>
      </div>
    </div>
  );
}

/**
 * Whether a way is drawn as an arrow: into a card to its right, or down into a later row (the next person, the strip
 * of what has no screen). A way back, up or to the left (a menu's link to the first screen), is said under its card
 * instead, so the arrows follow the walk and do not cross it.
 */
function forward(board: BoardLayout, edge: BoardEdge) {
  const from = board.nodes[edge.from];
  const to = board.nodes[edge.to];
  if (!from || !to || from === to) return false;
  if (to.rowY > from.rowY) return true;
  return to.rowY === from.rowY && to.x > from.x;
}

/** The board's paper: a dot every 22 px. */
const DOTTED = {
  backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

/** An arrow's words fit the gap between two cards. */
const LABEL = BOARD.columnGap - 8;

/** Room over a row for its journey's title and situations. */
const ROW_HEAD = 30;

const edgeTone = { quiet: 'text-fg-faint', checked: 'text-interactive', missing: 'text-attention' } as const;

/** A lane's head: the person, the devices they use, how much is theirs, and a way to add a journey. */
function LaneHeader({ person, strip, device }: { person: Person; strip: Strip; device: (journey: Journey) => Device }) {
  const t = useMessages(messages);
  const text = useText();
  const tree = useMessages(flowTreeMessages);
  const loose = person.id === UNPLACED;
  const devices = loose ? [] : devicesOf(person.journeys.map(device));
  const counts = personCounts(strip.map, person);
  return (
    <header className="flex h-9 items-center gap-2 px-4 pt-2 text-body text-fg">
      <button
        type="button"
        onClick={() => strip.show({ kind: 'person', personId: person.id })}
        className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors hover:bg-hover"
      >
        {!loose && <Avatar person={person} small />}
        <span className="truncate">{text(person.name)}</span>
      </button>
      {devices.map((one) => (
        <span key={one} className="flex shrink-0 items-center gap-1 text-meta text-fg-faint">
          <DeviceIcon device={one} />
          {t[one]}
        </span>
      ))}
      {!loose && (
        <>
          <span className="ml-auto shrink-0 text-meta text-fg-faint">
            {t.personCounts(counts.journeys, counts.screens)}
          </span>
          <LinkButton
            className="min-h-6 gap-1 px-1 text-meta"
            onClick={() => strip.show({ kind: 'addJourney', personId: person.id })}
          >
            <Plus size={12} aria-hidden />
            {tree.addJourney}
          </LinkButton>
        </>
      )}
    </header>
  );
}

/** A journey's name over its row: what it is for, how many screens and promises, and how its situations stand. */
function JourneyTitle({ person, journey, strip }: { person: Person; journey: Journey; strip: Strip }) {
  const t = useMessages(messages);
  const text = useText();
  const counts = journeyCounts(strip.map, journey);
  return (
    <h3 className="flex flex-wrap items-baseline gap-x-2.5 whitespace-nowrap">
      <button
        type="button"
        onClick={() => strip.show({ kind: 'journey', personId: person.id, journeyId: journey.id })}
        className="-ml-1.5 cursor-pointer rounded-md px-1.5 text-left text-title font-semibold transition-colors hover:bg-hover"
      >
        {text(journey.title)}
      </button>
      <button
        type="button"
        aria-label={t.playJourney(text(journey.title))}
        title={t.playFlow}
        onClick={() => strip.play(journey.id)}
        className="flex h-6 cursor-pointer items-center gap-1 self-center rounded-full border border-line bg-canvas-raised px-2 text-meta text-fg-muted transition-colors hover:border-interactive hover:text-fg"
      >
        <Play size={10} aria-hidden className="fill-current" />
        {t.playFlow}
      </button>
      <span className="text-meta text-fg-muted">
        {strip.planning
          ? t.journeyPlanned(counts.screens, counts.promises)
          : t.journeyChecked(counts.screens, counts.promises, counts.checked)}
      </span>
      <SituationsShown journey={journey} strip={strip} />
      {(journey.situations?.length ?? 0) > 0 && (
        <span role="group" aria-label={t.journeySituations} className="flex flex-wrap items-center gap-1.5 self-center">
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
        </span>
      )}
    </h3>
  );
}

/**
 * One way between two cards: blue out of the real button that leads on (its words beside it), orange and dashed when
 * the plan has a way the real screen has no button for, quiet until the screen has been seen; dashed into a screen
 * that is only proposed. Its own words (a journey's edge label) ride in the middle.
 */
function BoardArrow({ edge, board, strip }: { edge: BoardEdge; board: BoardLayout; strip: Strip }) {
  const t = useMessages(messages);
  const layout = useLayout(edge.from);
  const from = board.nodes[edge.from];
  const to = board.nodes[edge.to];
  if (!from || !to) return null;
  const checkable =
    from.kind !== 'system' && !!layout?.screen && !!plannedLinks(strip.map).get(edge.from)?.has(edge.to);
  const button = checkable ? layout!.targets.find((target) => target.to === edge.to) : undefined;
  const tone: keyof typeof edgeTone = !checkable ? 'quiet' : button ? 'checked' : 'missing';
  let start: Point | undefined;
  if (button && from.kind !== 'system') {
    const scale = (from.w - FRAME_PAD * 2) / screenWidthFor(from.kind === 'computer' ? 'computer' : 'phone');
    const y = from.y + FRAME_PAD + (button.y + button.h / 2) * scale;
    if (y > from.y && y < from.y + from.h) start = { x: from.x + FRAME_PAD + (button.x + button.w) * scale, y };
  }
  const row = board.lanes.flatMap((lane) => lane.rows).find((one) => one.y === from.rowY);
  const { path, middle } = route(from, to, start, row ? row.y + row.height : undefined);
  const words = edge.label;
  const label = tone === 'missing' ? t.missingButton(stepTitle(strip.map, edge.to)) : button?.label;
  const proposed = !!strip.map.cards[edge.to]?.tentative;
  return (
    <g role={label ? 'img' : undefined} aria-label={label} className={edgeTone[tone]}>
      {label && <title>{label}</title>}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={tone === 'quiet' ? 1.3 : 1.8}
        strokeDasharray={tone === 'missing' || proposed ? '5 4' : undefined}
        strokeLinejoin="round"
        markerEnd={`url(#board-arrow-${tone})`}
      />
      {words && (
        <foreignObject x={middle.x - LABEL / 2} y={middle.y - 11} width={LABEL} height={22}>
          <span
            title={words}
            className="mx-auto block w-fit max-w-full truncate rounded-full bg-canvas-sunken px-1.5 text-center text-meta leading-5.5 text-fg-muted"
          >
            {words}
          </span>
        </foreignObject>
      )}
    </g>
  );
}

/** A card on the board: its number and name over the frame, the frame, and under it how it stands. */
function BoardCard({
  node,
  origin,
  strip,
  back,
}: {
  node: BoardNode;
  origin: Point;
  strip: Strip;
  /** The ways back from it, said under it rather than drawn. */
  back: BoardEdge[];
}) {
  const t = useMessages(messages);
  const card = strip.map.cards[node.id];
  if (!card) return null;
  const look = standing(card, strip);
  const open = () => {
    if (node.personId && node.journeyId) strip.open(node.personId, node.journeyId, card.id);
    else {
      const found = strip.map.people
        .flatMap((person) => person.journeys.map((journey) => ({ person, journey })))
        .find(({ journey }) => journey.steps.includes(card.id));
      if (found) strip.open(found.person.id, found.journey.id, card.id);
    }
  };
  const box = { left: node.x - origin.x, top: node.y - origin.y, width: node.w, height: node.h };
  if (node.kind === 'system')
    return (
      <div data-card={card.id} className={clsx('absolute', look.dim && 'opacity-35')} style={box}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t.open(card.title)}
          onClick={open}
          className={clsx(
            'flex size-full cursor-pointer items-center gap-2 rounded-full border bg-canvas-raised px-4 text-left text-body text-fg shadow-card transition-colors',
            look.touched || look.asked || look.making
              ? 'border-interactive ring-3 ring-interactive/20'
              : 'border-line hover:border-interactive',
          )}
        >
          <span aria-hidden className="size-1.75 shrink-0 rounded-full bg-fg-faint" />
          <span className="flex min-w-0 flex-col">
            <span className="sr-only">{t.noScreen}</span>
            <span className="line-clamp-2">{card.title}</span>
          </span>
        </button>
      </div>
    );
  const phone = node.kind === 'phone';
  return (
    <div
      data-card={card.id}
      className={clsx('absolute transition-opacity', look.dim && 'opacity-35')}
      style={{ left: node.x - origin.x, top: node.rowY - origin.y, width: node.w }}
    >
      <p className="flex h-6 items-baseline gap-1.5 truncate text-meta text-fg-muted">
        {card.tentative ? (
          <span className="text-interactive">{t.proposedScreen}</span>
        ) : (
          node.number && <span className="tabular-nums text-fg-faint">{node.number}</span>
        )}
        <span className="truncate">{card.title}</span>
      </p>
      <div className="relative">
        {look.fresh && <JustReal />}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t.open(card.title)}
          onClick={open}
          className={clsx(
            'relative block cursor-pointer border bg-canvas-raised transition-[border-color,box-shadow,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive',
            look.making
              ? '-translate-y-1 border-interactive ring-4 ring-interactive/25'
              : look.touched || look.asked
                ? 'border-interactive ring-3 ring-interactive/20'
                : 'border-line hover:border-interactive',
            look.fresh && 'motion-arrive',
            card.tentative && 'border-dashed border-interactive/70 bg-selected/40',
            phone ? '' : 'rounded-xl',
          )}
          style={{
            width: node.w,
            height: node.h,
            padding: FRAME_PAD,
            borderRadius: phone ? PHONE_RADIUS - 4 : undefined,
            boxShadow: phone ? PHONE_SHADOW : BROWSER_SHADOW,
          }}
        >
          {look.making && <MakingTag />}
          <span
            className="relative block size-full overflow-clip bg-canvas-raised"
            style={{ borderRadius: phone ? PHONE_RADIUS - 10 : 8 }}
          >
            <ScreenFace
              card={card}
              device={phone ? 'phone' : 'computer'}
              ratio={(node.h - FRAME_PAD * 2) / (node.w - FRAME_PAD * 2)}
              look={strip.look}
              touched={look.touched}
            />
          </span>
        </button>
      </div>
      <BoardCaption
        card={card}
        strip={strip}
        back={back}
        onSituation={(state) => {
          if (node.personId && node.journeyId) strip.open(node.personId, node.journeyId, card.id, state);
        }}
      />
    </div>
  );
}

/** Under a screen on the board: how it stands, how many promises hold, its situations, a missing button, a note. */
function BoardCaption({
  card,
  strip,
  back,
  onSituation,
}: {
  card: TreeCard;
  strip: Strip;
  back: BoardEdge[];
  onSituation: (state: string) => void;
}) {
  const t = useMessages(messages);
  const tree = useMessages(flowTreeMessages);
  const layout = useLayout(card.id);
  const missing = missingButtons(strip.map, card.id, layout);
  const counts = tally(card.promises);
  const pick = strip.planned ? card.picks?.findLast((one) => one.by === 'ai') : undefined;
  return (
    <div data-caption className="flex flex-col gap-1 px-0.5 pt-2">
      <p className="flex items-center justify-between gap-2 text-meta">
        <State card={card} strip={strip} />
        {counts.total > 0 && (
          <span className="shrink-0 text-fg-faint tabular-nums">
            {strip.planning ? tree.promisesPlanned(counts.total) : tree.passedOf(counts.passed, counts.total)}
          </span>
        )}
      </p>
      {(card.states?.length ?? 0) > 0 && (
        <div
          role="group"
          aria-label={t.situationCount(card.states!.length)}
          className="flex max-h-13 flex-wrap gap-1 overflow-clip"
        >
          {card.states!.map((situation) => (
            <SituationChip
              key={situation.id}
              cardId={card.id}
              situation={situation}
              onClick={() => onSituation(situation.id)}
            />
          ))}
        </div>
      )}
      {back.length > 0 && (
        <p className="flex flex-wrap gap-x-2 text-meta text-fg-muted">
          {back.map((way) => (
            <button
              key={way.to}
              type="button"
              title={way.label || undefined}
              onClick={() => strip.seek(way.to)}
              className="max-w-full cursor-pointer truncate hover:text-fg"
            >
              {t.backTo(stepTitle(strip.map, way.to))}
            </button>
          ))}
        </p>
      )}
      {missing.map((to) => (
        <p key={to} className="truncate text-meta text-attention">
          {t.missingButton(stepTitle(strip.map, to))}
        </p>
      ))}
      {pick && (
        <div className="mt-1 -rotate-1 rounded-sm bg-note px-2.5 py-1.5 text-meta text-note-ink shadow-card">
          <p className="opacity-70">{t.aiPicked}</p>
          <p className="line-clamp-2">{pick.answer}</p>
          {strip.onChangePick && (
            <button
              type="button"
              onClick={() => strip.onChangePick!(card.id)}
              className="mt-0.5 cursor-pointer underline underline-offset-2"
            >
              {t.change}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Beside the board, the map in a list: each person's journeys with how many screens they hold, what has no screen,
 * and what is still to decide. Pressing a journey brings its lane into view.
 */
function FlowsPanel({ strip, undecided }: { strip: Strip; undecided: string[] }) {
  const t = useMessages(messages);
  const text = useText();
  const [open, setOpen] = useState(true);
  const { map } = strip;
  const screens = Object.values(map.cards).filter(hasScreenArea).length;
  const system = Object.values(map.cards).filter((card) => !hasScreenArea(card)).length;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute top-3 left-3 z-10 cursor-pointer rounded-lg border border-line bg-canvas-raised px-3 py-1.5 text-meta text-fg-muted shadow-overlay hover:text-fg"
      >
        {t.flows}
      </button>
    );
  return (
    <nav
      aria-label={t.flows}
      className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-24px)] w-56 flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-canvas-raised p-3 text-body shadow-overlay"
    >
      <p className="flex items-center justify-between text-meta text-fg-muted">
        <span>{t.flows}</span>
        <span className="flex items-center gap-2">
          {t.screenCount(screens)}
          <button
            type="button"
            aria-label={t.hidePanel}
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded-sm px-1 text-fg-faint hover:bg-hover hover:text-fg"
          >
            ‹
          </button>
        </span>
      </p>
      {map.people
        .filter((person) => person.id !== UNPLACED)
        .map((person) => (
          <div key={person.id} className="flex flex-col gap-0.5">
            <p className="text-meta text-fg-muted">{text(person.name)}</p>
            {person.journeys.map((journey) => (
              <span key={journey.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => strip.seekJourney(journey.id)}
                  className="flex min-w-0 grow cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-hover"
                >
                  <span className="min-w-0 truncate">{text(journey.title)}</span>
                  <span className="shrink-0 text-meta text-fg-faint tabular-nums">
                    {journey.steps.filter((id) => map.cards[id] && hasScreenArea(map.cards[id]!)).length}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t.playJourney(text(journey.title))}
                  onClick={() => strip.play(journey.id)}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-faint hover:bg-hover hover:text-interactive"
                >
                  <Play size={11} aria-hidden className="fill-current" />
                </button>
              </span>
            ))}
          </div>
        ))}
      {system > 0 && (
        <p className="flex justify-between px-2 text-meta text-fg-muted">
          <span>{t.noScreenLane}</span>
          <span className="tabular-nums">{system}</span>
        </p>
      )}
      {undecided.length > 0 && (
        <section className="flex flex-col gap-1 border-t border-line-subtle pt-2">
          <p className="flex justify-between text-meta text-fg-muted">
            <span>{t.toDecide}</span>
            <span className="text-attention tabular-nums">{undecided.length}</span>
          </p>
          {undecided.map((item) => (
            <p key={item} className="flex gap-2 px-1 text-meta text-fg">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-sm bg-attention" />
              <span className="min-w-0">{item}</span>
            </p>
          ))}
        </section>
      )}
    </nav>
  );
}

/** A quiet way to add a person, under the board. */
function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-line px-3 text-meta text-fg-muted transition-colors hover:border-interactive hover:text-fg"
    >
      <Plus size={12} aria-hidden />
      {children}
    </button>
  );
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

// ---------------------------------------------------------------- the build's stage

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

const ZOOMS = [0.4, 0.55, 0.7, 0.85, 1, 1.15];

/** How large the wall is drawn: ⌘ or Ctrl with the wheel or a pinch zooms it, like a design canvas. */
/** How large the board starts: a little under its size, so a journey's screens fit beside the conversation. */
const START_ZOOM = 0.85;

function useWallZoom(wall: React.RefObject<HTMLDivElement | null>) {
  const [level, setLevel] = useState(START_ZOOM);
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
