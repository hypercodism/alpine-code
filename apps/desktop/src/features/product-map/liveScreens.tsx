import clsx from 'clsx';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';

import { useMessages } from '@/shared/i18n';
import { useServer } from '@/shared/server';
import { useDevelopmentServerActions, useDevelopmentServers } from '@/shared/server/devServers';

import { filmMessages as messages } from './filmMessages';
import {
  hasScreenArea,
  isJourneyLink,
  type ScreenSituation,
  type TreeCard,
  type TreeMap,
  type TreePromise,
} from './flowTreeModel';

/**
 * The map's screens are the running app's own (planned screens are real code on made-up data): each frame opens the
 * card's address through Alpine's relay (`DevServerInfo.boardUrl`), which adds a bridge script to every page. The
 * bridge tells the map where the screen's buttons to other screens (`data-alpine-to`) and its promises
 * (`data-alpine-promise`) are, so arrows are checked against real buttons and promises are pinned to real elements.
 * A situation (`TreeCard.states`) is the same address with `?alpine-state=<id>`.
 */

export interface LiveTarget {
  to: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LiveLayout {
  screen: string | null;
  targets: LiveTarget[];
  promises: { id: string; x: number; y: number; w: number; h: number }[];
  /** What the screen says, shortened to a number: two screens with the same one show the same words. */
  fingerprint?: string;
  href: string;
  at: number;
}

/** The relay's address of the project's running app, or `null` while it is not running. */
const LiveApp = createContext<string | null>(null);
export const LiveAppProvider = LiveApp.Provider;
export const useLiveApp = () => useContext(LiveApp);

/**
 * The project's app through the relay, while the map has screens to show (a card with an address): asked for once per
 * project (`devServers/open` uses the server the project already has, the one the AI started included, or starts one the
 * way the project runs), then followed.
 */
export function useBoardApp(cwd: string, wanted: boolean): string | null {
  const server = useServer();
  // A phone app (Expo) runs on a phone, not in a frame: its screens stay pictures and nothing is started for them.
  const mobile = useQuery({
    queryKey: ['board-mobile', cwd],
    queryFn: async () => {
      try {
        const file = await server.request('files/read', { cwd, path: 'package.json' });
        return /"expo"\s*:/.test(file.content);
      } catch {
        return false;
      }
    },
    enabled: wanted && !!cwd,
    staleTime: Infinity,
  });
  const shown = wanted && mobile.data === false;
  const servers = useDevelopmentServers(cwd, shown);
  const actions = useDevelopmentServerActions();
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!shown || !cwd || asked.current === cwd) return;
    asked.current = cwd;
    actions.open.mutate({ cwd });
    // Asked once per project; the mutation object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, shown]);
  if (!shown) return null;
  const running = servers.data?.servers.findLast((server) => server.status === 'running' && server.boardUrl);
  return running?.boardUrl ?? null;
}

/** What every live frame last reported, by card and situation. */
export const useLiveLayouts = create<{
  byKey: Record<string, LiveLayout>;
  report: (key: string, layout: LiveLayout) => void;
}>((set) => ({
  byKey: {},
  report: (key, layout) => set((current) => ({ byKey: { ...current.byKey, [key]: layout } })),
}));

export const layoutKey = (cardId: string, state?: string | null) => `${cardId}|${state ?? ''}`;
export const useLayout = (cardId: string, state?: string | null) =>
  useLiveLayouts((store) => store.byKey[layoutKey(cardId, state)]);

/** A screen's address on the running app: its path, and the situation when there is one. */
export function screenAddress(base: string, path: string, state?: string | null): string {
  const url = new URL(path, base);
  if (state) url.searchParams.set('alpine-state', state);
  return url.toString();
}

/**
 * The links the map plans between screens: a journey's edges when it has them, else each step to the next. Only links
 * from a screen to a screen, since only a screen has buttons.
 */
