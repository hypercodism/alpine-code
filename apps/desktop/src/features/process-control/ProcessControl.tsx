import type { TerminalProcess } from '@alpine/protocol';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';

import { useMessages } from '@/shared/i18n';
import { useServer } from '@/shared/server';
import { useDevelopmentServers } from '@/shared/server/devServers';

import { messages } from './messages';

// eslint-disable-next-line no-control-regex -- the escape character is what it looks for
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
/** A line that reads as an error in a dev server's or a tool's output. */
const ERROR_LINE = /error|✘|✗|failed|exception|ERR!|panic/i;

/** The commands the project's work started, running ones first in time order: one query, shared with the rail's count. */
export function useCommands(cwd: string, sessionId?: string) {
  const server = useServer();
  return useQuery({
    queryKey: ['processes', cwd, sessionId, 'command'],
    queryFn: () => server.request('processes/list', { cwd, sessionId, kind: 'command' }),
    refetchInterval: 750,
    retry: false,
  });
}

/**
 * 명령 (2e ③): what the AI or Alpine started (a dev server, a test run), with the end of its output, so a failing one
 * can go to the AI as it is. What I typed is in 터미널; what was started outside Alpine cannot be seen, and it says so.
 * `renderHeader` puts the count and 모두 멈추기 in the place's header instead of a row of its own.
 */
export function ProcessControl({
  cwd,
  sessionId,
  onInspectProcess,
  onAskAI,
  renderHeader,
}: {
  cwd: string;
  sessionId?: string;
  onInspectProcess?: (id: string) => void;
  /** Hands an output to the AI to fix (the map's conversation). */
  onAskAI?: (text: string) => void;
  renderHeader?: (count: ReactNode, actions: ReactNode) => ReactNode;
}) {
  const t = useMessages(messages);
  const server = useServer();
  const client = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const query = useCommands(cwd, sessionId);
  const servers = useDevelopmentServers(cwd).data?.servers ?? [];
  const processes = [...(query.data?.processes ?? [])]
    .filter((p) => p.kind !== 'shell')
    .sort((a, b) => b.createdAt - a.createdAt);
  const running = processes.filter((p) => p.status === 'running' || p.status === 'stopping').length;
  const remaining = processes.some((p) => p.status === 'stopping');
  const stop = async (id?: string, force = false) => {
    setPending(id ?? 'all');
    setError('');
    try {
      if (id) {
        await server.request('terminals/stop', { processId: id, force });
      } else {
        if (sessionId) await server.request('session/cancel', { sessionId });
        await server.request('processes/stop', { cwd, sessionId, force, kind: 'command' });
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ['processes', cwd, sessionId] }),
        client.invalidateQueries({ queryKey: ['terminals', cwd] }),
      ]);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(null);
    }
  };
  const count = <span className="text-meta text-fg-muted">{t.count(running)}</span>;
  const actions = (
    <button
      type="button"
      disabled={!running || pending !== null}
      onClick={() => void stop()}
      className="shrink-0 cursor-pointer rounded-md border border-line px-2.5 py-1 text-meta text-fg hover:bg-hover disabled:cursor-default disabled:opacity-50"
    >
      {t.stopAll}
    </button>
  );
  return (
    <section aria-label={t.title} className="flex min-h-0 grow flex-col">
      {renderHeader ? (
        renderHeader(count, actions)
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4">
          {count}
          {actions}
        </div>
      )}
      <div className="flex min-h-0 grow flex-col gap-3 overflow-auto p-4">
        {remaining && (
          <p role="status" className="rounded-lg border border-line p-3 text-meta text-danger">
            {t.remaining}
          </p>
        )}
        {pending && (
          <p role="status" className="text-meta text-fg-muted">
            {t.waiting}
          </p>
        )}
        {!processes.length && !query.isPending && <p className="text-body text-fg-muted">{t.empty}</p>}
        {processes.map((p) => (
          <Command
            key={p.id}
            process={p}
            address={servers.find((each) => each.processId === p.id)?.url ?? null}
            asked={query.dataUpdatedAt}
            pending={pending !== null}
            onStop={(force) => void stop(p.id, force)}
            onInspect={onInspectProcess && (() => onInspectProcess(p.id))}
            onAskAI={onAskAI}
          />
        ))}
        {(error || query.error) && (
          <p role="alert" className="text-meta text-danger">
            {error || query.error?.message}
          </p>
        )}
        <p className="text-meta text-fg-muted">{t.elsewhere}</p>
      </div>
    </section>
  );
}

