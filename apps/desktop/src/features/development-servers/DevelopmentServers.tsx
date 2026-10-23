import { Button, Input } from '@alpine/ui/primitives';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useMessages } from '@/shared/i18n';
import { openInBrowser } from '@/shared/platform';
import {
  useDevelopmentServerActions,
  useDevelopmentServerLogs,
  useDevelopmentServers,
} from '@/shared/server/devServers';

import { messages } from './messages';
import { useOpenRequest } from './openRequest';

/** How much of the end of the output the AI is given to fix an app that would not open. */
const FIX_LOG = 4000;

/** Terminal colours and styles, which would only be noise in the words the AI is given. */
// eslint-disable-next-line no-control-regex -- the escape character is what it looks for
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');

/**
 * The dock's 미리보기: the project's app, running. 앱 열기 asks the server for it (`devServers/open`), which uses the
 * server the project already has (one the AI started counts) or starts one the way the project runs, so the person
 * never types a command. The command, the port, every server and their output are folded under 고급, also for when
 * nothing in the project says how it runs. Server state lives on the backend, so changing pages never stops a server.
 */
export function DevelopmentServers({
  cwd,
  sessionId,
  onDismiss,
  onAskFix,
}: {
  cwd: string;
  sessionId?: string;
  onDismiss?: () => void;
  /** Hands the AI what went wrong when the app would not open (on the map, as words to the map). */
  onAskFix?: (text: string) => void;
}) {
  const m = useMessages(messages);
  const servers = useDevelopmentServers(cwd);
  const actions = useDevelopmentServerActions();
  const [selected, setSelected] = useState<string | null>(null);
  const current = servers.data?.servers.find((s) => s.id === selected) ?? servers.data?.servers.at(-1);
  const [command, setCommand] = useState(current?.command ?? 'npm run dev');
  const [port, setPort] = useState(String(current?.port ?? 5173));
  const logs = useDevelopmentServerLogs(current?.id ?? null);
  const conflict = actions.start.data?.conflict;
  // Nothing in the project says how it runs: the command is the person's to give, under 고급.
  const unknown = actions.open.isSuccess && !actions.open.data.server;
  const [advanced, setAdvanced] = useState(false);
  const error = servers.error ?? actions.start.error ?? actions.stop.error ?? actions.restart.error ?? logs.error;
  const busy = actions.open.isPending || actions.start.isPending || actions.stop.isPending || actions.restart.isPending;
  const open = () =>
    actions.open.mutate(
      { cwd, sessionId },
      {
        onSuccess: (result) => {
          if (result.server) setSelected(result.server.id);
          // With no one to hand it to, the command is the person's to give.
          else if (!onAskFix) setAdvanced(true);
        },
      },
    );
  const start = async (reuse = false) => {
    const result = await actions.start.mutateAsync({ cwd, command, port: Number(port), sessionId, reuse });
    if (result.server) setSelected(result.server.id);
  };

  // 앱 열기 elsewhere (the map's done line) asked for this project's app: open it as soon as this tab is on screen.
  const requested = useOpenRequest((state) => state.cwd === cwd);
  useEffect(() => {
    if (!requested) return;
    useOpenRequest.getState().take();
    open();
    // `open` is new on every render; the request is what starts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  const status = current?.status;
  const opening = actions.open.isPending || status === 'starting';
  const failed = actions.open.isError || status === 'failed';
  // What the AI is given to fix: the command and the end of its output (or why it could not even start).
  const askFix = () => {
    const output = current && !current.external ? (logs.data?.text ?? '').slice(-FIX_LOG) : '';
    const reason = output.trim() || actions.open.error?.message || '';
    onAskFix?.(m.fixRequest(current?.command ?? '', current?.port ?? 0, stripAnsi(reason).trim()));
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4" aria-label={m.title}>
      <div className="flex items-center justify-between">
        <h2 className="text-body font-medium text-fg">{m.title}</h2>
        {onDismiss && (
          <button
            type="button"
            aria-label={m.dismiss}
            title={m.dismiss}
            onClick={onDismiss}
            className="cursor-pointer text-fg-muted hover:text-fg"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {servers.isPending ? (
        <p className="text-body text-fg-muted">{m.loading}</p>
      ) : status === 'running' && current?.url ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void openInBrowser(current.url!)}>
              {m.open}
            </Button>
            <Button disabled={busy} onClick={() => actions.stop.mutate(current.id)}>
              {current.external ? m.detach : m.stop}
            </Button>
          </div>
          <iframe
            className="min-h-64 flex-1 rounded-lg border border-line bg-canvas"
            src={current.url}
            title={m.preview}
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
          <p className="text-meta text-fg-muted">{m.previewHelp}</p>
        </>
      ) : opening ? (
        <p role="status" className="text-body text-fg-muted">
          {m.opening}
        </p>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p role={failed || unknown ? 'alert' : undefined} className="text-body text-fg-muted">
            {unknown
              ? onAskFix
                ? m.unknownFix
                : m.unknown
              : failed
                ? onAskFix
                  ? m.openFailedFix
                  : m.openFailed
                : status === 'stopped'
                  ? m.appStopped
                  : m.lead}
          </p>
          <div className="flex flex-wrap gap-2">
            {failed && !unknown && onAskFix && (
              <Button variant="primary" onClick={askFix}>
                {m.askFix}
              </Button>
            )}
            {/* Nothing says how it runs: the AI makes it run the way 앱 열기 knows, rather than me typing a command. */}
            {unknown && onAskFix && (
              <Button variant="primary" onClick={() => onAskFix(m.setupRequest)}>
                {m.askSetup}
              </Button>
            )}
            {(!unknown || onAskFix) && (
              <Button variant={(failed || unknown) && onAskFix ? undefined : 'primary'} disabled={busy} onClick={open}>
                {failed || unknown ? m.openAgain : m.openApp}
              </Button>
            )}
          </div>
        </div>
      )}
      <details
        open={advanced}
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
        className="text-body text-fg-muted"
      >
        <summary className="cursor-pointer text-meta">{m.advanced}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void start().catch(() => {});
            }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-meta text-fg-muted">
              {m.command}
              <Input
                value={command}
                onChange={(event) => {
                  setCommand(event.target.value);
                  actions.start.reset();
                }}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-fg-muted">
              {m.port}
              <Input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(event) => {
                  setPort(event.target.value);
                  actions.start.reset();
                }}
                required
              />
            </label>
            <Button type="submit" disabled={busy || !command.trim()}>
              {m.start}
            </Button>
          </form>
          {conflict && (
            <div role="alert" className="rounded-lg border border-line bg-canvas-raised p-3 text-body text-fg">
              <p>{m.conflict}</p>
              <p className="text-meta text-fg-muted">
                :{conflict.port} {conflict.cwd}
              </p>
              {conflict.canReuse ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    void start(true).catch(() => {});
                  }}
                >
                  {m.reuse}
                </Button>
              ) : (
                <p>{m.unrelated}</p>
              )}
            </div>
          )}
          {(error ?? actions.open.error) && (
            <p role="alert" className="font-mono text-meta break-words text-danger">
              {(error ?? actions.open.error)!.message}
            </p>
          )}
          {servers.data?.servers.length === 0 && <p className="text-meta text-fg-muted">{m.empty}</p>}
          <div className="flex flex-wrap gap-2">
            {servers.data?.servers.map((server) => (
              <Button key={server.id} onClick={() => setSelected(server.id)} aria-pressed={current?.id === server.id}>
                :{server.port} · {m[server.status]}
              </Button>
            ))}
          </div>
          {current && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-body text-fg">
                <span className="font-mono text-meta">
                  {current.command} · {m[current.status]}
                </span>
                {!current.external && (
                  <Button
                    disabled={busy || current.status === 'stopping'}
                    onClick={() => actions.restart.mutate(current.id)}
                  >
                    {m.restart}
                  </Button>
                )}
              </div>
              <h3 className="text-meta font-medium text-fg">{m.logs}</h3>
              <pre className="min-h-32 overflow-auto rounded-lg border border-line bg-canvas-sunken p-3 font-mono text-meta whitespace-pre-wrap text-fg">
                {current.external ? m.externalLogs : logs.data?.text || m.noLogs}
              </pre>
            </>
          )}
        </div>
      </details>
    </section>
  );
}