export function plannedLinks(map: TreeMap): Map<string, Set<string>> {
  const links = new Map<string, Set<string>>();
  const isScreen = (id: string) => {
    const card = map.cards[id];
    return !!card && !isJourneyLink(id) && card.kind === 'screen' && hasScreenArea(card);
  };
  const add = (from: string, to: string) => {
    if (from === to || !isScreen(from) || !isScreen(to)) return;
    if (!links.has(from)) links.set(from, new Set());
    links.get(from)!.add(to);
  };
  for (const person of map.people)
    for (const journey of person.journeys) {
      if (journey.edges?.length) for (const edge of journey.edges) add(edge.from, edge.to);
      else for (let i = 1; i < journey.steps.length; i++) add(journey.steps[i - 1]!, journey.steps[i]!);
    }
  return links;
}

/**
 * The planned links from a screen that its real screen has no button for: only once the screen has drawn itself with its
 * marks (`data-alpine-screen`), so a page still loading, or an app written without the marks, is never accused.
 */
export function missingButtons(map: TreeMap, cardId: string, layout: LiveLayout | undefined): string[] {
  if (!layout?.screen) return [];
  return [...(plannedLinks(map).get(cardId) ?? [])].filter((to) => !layout.targets.some((target) => target.to === to));
}

const pageWidthFor = (device: 'phone' | 'computer') => (device === 'computer' ? 1280 : 390);

/** The device of the first journey a card is in; a phone when none says. */
export function deviceOfCard(map: TreeMap, cardId: string): 'phone' | 'computer' {
  for (const person of map.people)
    for (const journey of person.journeys) if (journey.steps.includes(cardId)) return journey.device ?? 'phone';
  return 'phone';
}

/**
 * Whether a situation shows as a screen of its own, from what the frames reported: `shows` (the screen, with words of
 * its own), `same` (the usual day's words: the situation is not made yet), `elsewhere` (another screen came up), or
 * `unseen` (not opened yet, or an app without the marks, which cannot be told).
 */
export type SituationResult = 'shows' | 'same' | 'elsewhere' | 'unseen';

export function situationResult(layouts: Record<string, LiveLayout>, cardId: string, state: string): SituationResult {
  const usual = layouts[layoutKey(cardId)];
  const shown = layouts[layoutKey(cardId, state)];
  if (!usual?.screen || !shown?.screen) return 'unseen';
  if (shown.screen !== usual.screen) return 'elsewhere';
  return shown.fingerprint && shown.fingerprint === usual.fingerprint ? 'same' : 'shows';
}

export const useSituationResult = (cardId: string, state: string) =>
  useLiveLayouts((store) => situationResult(store.byKey, cardId, state));

/** How long one situation may take to draw itself before the check goes on to the next. */
const CHECK_WAIT = 8000;

/**
 * Alpine's own check that every situation really shows: out of sight, one at a time, it opens each situation of each
 * screen (and the usual day it is compared with) that no frame on the map has opened yet. What the bridge reports goes
 * where the frames' reports go, so the map's chips and a card's details say which situations show and which do not.
 */
export function SituationCheck({ map }: { map: TreeMap }) {
  const app = useLiveApp();
  const byKey = useLiveLayouts((store) => store.byKey);
  const report = useLiveLayouts((store) => store.report);
  const [gaveUp, setGaveUp] = useState<ReadonlySet<string>>(() => new Set());
  const frame = useRef<HTMLIFrameElement>(null);
  const wanted = app
    ? Object.values(map.cards)
        .filter((card) => card.kind === 'screen' && !!card.path)
        .flatMap((card) => {
          const shown = (card.states ?? []).filter((situation) => situation.handled !== false);
          return shown.length
            ? [{ card, state: null }, ...shown.map((situation) => ({ card, state: situation.id }))]
            : [];
        })
    : [];
  const next = wanted.find(({ card, state }) => {
    const key = layoutKey(card.id, state);
    return !byKey[key]?.screen && !gaveUp.has(key);
  });
  const key = next ? layoutKey(next.card.id, next.state) : null;
  useEffect(() => {
    if (!key) return;
    const listen = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow || event.data?.type !== 'alpine:layout')
        return;
      // The page reports once before it has drawn itself; only a drawn screen counts.
      if (event.data.screen) report(key, event.data as LiveLayout);
    };
    addEventListener('message', listen);
    const timer = setTimeout(() => setGaveUp((current) => new Set(current).add(key)), CHECK_WAIT);
    return () => {
      removeEventListener('message', listen);
      clearTimeout(timer);
    };
  }, [key, report]);
  if (!app || !next) return null;
  const width = pageWidthFor(deviceOfCard(map, next.card.id));
  return (
    <iframe
      ref={frame}
      key={key}
      src={screenAddress(app, next.card.path!, next.state)}
      title=""
      aria-hidden
      tabIndex={-1}
      sandbox="allow-scripts allow-same-origin allow-forms"
      className="pointer-events-none fixed top-0 border-0 opacity-0"
      style={{ left: -20000, width, height: Math.round(width * (width > 400 ? 0.625 : 2.16)) }}
    />
  );
}

