import { Button, Menu } from '@alpine/ui/primitives';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Monitor, RotateCw, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { useMessages } from '@/shared/i18n';
import { openInBrowser } from '@/shared/platform';
import { useServer } from '@/shared/server';
import {
  useDevelopmentServerActions,
  useDevelopmentServerLogs,
  useDevelopmentServers,
} from '@/shared/server/devServers';

import { messages } from './messages';
import { seeAppScreen, setAppSize, settleAppCard, useAppSize, useAppViewState, type AppSize } from './state';

/** A promise of a screen, as the side strip lists it: kept (✓), broken (✗, with why) or not checked yet. */
export interface AppPromise {
  id: string;
  text: string;
  status: 'passed' | 'failed' | 'other';
  /** Why it is broken, in plain words. */
  note: string;
}

/** A screen card of the map, as the app view needs it. */
export interface AppScreen {
  id: string;
  title: string;
  /** Its address inside the running app (`/reservations`); null when the AI has not written one. */
  path: string | null;
  promises: AppPromise[];
  /** What the person needs to try it (a sign-in, a password), in plain words; empty when nothing is needed. */
  howToTry: string;
  /** Its picture on the map is a capture of the running app. */
  real: boolean;
  /** The situations the app can show it in (`?alpine-state=<id>`), besides the ordinary one. */
  situations?: AppSituation[];
}

/** A situation of a screen the running app handles, in the person's words ("빵이 하나도 없을 때"). */
export interface AppSituation {
  id: string;
  title: string;
}

export interface AppJourney {
  id: string;
  title: string;
  device: AppSize | null;
  screens: AppScreen[];
}

export interface AppPerson {
  id: string;
  name: string;
  /** The avatar colour the map gives the person (1-5). */
  tone: number;
  journeys: AppJourney[];
}

/** What a server that would not start leaves for the AI to fix. */
export interface OpenFailure {
  command: string;
  port: number;
  /** The end of its output, or why it could not even start. */
  log: string;
}

/** How much of the end of the output the AI is given to fix an app that would not open. */
const FIX_LOG = 4000;

// eslint-disable-next-line no-control-regex -- the escape character is what it looks for
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');

/**
 * The page address of a screen in the running app, in a situation when one is given (`?alpine-state=`, which the apps
 * read). Only a web address takes a path; anything else stays itself.
 */
export function screenUrl(base: string, path: string | null, state: string | null = null): string {
  if ((!path && !state) || !/^https?:/.test(base)) return base;
  try {
    const url = new URL(path ?? '', base);
    if (state) url.searchParams.set('alpine-state', state);
    return url.toString();
  } catch {
    return base;
  }
}

/**
 * The 앱 view (flow-spec 4.2-4.4, app-first): Alpine starts the project's app itself and shows it large, the way a
 * person uses it, with a bar of its own over it: back, forward, again, the name of the screen on view (pressed, every
 * screen of the map, to go to one) and the size. Over that, only while the app breaks a promise, one red line and
 * a button that hands it to the AI. When the app will not open, the AI can be asked to fix it; a phone app (an Expo
 * project) says how to see it on a phone.
 */
