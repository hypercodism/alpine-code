import { Button, LinkButton } from '@alpine/ui/primitives';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useMessages } from '@/shared/i18n';
import { openInBrowser } from '@/shared/platform';
import { useServer } from '@/shared/server';
import {
  useDevelopmentServerActions,
  useDevelopmentServerLogs,
  useDevelopmentServers,
} from '@/shared/server/devServers';

import { messages } from './messages';
import { setAppSize, settleAppCard, useAppSize, type AppSize } from './state';

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

const avatars = [
  'bg-avatar-1 text-avatar-1-ink',
  'bg-avatar-2 text-avatar-2-ink',
  'bg-avatar-3 text-avatar-3-ink',
  'bg-avatar-4 text-avatar-4-ink',
  'bg-avatar-5 text-avatar-5-ink',
];

/** The page address of a screen in the running app. Only a web address takes a path; anything else stays itself. */
export function screenUrl(base: string, path: string | null): string {
  if (!path || !/^https?:/.test(base)) return base;
  try {
    return new URL(path, base).toString();
  } catch {
    return base;
  }
}

/**
 * The 앱 view (flow-spec 4.2-4.4): Alpine starts the project's app itself and shows it large, in a browser frame or a
 * phone frame, with a strip beside it holding the screen on view (its person, device, journey and promises) and every
 * other screen of the map, grouped by person and journey; pressing one takes the app to that screen's address. When
 * the app will not open, the AI can be asked to fix it; a phone app (an Expo project) says how to see it on a phone.
 */