/**
 * A situation's chip: its name, and how it stands once Alpine has looked (shows, or looks the same as the usual day).
 * A proposal (not handled yet) is dashed.
 */
export function SituationChip({
  cardId,
  situation,
  pressed,
  onClick,
}: {
  cardId: string;
  situation: ScreenSituation;
  pressed?: boolean;
  onClick?: () => void;
}) {
  const t = useMessages(messages);
  const result = useSituationResult(cardId, situation.id);
  const proposal = situation.handled === false;
  const word = proposal
    ? t.proposal
    : result === 'shows'
      ? t.situationShowsShort
      : result === 'unseen'
        ? ''
        : t.sameShort;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={[situation.why, word].filter(Boolean).join(' · ') || undefined}
      onClick={onClick}
      className={clsx(
        'flex max-w-full cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-meta transition-colors',
        pressed
          ? 'border-fg bg-fg text-canvas'
          : proposal
            ? 'border-dashed border-interactive text-interactive hover:bg-selected'
            : 'border-line bg-canvas-raised text-fg-muted hover:border-interactive hover:text-fg',
      )}
    >
      {!proposal && result === 'shows' && (
        <span aria-hidden className={pressed ? 'text-canvas' : 'text-interactive'}>
          ✓
        </span>
      )}
      {!proposal && (result === 'same' || result === 'elsewhere') && (
        <span aria-hidden className={pressed ? 'text-canvas' : 'text-attention'}>
          !
        </span>
      )}
      {proposal && <span aria-hidden>+</span>}
      <span className="truncate">{situation.title}</span>
      {word && <span className="sr-only">{word}</span>}
    </button>
  );
}

export type SituationAct = 'make' | 'fix' | 'drop';

/**
 * What a card's details say about the situation it shows: its name and when it happens, and what Alpine found: it
 * shows, it looks the same as the usual day (not made yet), another screen comes up, or it is a proposal the code
 * does not handle yet, to make or drop.
 */