export function AppView({
  cwd,
  name,
  people,
  cardId,
  onPick,
  onAskFix,
  onAskFixBroken,
  onAskSetup,
  onShowTerminal,
  reload = 0,
}: {
  cwd: string;
  /** The project's name, for the frame's address bar. */
  name: string;
  people: AppPerson[];
  /** The screen card picked; null shows the app's first page (the screen at `/` when the map has one). */
  cardId: string | null;
  onPick: (cardId: string) => void;
  /** Hands the AI what went wrong when the app would not open. */
  onAskFix: (failure: OpenFailure) => void;
  /** Hands the AI the promises the app breaks. */
  onAskFixBroken: (broken: BrokenPromise[]) => void;
  /** Asks the AI to make a project that nothing says how to run open the way Alpine opens apps. */
  onAskSetup: () => void;
  /** Opens the terminal beside it (where a phone app is started). */
  onShowTerminal: () => void;
  /** Goes up each time the AI's work on the app ends: the frame loads the screen again, to show what changed. */
  reload?: number;
}) {
  const t = useMessages(messages);
  const server = useServer();
  // A phone app (Expo) runs on a phone, not in a frame: it says how to see it there instead of starting anything.
  const mobile = useQuery({
    queryKey: ['app-view-mobile', cwd],
    queryFn: async () => {
      try {
        const file = await server.request('files/read', { cwd, path: 'package.json' });
        return /"expo"\s*:/.test(file.content);
      } catch {
        return false;
      }
    },
    staleTime: Infinity,
  });
  const app = useRunningApp(cwd, mobile.data === false);
  const screens = people.flatMap((person) =>
    person.journeys.flatMap((journey) => journey.screens.map((screen) => ({ screen, person, journey }))),
  );
  const shown =
    screens.find((entry) => entry.screen.id === cardId) ??
    (cardId ? undefined : screens.find((entry) => entry.screen.path === '/'));
  const settled = !cardId && shown ? shown.screen.id : null;
  useEffect(() => {
    if (settled) settleAppCard(cwd, settled);
  }, [cwd, settled]);
  const picked = useAppSize(cwd);
  const size: AppSize = picked ?? shown?.journey.device ?? 'computer';
  const url = app.url ? screenUrl(app.url, shown?.screen.path ?? null) : null;
  // The same page straight from the app's server, for a real browser.
  const direct = app.direct ? screenUrl(app.direct, shown?.screen.path ?? null) : '';
  const frame = useRef<HTMLIFrameElement>(null);
  const [reloaded, setReloaded] = useState(0);
  const at = useAppViewState((state) => state.at[cwd] ?? null);
  // The bridge in the page says which screen it is on as the person moves inside the app (by its card id, else by its
  // address), so the bar names it and words sent from the conversation are about it.
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow || event.data?.type !== 'alpine:layout')
        return;
      const href = typeof event.data.href === 'string' ? event.data.href.split('?')[0] : '';
      const card =
        screens.find((entry) => entry.screen.id === event.data.screen)?.screen.id ??
        screens.find((entry) => !!href && entry.screen.path === href)?.screen.id ??
        null;
      seeAppScreen(cwd, card);
    };
    addEventListener('message', listen);
    return () => removeEventListener('message', listen);
  }, [cwd, screens]);

  if (mobile.data)
    return (
      <Centre>
        <h2 className="text-title font-medium">{t.mobile}</h2>
        <div className="flex max-w-90 flex-col gap-1 text-left">
          <p className="text-body font-medium">{t.mobileHowTo}</p>
          <ol className="list-decimal pl-5 text-body text-fg-muted">
            <li>{t.mobileStep1}</li>
            <li>{t.mobileStep2}</li>
            <li>{t.mobileStep3}</li>
          </ol>
        </div>
        <Button onClick={onShowTerminal}>{t.openTerminal}</Button>
      </Centre>
    );
  if (mobile.isPending || app.state === 'opening')
    return (
      <Centre>
        <p role="status" className="flex items-center gap-2 text-title font-medium">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-interactive" />
          {t.opening}
        </p>
        <p className="text-body text-fg-muted">{t.openingHint}</p>
      </Centre>
    );
  if (app.state === 'failed')
    return (
      <Centre>
        <h2 role="alert" className="text-title font-medium">
          {t.openFailed}
        </h2>
        <p className="text-body text-fg-muted">{t.openFailedHint}</p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => onAskFix(app.failure())}>
            {t.askFix}
          </Button>
          <Button onClick={app.open}>{t.openAgain}</Button>
        </div>
      </Centre>
    );
  if (app.state === 'unknown')
    return (
      <Centre>
        <h2 role="alert" className="text-title font-medium">
          {t.unknown}
        </h2>
        <p className="text-body text-fg-muted">{t.unknownHint}</p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={onAskSetup}>
            {t.askSetup}
          </Button>
          <Button onClick={app.open}>{t.openAgain}</Button>
        </div>
      </Centre>
    );
  if (app.state === 'stopped' || !url)
    return (
      <Centre>
        <h2 className="text-title font-medium">{t.stopped}</h2>
        <Button variant="primary" onClick={app.open}>
          {t.openAgain}
        </Button>
      </Centre>
    );

  // The screen the app says it is on (after moving inside it), else the one it was taken to.
  const onScreen = screens.find((entry) => entry.screen.id === at)?.screen ?? shown?.screen;
  const go = (step: -1 | 1) => frame.current?.contentWindow?.postMessage({ type: 'alpine:history', step }, '*');

  return (
    <section aria-label={t.title} className="flex min-h-0 min-w-0 grow flex-col overflow-clip px-6 pt-3 pb-6">
      {/* What is broken stands over the app, never on it: the app below moves down and stays whole. */}
      <BrokenBar people={people} onPick={onPick} onAskFix={onAskFixBroken} />
      <div className="flex min-h-0 grow flex-col items-center">
        <div
          className={clsx(
            'flex min-h-0 flex-col overflow-clip rounded-xl border border-line bg-canvas-raised shadow-overlay',
            size === 'phone' ? 'app-phone-frame h-full max-h-200 w-full max-w-104' : 'size-full',
          )}
        >
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line-subtle px-2 text-fg-muted">
            <ToolButton label={t.back} onClick={() => go(-1)}>
              <ChevronLeft size={16} />
            </ToolButton>
            <ToolButton label={t.forward} onClick={() => go(1)}>
              <ChevronRight size={16} />
            </ToolButton>
            <ToolButton label={t.reload} onClick={() => setReloaded((n) => n + 1)}>
              <RotateCw size={14} />
            </ToolButton>
            <ScreenMenu people={people} current={onScreen ?? null} onPick={onPick} />
            {size !== 'phone' && (
              <ToolButton label={t.openInBrowser} title={t.framedHint} onClick={() => void openInBrowser(direct)}>
                <ExternalLink size={14} />
              </ToolButton>
            )}
            <div role="group" aria-label={t.sizeLabel} className="flex gap-0.5 rounded-lg bg-hover p-0.5">
              <SizeButton label={t.phoneSize} on={size === 'phone'} onClick={() => setAppSize(cwd, 'phone')}>
                <Smartphone size={13} />
              </SizeButton>
              <SizeButton label={t.computerSize} on={size === 'computer'} onClick={() => setAppSize(cwd, 'computer')}>
                <Monitor size={13} />
              </SizeButton>
            </div>
          </div>
          {size === 'phone' ? (
            <iframe
              ref={frame}
              key={`${app.serverId}:${reload}:${reloaded}`}
              name={APP_FRAME}
              src={url}
              title={t.frameTitle(name)}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              className="app-phone-screen min-h-0 w-full grow bg-canvas-raised"
            />
          ) : (
            <ComputerScreen
              key={`${app.serverId}:${reload}:${reloaded}`}
              frame={frame}
              src={url}
              title={t.frameTitle(name)}
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** The frame's name: the bridge in a page named so lets the app be used for real (relay_bridge.js). */
const APP_FRAME = 'alpine-app';

/** A computer's page width: the app draws its computer layout at it, and the frame is scaled to fit the room. */
export const COMPUTER_WIDTH = 1280;

/**
 * The app at a computer's width (dogfood 16: in a narrow room it drew its narrow layout): the page is 1280 wide,
 * scaled down to the room there is, never up.
 */
function ComputerScreen({
  src,
  title,
  frame,
}: {
  src: string;
  title: string;
  frame: RefObject<HTMLIFrameElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setRoom({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const sizes = new ResizeObserver(measure);
    sizes.observe(element);
    return () => sizes.disconnect();
  }, []);
  const scale = room.width > 0 ? Math.min(1, room.width / COMPUTER_WIDTH) : 1;
  return (
    <div ref={box} className="relative min-h-0 grow overflow-clip bg-canvas-raised">
      <iframe
        ref={frame}
        name={APP_FRAME}
        src={src}
        title={title}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="absolute top-0 left-0 origin-top-left border-0 bg-canvas-raised"
        style={{
          width: COMPUTER_WIDTH,
          height: room.height > 0 ? Math.ceil(room.height / scale) : '100%',
          transform: scale === 1 ? undefined : `scale(${scale})`,
        }}
      />
    </div>
  );
}

function Centre({ children }: { children: ReactNode }) {
  const t = useMessages(messages);
  return (
    <section
      aria-label={t.title}
      className="flex min-h-0 grow flex-col items-center justify-center gap-3 p-8 text-center"
    >
      {children}
    </section>
  );
}

function ToolButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-hover hover:text-fg"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

function SizeButton({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        'grid h-6 w-7 cursor-pointer place-items-center rounded-md',
        on ? 'bg-canvas-raised text-fg shadow-overlay' : 'text-fg-muted hover:text-fg',
      )}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

/**
 * Where the address bar would be: the name of the screen on view, as the board names it. Pressed, it lists every
 * screen by journey; picking one takes the app there.
 */
function ScreenMenu({
  people,
  current,
  onPick,
}: {
  people: AppPerson[];
  current: AppScreen | null;
  onPick: (cardId: string) => void;
}) {
  const t = useMessages(messages);
  const journeys = people.flatMap((person) => person.journeys);
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t.screenMenu}
        className="mx-1 flex h-7 min-w-0 grow cursor-pointer items-center justify-center gap-1.5 rounded-md bg-canvas-sunken px-3 text-meta text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-interactive data-popup-open:bg-hover"
      >
        <span className="truncate">{current?.title ?? t.firstPage}</span>
        <ChevronDown size={13} aria-hidden="true" className="shrink-0 text-fg-faint" />
      </Menu.Trigger>
      <Menu.Popup align="center" className="max-h-[70vh] overflow-y-auto">
        {journeys.map((journey, index) => (
          <Menu.Group key={journey.id}>
            {index > 0 && <Menu.Separator />}
            <Menu.GroupLabel>{journey.title}</Menu.GroupLabel>
            {journey.screens.map((screen) => (
              <Menu.Item key={`${journey.id}:${screen.id}`} onClick={() => onPick(screen.id)}>
                <span className={clsx('grow', screen.id === current?.id && 'text-interactive')}>{screen.title}</span>
              </Menu.Item>
            ))}
          </Menu.Group>
        ))}
      </Menu.Popup>
    </Menu.Root>
  );
}

/** A promise the app does not keep, with the screen it belongs to. */
export interface BrokenPromise {
  screen: AppScreen;
  promise: AppPromise;
}

/** Every promise the app breaks, once each (a screen in two journeys is listed twice). */
export function brokenPromises(people: AppPerson[]): BrokenPromise[] {
  const seen = new Set<string>();
  return people.flatMap((person) =>
    person.journeys.flatMap((journey) =>
      journey.screens.flatMap((screen) =>
        screen.promises
          .filter((promise) => promise.status === 'failed')
          .filter((promise) => {
            const key = `${screen.id}:${promise.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((promise) => ({ screen, promise })),
      ),
    ),
  );
}

/**
 * The one red line over the app, shown only while the app breaks a promise: what does not work, in the promise's own
 * words, and one button that hands it to the AI. The words take the app to that screen.
 */
function BrokenBar({
  people,
  onPick,
  onAskFix,
}: {
  people: AppPerson[];
  onPick: (cardId: string) => void;
  onAskFix: (broken: BrokenPromise[]) => void;
}) {
  const t = useMessages(messages);
  const broken = brokenPromises(people);
  const first = broken[0];
  if (!first) return null;
  return (
    <div
      role="alert"
      className="mb-3 flex min-h-12 shrink-0 items-center gap-3 rounded-xl border border-danger/30 bg-danger/8 px-4 py-2 text-body text-danger"
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger" />
      <button
        type="button"
        onClick={() => onPick(first.screen.id)}
        className="min-w-0 grow cursor-pointer truncate text-left hover:underline"
      >
        {t.notWorking(first.screen.title, first.promise.text)}
        {broken.length > 1 && <span className="ml-2 text-meta">{t.andMore(broken.length - 1)}</span>}
      </button>
      <Button variant="danger" onClick={() => onAskFix(broken)}>
        {t.askFixBroken}
      </Button>
    </div>
  );
}

type AppState = 'opening' | 'running' | 'failed' | 'unknown' | 'stopped';

/**
 * The project's app, running: asked for once when the view opens (`devServers/open` uses the server the project
 * already has, or starts one the way the project runs), then followed until it is up or fails.
 */
function useRunningApp(cwd: string, enabled: boolean) {
  const servers = useDevelopmentServers(cwd, enabled);
  const actions = useDevelopmentServerActions();
  const asked = useRef<string | null>(null);
  const open = () => actions.open.mutate({ cwd });
  useEffect(() => {
    if (!enabled || asked.current === cwd) return;
    asked.current = cwd;
    actions.open.mutate({ cwd });
    // Asked once per project; the mutation object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, enabled]);
  const openedId = actions.open.data?.server?.id;
  const current =
    servers.data?.servers.find((s) => s.id === openedId) ??
    servers.data?.servers.findLast((s) => s.status === 'running' || s.status === 'starting') ??
    servers.data?.servers.at(-1);
  const logs = useDevelopmentServerLogs(current?.status === 'failed' && !current.external ? current.id : null);
  const status = current?.status;
  const state: AppState = actions.open.isPending
    ? 'opening'
    : actions.open.isError || status === 'failed'
      ? 'failed'
      : status === 'running' && current?.url
        ? 'running'
        : status === 'starting' || actions.open.isIdle
          ? 'opening'
          : actions.open.isSuccess && !actions.open.data.server && !current
            ? 'unknown'
            : 'stopped';
  return {
    state,
    // Through Alpine's relay, whose bridge says which screen is on view and moves back and forward; the server's
    // own address when there is no relay.
    url: state === 'running' ? (current?.boardUrl ?? current?.url ?? null) : null,
    direct: state === 'running' ? (current?.url ?? null) : null,
    serverId: current?.id ?? '',
    open,
    failure: (): OpenFailure => ({
      command: current?.command ?? '',
      port: current?.port ?? 0,
      log: stripAnsi(
        (current && !current.external ? (logs.data?.text ?? '').slice(-FIX_LOG) : '').trim() ||
          actions.open.error?.message ||
          '',
      ).trim(),
    }),
  };
}
