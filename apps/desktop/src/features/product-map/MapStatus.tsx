import clsx from 'clsx';
import { useMessages } from '@/shared/i18n';
import { useProductMap, useSessions } from '@/shared/server';

import { useMapTalk } from './mapTalk';
import { planPhase } from './planData';
import { planMessages } from './planMessages';

/** Where a project's map stands, in one word: its plan's stage, or the work going on in it. */
export type MapStatus = 'planning' | 'building' | 'waiting' | 'stopped' | 'built' | 'working';

/**
 * The map's state from facts: the AI waiting on me (an OK, an answer, a TF's yes) first; then for a plan, its stage
 * (planned, being built, stopped, built); then any other work in the project. `null` for a map at rest that is not a
 * plan.
 */
export function useMapStatus(cwd: string): MapStatus | null {
  const board = useProductMap(cwd).data;
  const sessions = (useSessions().data ?? []).filter((s) => s.cwd === cwd && !s.archived);
  const { buildState } = useMapTalk(cwd);
  if (sessions.some((s) => s.status === 'waiting')) return 'waiting';
  const working = sessions.some((s) => s.status === 'running');
  if (!board?.planned) return working ? 'working' : null;
  const phase = planPhase(board, false, false, buildState);
  if (phase === 'team') return 'waiting';
  if (phase === 'building') return 'building';
  if (phase === 'stopped' || phase === 'built') return working ? 'working' : phase;
  return 'planning';
}

const dots: Record<MapStatus, string> = {
  planning: 'bg-interactive',
  building: 'bg-interactive animate-pulse motion-reduce:animate-none',
  working: 'bg-interactive animate-pulse motion-reduce:animate-none',
  waiting: 'bg-attention',
  stopped: 'bg-fg-faint',
  built: 'bg-fg-faint',
};

/**
 * The map's state as a dot and a word, for the top bar, while something is going on: planned, being built, waiting on
 * me, stopped. Once built it says nothing: what is broken shows over the app, and counts of promises to check again
 * read as broken to the people the app is for (app-first).
 */
export function MapStatusWord({ cwd, className }: { cwd: string; className?: string }) {
  const t = useMessages(planMessages);
  const status = useMapStatus(cwd);
  if (!status || status === 'built') return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 text-meta whitespace-nowrap',
        status === 'waiting' ? 'text-fg' : 'text-fg-muted',
        className,
      )}
    >
      <span aria-hidden="true" className={clsx('size-1.5 rounded-full', dots[status])} />
      {t[`status_${status}`]}
    </span>
  );
}