export function SituationNote({
  card,
  state,
  onAct,
}: {
  card: TreeCard;
  state: string;
  onAct?: (act: SituationAct) => void;
}) {
  const t = useMessages(messages);
  const app = useLiveApp();
  const result = useSituationResult(card.id, state);
  const situation = card.states?.find((one) => one.id === state);
  if (!situation) return null;
  const proposal = situation.handled === false;
  const [line, tone, acts]: [string, string, SituationAct[]] = proposal
    ? [t.proposalNote, 'text-interactive', ['make', 'drop']]
    : result === 'same'
      ? [t.sameAsUsual, 'text-attention', ['fix']]
      : result === 'elsewhere'
        ? [t.elsewhere, 'text-attention', ['fix']]
        : result === 'shows'
          ? [t.situationShows, 'text-fg-muted', []]
          : app
            ? [t.situationChecking, 'text-fg-faint', []]
            : ['', '', []];
  const label: Record<SituationAct, string> = { make: t.makeSituation, fix: t.fixSituation, drop: t.dropSituation };
  return (
    <div className="flex flex-col gap-1.5 border-b border-line px-5 py-3 pr-12">
      {/* With the app running, the pressed chip above the screen already names it. */}
      {!app && <p className="text-body text-fg">{situation.title}</p>}
      {situation.why && <p className="text-meta text-fg-muted">{situation.why}</p>}
      {line && <p className={clsx('text-meta', tone)}>{line}</p>}
      {onAct && acts.length > 0 && (
        <div className="mt-1 flex gap-2">
          {acts.map((act, index) => (
            <button
              key={act}
              type="button"
              onClick={() => onAct(act)}
              className={clsx(
                'cursor-pointer rounded-md border px-2.5 py-1 text-meta transition-colors',
                index === 0
                  ? 'border-interactive bg-interactive text-on-fill hover:bg-interactive-hover'
                  : 'border-line bg-canvas-raised text-fg-muted hover:text-fg',
              )}
            >
              {label[act]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One screen of the running app, scaled into its frame. Live only while it is near the view (a long map keeps a few
 * frames running, not all); until then, and when the app is not running, `fallback` shows.
 */
export function LiveScreen({
  cardId,
  path,
  state,
  device,
  ratio,
  interactive = false,
  title,
  fallback,
  overlay,
  onGo,
}: {
  cardId: string;
  path: string;
  state?: string | null;
  device: 'phone' | 'computer';
  /** Height over width of the frame. */
  ratio: number;
  /** The screen takes clicks (in a card's details); in the strip the frame is a button that opens the card. */
  interactive?: boolean;
  title: string;
  fallback: ReactNode;
  /** Drawn over the screen, given the scale from the app's pixels to the frame's. */
  overlay?: (scale: number) => ReactNode;
  /** A button to another screen was pressed (only while interactive). */
  onGo?: (cardId: string) => void;
}) {
  const app = useLiveApp();
  const box = useRef<HTMLSpanElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  const [width, setWidth] = useState(0);
  const report = useLiveLayouts((store) => store.report);
  const seen = useLayout(cardId, state);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const sizes =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    sizes?.observe(element);
    setWidth(element.getBoundingClientRect().width);
    if (typeof IntersectionObserver === 'undefined') return () => sizes?.disconnect();
    const view = new IntersectionObserver(([entry]) => setNear(entry!.isIntersecting), { rootMargin: '600px' });
    view.observe(element);
    return () => {
      sizes?.disconnect();
      view.disconnect();
    };
  }, []);

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow || !event.data) return;
      if (event.data.type === 'alpine:layout') report(layoutKey(cardId, state), event.data as LiveLayout);
      if (event.data.type === 'alpine:go' && interactive && typeof event.data.to === 'string') onGo?.(event.data.to);
    };
    addEventListener('message', listen);
    return () => removeEventListener('message', listen);
  }, [cardId, state, interactive, onGo, report]);

  const pageWidth = pageWidthFor(device);
  const scale = width > 0 ? width / pageWidth : 0;
  const live = !!app && near;
  return (
    <span ref={box} className="relative block size-full overflow-hidden">
      {(!live || !seen) && <span className="absolute inset-0">{fallback}</span>}
      {live && (
        <iframe
          ref={frame}
          key={`${app}|${path}|${state ?? ''}`}
          src={screenAddress(app, path, state)}
          title={title}
          sandbox="allow-scripts allow-same-origin allow-forms"
          tabIndex={interactive ? 0 : -1}
          className={clsx('absolute top-0 left-0 origin-top-left border-0 bg-canvas-raised', !seen && 'opacity-0')}
          style={{
            width: pageWidth,
            height: Math.ceil(pageWidth * ratio),
            transform: `scale(${scale || 0.0001})`,
            pointerEvents: interactive ? 'auto' : 'none',
          }}
        />
      )}
      {live && seen && overlay && <span className="pointer-events-none absolute inset-0">{overlay(scale)}</span>}
    </span>
  );
}

/** A promise's place on the real screen: a numbered dot at the element's corner, in the colour of how it stands. */
export function PromisePins({
  layout,
  promises,
  scale,
  width,
}: {
  layout: LiveLayout | undefined;
  promises: TreePromise[];
  scale: number;
  /** The frame's width, so a dot at the corner of a full-width element stays inside it. */
  width: number;
}) {
  if (!layout) return null;
  return promises.map((promise, index) => {
    const place = layout.promises.find((one) => one.id === promise.id);
    if (!place) return null;
    const tone =
      promise.status === 'passed'
        ? 'bg-interactive'
        : promise.status === 'failed'
          ? 'bg-danger'
          : promise.status === 'recheck'
            ? 'bg-attention'
            : 'bg-fg-faint';
    return (
      <span key={promise.id}>
        {promise.status === 'failed' && (
          <span
            aria-hidden
            className="absolute rounded-md border-2 border-dashed border-danger"
            style={{
              left: place.x * scale - 3,
              top: place.y * scale - 3,
              width: place.w * scale + 6,
              height: place.h * scale + 6,
            }}
          />
        )}
        <span
          title={promise.then}
          className={clsx(
            'absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-canvas-raised text-meta text-on-fill shadow-overlay',
            tone,
          )}
          style={{
            left: Math.min((place.x + place.w) * scale - 4, width - 12),
            top: Math.max(place.y * scale + 4, 12),
          }}
        >
          {index + 1}
        </span>
      </span>
    );
  });
}

/**
 * A screen in a card's details: the real screen large, which situation it shows (the ordinary day or one of the card's
 * `states`), its promises pinned to the elements that keep them, and the ways in and out of it as the real buttons go.
 */
export function LiveScreenView({
  map,
  card,
  device,
  state,
  onState,
  onGo,
}: {
  map: TreeMap;
  card: TreeCard;
  device: 'phone' | 'computer';
  state: string | null;
  onState: (state: string | null) => void;
  onGo: (cardId: string) => void;
}) {
  const t = useMessages(messages);
  const layout = useLayout(card.id, state);
  const layouts = useLiveLayouts((store) => store.byKey);
  const promises = card.promises.filter((promise) => (promise.state ?? null) === state);
  const situations = card.states ?? [];
  const title = (id: string) => map.cards[id]?.title ?? id;
  const planned = plannedLinks(map);
  const ways: { to: string; label: string; kind: 'ok' | 'extra' }[] = (layout?.targets ?? []).map((target) => ({
    to: target.to,
    label: target.label,
    kind: planned.get(card.id)?.has(target.to) ? 'ok' : 'extra',
  }));
  const missing = state ? [] : missingButtons(map, card.id, layout);
  const into = Object.entries(layouts)
    .filter(([key]) => key.endsWith('|') && !key.startsWith(`${card.id}|`))
    .flatMap(([key, other]) =>
      other.targets
        .filter((target) => target.to === card.id)
        .map((target) => ({ from: key.slice(0, -1), label: target.label })),
    );
  const placed = new Set(layout?.promises.map((one) => one.id) ?? []);
  // A proposal is not in the code yet: there is no screen to open for it.
  const proposal = !!state && situations.find((one) => one.id === state)?.handled === false;
  const screen = (
    <div className={clsx('mx-auto w-full', device === 'computer' ? 'max-w-full' : 'max-w-64')}>
      <div
        className={clsx(
          'relative overflow-hidden border border-line-subtle bg-canvas',
          device === 'computer' ? 'aspect-8/5 rounded-lg' : 'aspect-1/2 rounded-2xl',
        )}
      >
        {proposal ? (
          <span className="flex size-full items-center justify-center border-2 border-dashed border-interactive/50 p-6 text-center text-meta text-fg-muted">
            {t.notYetScreen}
          </span>
        ) : (
          <LiveScreen
            cardId={card.id}
            path={card.path!}
            state={state}
            device={device}
            ratio={device === 'computer' ? 0.625 : 2}
            interactive
            title={card.title}
            onGo={onGo}
            fallback={
              <span className="flex size-full items-center justify-center p-4 text-center text-meta text-fg-faint">
                {t.liveOpening}
              </span>
            }
            overlay={(scale) => (
              <PromisePins layout={layout} promises={promises} scale={scale} width={pageWidthFor(device) * scale} />
            )}
          />
        )}
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-3 border-b border-line bg-canvas-sunken px-5 pt-5 pb-4">
      <span className="flex items-center gap-1.5 pr-8 text-meta text-fg-muted">
        <span aria-hidden className="size-1.75 rounded-full bg-interactive" />
        {card.phase === 'built' ? t.liveReal : t.livePlanned}
      </span>
      {situations.length > 0 && (
        <div role="group" aria-label={t.situations} className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={state === null}
            onClick={() => onState(null)}
            className={clsx(
              'cursor-pointer rounded-full border px-2 py-0.5 text-meta transition-colors',
              state === null
                ? 'border-fg bg-fg text-canvas'
                : 'border-line bg-canvas-raised text-fg-muted hover:text-fg',
            )}
          >
            {t.ordinaryDay}
          </button>
          {situations.map((situation) => (
            <SituationChip
              key={situation.id}
              cardId={card.id}
              situation={situation}
              pressed={state === situation.id}
              onClick={() => onState(situation.id)}
            />
          ))}
        </div>
      )}
      <div className={clsx('flex gap-5', device === 'computer' ? 'flex-col' : 'items-start')}>
        <div className={device === 'computer' ? 'w-full' : 'w-64 shrink-0'}>{screen}</div>
        <div className="flex min-w-0 grow flex-col gap-4 text-meta">
          {layout && promises.length > 0 && (
            <section>
              <h4 className="mb-1.5 text-fg-muted">{state ? t.situationPromises : t.screenPromises}</h4>
              {promises.some((promise) => placed.has(promise.id)) && (
                <p className="text-fg-muted">{t.pinned(promises.filter((promise) => placed.has(promise.id)).length)}</p>
              )}
              {promises
                .filter((promise) => !placed.has(promise.id))
                .map((promise) => (
                  <p key={promise.id} className="mt-1 text-body text-fg">
                    {promise.then}
                    <span className="block text-meta text-attention">{t.notOnScreen}</span>
                  </p>
                ))}
            </section>
          )}
          {!proposal && (
            <>
              <section>
                <h4 className="mb-1.5 text-fg-muted">{t.waysIn}</h4>
                {into.length ? (
                  into.map((way) => (
                    <button
                      key={`${way.from}-${way.label}`}
                      type="button"
                      onClick={() => onGo(way.from)}
                      className="mb-1 flex w-full cursor-pointer justify-between gap-3 rounded-md bg-canvas-raised px-2.5 py-1.5 text-left transition-colors hover:bg-hover"
                    >
                      <span className="text-fg">{title(way.from)}</span>
                      <span className="truncate text-interactive">{way.label}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-fg-faint">{t.noWayIn}</p>
                )}
              </section>
              <section>
                <h4 className="mb-1.5 text-fg-muted">{t.waysOut}</h4>
                {ways.map((way) => (
                  <button
                    key={`${way.to}-${way.label}`}
                    type="button"
                    onClick={() => onGo(way.to)}
                    className="mb-1 flex w-full cursor-pointer justify-between gap-3 rounded-md bg-canvas-raised px-2.5 py-1.5 text-left transition-colors hover:bg-hover"
                  >
                    <span className="text-fg">{title(way.to)}</span>
                    <span className={clsx('truncate', way.kind === 'ok' ? 'text-interactive' : 'text-fg-muted')}>
                      {way.kind === 'ok' ? way.label : t.offMap(way.label)}
                    </span>
                  </button>
                ))}
                {missing.map((to) => (
                  <p
                    key={to}
                    className="mb-1 flex justify-between gap-3 rounded-md border border-dashed border-attention px-2.5 py-1.5"
                  >
                    <span className="text-fg">{title(to)}</span>
                    <span className="text-attention">{t.noButton}</span>
                  </p>
                ))}
                {!ways.length && !missing.length && <p className="text-fg-faint">{t.noWayOut}</p>}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