export function AppView({
  cwd,
  name,
  people,
  cardId,
  onPick,
  onAskFix,
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

  return (
    <section aria-label={t.title} className="flex min-h-0 min-w-0 grow flex-col overflow-clip">
      <div className="flex h-10 shrink-0 items-center gap-2.5 px-6 text-meta text-fg-muted">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-interactive" />
        <span role="status">{t.running}</span>
        <LinkButton className="min-h-5 px-0.5 text-meta" title={t.framedHint} onClick={() => void openInBrowser(url)}>
          {t.openInBrowser}
        </LinkButton>
        <div role="group" aria-label={t.sizeLabel} className="ml-auto flex gap-0.5 rounded-lg bg-hover p-0.5">
          <SizeButton on={size === 'phone'} onClick={() => setAppSize(cwd, 'phone')} icon={<Smartphone size={13} />}>
            {t.phoneSize}
          </SizeButton>
          <SizeButton on={size === 'computer'} onClick={() => setAppSize(cwd, 'computer')} icon={<Monitor size={13} />}>
            {t.computerSize}
          </SizeButton>
        </div>
      </div>
      <div className="flex min-h-0 grow gap-6 px-6 pb-6">
        <div className="flex min-w-0 grow items-start justify-center">
          {size === 'phone' ? (
            <div className="app-phone-frame flex aspect-1/2 h-full max-h-186 shrink-0 border border-line bg-canvas-raised p-2.5 shadow-overlay">
              <iframe
                key={`${app.serverId}:${reload}`}
                src={url}
                title={t.frameTitle(name)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                className="app-phone-screen size-full bg-canvas-raised"
              />
            </div>
          ) : (
            <div className="flex size-full flex-col overflow-clip rounded-xl border border-line bg-canvas-raised shadow-overlay">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line-subtle bg-canvas-sunken px-3.5">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-line" />
                <span aria-hidden="true" className="size-2.5 rounded-full bg-line" />
                <span aria-hidden="true" className="size-2.5 rounded-full bg-line" />
                <span
                  title={url}
                  className="mx-auto max-w-[60%] truncate rounded-md border border-line-subtle bg-canvas-raised px-4 text-meta text-fg-faint"
                >
                  {shown ? `${name} · ${t.screenOf(shown.person.name)}` : name}
                </span>
              </div>
              <ComputerScreen key={`${app.serverId}:${reload}`} src={url} title={t.frameTitle(name)} />
            </div>
          )}
        </div>
        <ScreenStrip people={people} shown={shown} cardId={cardId} onPick={onPick} />
      </div>
    </section>
  );
}

/** A computer's page width: the app draws its computer layout at it, and the frame is scaled to fit beside the strip. */
export const COMPUTER_WIDTH = 1280;

/**
 * The app at a computer's width (dogfood 16: in the room beside the strip it was about 520 px wide and drew its narrow
 * layout): the page is 1280 wide, scaled down to the room there is, never up.
 */
function ComputerScreen({ src, title }: { src: string; title: string }) {
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

function SizeButton({
  on,
  onClick,
  icon,
  children,
}: {
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        'flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-meta',
        on ? 'bg-canvas-raised font-medium text-fg shadow-overlay' : 'text-fg-muted hover:text-fg',
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  );
}

/** The strip beside the app: the screen on view, then every other screen, grouped by person and journey. */
function ScreenStrip({
  people,
  shown,
  cardId,
  onPick,
}: {
  people: AppPerson[];
  shown: { screen: AppScreen; person: AppPerson; journey: AppJourney } | undefined;
  cardId: string | null;
  onPick: (cardId: string) => void;
}) {
  const t = useMessages(messages);
  const deviceWord = (device: AppSize | null) => (device === 'computer' ? t.computer : t.phone);
  const failed = shown?.screen.promises.filter((promise) => promise.status === 'failed').length ?? 0;
  return (
    <aside aria-label={t.nowViewing} className="flex w-63 shrink-0 flex-col overflow-y-auto pt-1.5">
      <p className="text-meta text-fg-muted">{t.nowViewing}</p>
      <h2 className="mt-1 mb-0.5 text-display font-medium">{shown?.screen.title ?? t.firstPage}</h2>
      {shown ? (
        <>
          <p className="flex items-center gap-1.5 text-meta text-fg-muted">
            <Avatar name={shown.person.name} tone={shown.person.tone} small />
            {shown.person.name} · {deviceWord(shown.journey.device)} · {shown.journey.title}
          </p>
          {!shown.screen.path && <p className="mt-2 text-meta text-fg-muted">{t.noPath}</p>}
          {failed > 0 ? (
            <p className="mt-2 flex items-center gap-1.5 text-meta text-danger">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-danger" />
              {t.toFix(failed)}
            </p>
          ) : (
            shown.screen.real && (
              <p className="mt-2 flex items-center gap-1.5 text-meta text-fg-muted">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-interactive" />
                {t.real}
              </p>
            )
          )}
          <ul aria-label={shown.screen.title} className="mt-3 flex flex-col gap-1.5">
            {shown.screen.promises.map((promise) => (
              <li
                key={promise.id}
                className={clsx('flex gap-1.5 text-body', promise.status === 'failed' ? 'text-fg' : 'text-fg-muted')}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    'w-3 shrink-0 text-center',
                    promise.status === 'failed'
                      ? 'text-danger'
                      : promise.status === 'passed'
                        ? 'text-interactive'
                        : 'text-fg-faint',
                  )}
                >
                  {promise.status === 'failed' ? '✗' : promise.status === 'passed' ? '✓' : '·'}
                </span>
                <span>
                  {promise.text}
                  {promise.status === 'failed' && promise.note && (
                    <span className="mt-0.5 block text-meta text-fg-muted">{promise.note}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {shown.screen.howToTry.trim() && (
            <section aria-label={t.howToTry} className="mt-4 flex flex-col gap-1 rounded-lg bg-canvas-sunken px-3 py-2">
              <p className="text-meta text-fg-muted">{t.howToTry}</p>
              <p className="text-body whitespace-pre-wrap text-fg">{shown.screen.howToTry.trim()}</p>
            </section>
          )}
        </>
      ) : (
        <p className="text-meta text-fg-muted">{t.firstPageHint}</p>
      )}
      <hr className="mt-5 mb-3.5 border-line" />
      <p className="mb-2 text-meta text-fg-muted">{t.others}</p>
      {people.map((person) => (
        <div key={person.id} className="mb-3.5">
          <p className="mb-1 flex items-center gap-1.5 text-meta text-fg">
            <Avatar name={person.name} tone={person.tone} />
            {person.name}
            {personDevice(person) && <span className="text-fg-faint">· {deviceWord(personDevice(person)!)}</span>}
          </p>
          {person.journeys.map((journey) => (
            <div key={journey.id}>
              <p className="mt-1.5 mb-0.5 ml-7 text-meta text-fg-faint">{journey.title}</p>
              {journey.screens.map((screen) => {
                const broken = screen.promises.filter((promise) => promise.status === 'failed').length;
                const on = shown?.screen.id === screen.id && (cardId === screen.id || cardId === null);
                return (
                  <button
                    key={`${journey.id}:${screen.id}`}
                    type="button"
                    aria-current={on ? 'page' : undefined}
                    onClick={() => onPick(screen.id)}
                    className={clsx(
                      'flex h-7 w-full cursor-pointer items-center gap-2 rounded-md pr-2 pl-7 text-left text-body',
                      on ? 'bg-selected font-medium text-fg' : 'text-fg-muted hover:bg-hover',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={clsx('size-1.5 shrink-0 rounded-full', broken ? 'bg-danger' : 'bg-interactive')}
                    />
                    <span className="min-w-0 truncate">{screen.title}</span>
                    {broken > 0 && (
                      <span className="ml-auto shrink-0 text-meta font-normal text-danger">{t.toFix(broken)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}

/** The device a person's journeys share, or null when they differ (each journey then says its own). */
function personDevice(person: AppPerson): AppSize | null {
  const devices = new Set(person.journeys.map((journey) => journey.device ?? 'phone'));
  return devices.size === 1 ? [...devices][0]! : null;
}

function Avatar({ name, tone, small = false }: { name: string; tone: number; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'grid shrink-0 place-items-center rounded-full text-meta font-medium',
        small ? 'size-4.5' : 'size-5.5',
        avatars[(tone - 1 + avatars.length) % avatars.length],
      )}
    >
      {[...name][0] ?? ''}
    </span>
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
    url: state === 'running' ? (current?.url ?? null) : null,
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