function Command({
  process: p,
  address,
  asked,
  pending,
  onStop,
  onInspect,
  onAskAI,
}: {
  process: TerminalProcess;
  address: string | null;
  /** When the list was last asked for, in milliseconds. */
  asked: number;
  pending: boolean;
  onStop: (force: boolean) => void;
  onInspect?: () => void;
  onAskAI?: (text: string) => void;
}) {
  const t = useMessages(messages);
  const server = useServer();
  const live = p.status === 'running' || p.status === 'stopping';
  const failed = p.status === 'failed' || (p.exitCode != null && p.exitCode !== 0);
  // The end of the output: enough lines to see what it is doing, or why it stopped.
  const tail = useQuery({
    queryKey: ['process-tail', p.id, p.outputSize],
    queryFn: () =>
      server.request('terminals/read', { processId: p.id, offset: Math.max(0, p.outputSize - 4000), limit: 4000 }),
    enabled: p.outputSize > 0 && (live || failed),
    retry: false,
    staleTime: Infinity,
  });
  const lines = stripAnsi(tail.data?.text ?? '')
    .split(/\r?\n/)
    .map((line) => line.split('\r').pop() ?? '')
    .filter((line) => line.trim())
    .slice(-6);
  const errored = failed || lines.some((line) => ERROR_LINE.test(line));
  // Read when the list was last asked for (every 750 ms), so the minutes move on without a clock of their own.
  const minutes = Math.max(0, Math.floor((asked / 1000 - p.createdAt) / 60));
  const when = p.status === 'running' ? t.since(minutes) : t[p.status];
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          aria-hidden="true"
          className={clsx(
            'size-2 shrink-0 rounded-full',
            live ? 'bg-avatar-1-ink' : failed ? 'bg-danger' : 'bg-fg-faint',
          )}
        />
        {/* Alpine starts a dev server as `export PORT=n; <command>`: the command is what I would type. */}
        <strong className="min-w-0 font-mono text-body font-medium break-all text-fg">
          {p.command.replace(/^export PORT=\d+; /, '')}
        </strong>
      </div>
      <p className="flex flex-wrap gap-x-1.5 text-meta text-fg-muted">
        {/* A dev server's address says what it is; any other command keeps the name it was started with. */}
        {p.title !== p.command && !address && <span className="text-fg">{p.title}</span>}
        <span>{p.sessionId ? t.byAI : t.byAlpine}</span>
        <span aria-hidden="true">·</span>
        <span>{when}</span>
        {p.exitCode != null && t.exitCode(p.exitCode) && (
          <>
            <span aria-hidden="true">·</span>
            <span>{t.exitCode(p.exitCode)}</span>
          </>
        )}
      </p>
      {address && live && <p className="text-meta text-fg-muted">{t.address(address.replace(/^https?:\/\//, ''))}</p>}
      {lines.length > 0 && (
        <pre className="overflow-x-auto rounded-md bg-canvas-sunken px-2 py-1.5 font-mono text-meta whitespace-pre">
          {lines.map((line, index) => (
            <div key={index} className={ERROR_LINE.test(line) ? 'text-danger' : 'text-fg'}>
              {line}
            </div>
          ))}
        </pre>
      )}
      <div className="flex flex-wrap items-center gap-2 text-meta">
        {onAskAI && errored && lines.length > 0 && (
          <button
            type="button"
            onClick={() => onAskAI(t.askAI(p.command, lines.join('\n')))}
            className="cursor-pointer rounded-md border border-line px-2.5 py-1 text-fg hover:bg-hover"
          >
            {t.showAI}
          </button>
        )}
        {onInspect && (
          <button type="button" onClick={onInspect} className="cursor-pointer px-1 text-interactive">
            {t.output}
          </button>
        )}
        <span className="grow" />
        {p.status === 'running' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onStop(false)}
            className="cursor-pointer rounded-md border border-line px-2.5 py-1 text-danger hover:bg-hover disabled:opacity-50"
          >
            {t.stop}
          </button>
        )}
        {p.status === 'stopping' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onStop(true)}
            className="cursor-pointer rounded-md border border-line px-2.5 py-1 text-danger hover:bg-hover disabled:opacity-50"
          >
            {t.force}
          </button>
        )}
      </div>
      {p.stopError && (
        <p role="alert" className="text-meta text-danger">
          {p.stopError}
        </p>
      )}
    </article>
  );
}
