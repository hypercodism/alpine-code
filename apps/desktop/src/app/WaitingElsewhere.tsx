import { useNavigate, useRouterState } from '@tanstack/react-router';

import { useMessages } from '@/shared/i18n';
import { useProjects, useSessions, waitsForMe } from '@/shared/server';

import { messages } from './messages';

/**
 * A project whose AI waits for my OK, said on every other page (another project's map, settings, a conversation), with
 * the way to it: its map holds the cards above its input. On that project's map nothing is added.
 */
export function WaitingElsewhere() {
  const t = useMessages(messages);
  const navigate = useNavigate();
  const sessions = useSessions().data ?? [];
  const projects = useProjects().data?.projects ?? [];
  const here = useRouterState({
    select: (state) => (state.location.pathname === '/board' ? (state.location.search.project ?? null) : null),
  });
  const waiting = [
    ...new Set(
      sessions
        .filter((s) => !s.archived && s.cwd !== here && waitsForMe(s))
        .map((s) => s.cwd)
        .filter((cwd) => projects.some((p) => p.path === cwd && !p.archived)),
    ),
  ];
  if (!waiting.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-13 z-40 flex flex-col items-center gap-1.5">
      {waiting.map((cwd) => (
        <button
          key={cwd}
          type="button"
          onClick={() => void navigate({ to: '/board', search: { project: cwd } })}
          className="pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full border border-attention bg-canvas-raised px-3 py-1 text-meta text-fg shadow-overlay hover:bg-hover"
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-attention" />
          {t.waitingOn(projects.find((p) => p.path === cwd)?.name ?? cwd.split('/').pop() ?? cwd)}
          <span className="text-interactive">{t.waitingOpen}</span>
        </button>
      ))}
    </div>
  );
}
