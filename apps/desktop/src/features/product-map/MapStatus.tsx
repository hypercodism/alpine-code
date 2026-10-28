import clsx from 'clsx';
import { useMemo } from 'react';

import { useMessages } from '@/shared/i18n';
import { useProductMap, useSessions } from '@/shared/server';

import { toTreeMap } from './flowTreeData';
import { useMapTalk } from './mapTalk';
import { openPromises, planPhase } from './planData';
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

const NO_ONE = { ko: '', en: '' };
const NOTHING_WORKING: ReadonlySet<string> = new Set();

/**
 * The map's state as a dot and a word, for the top bar. Once built it says what the completion card says, counted the
 * same way: the promises to fix, else the ones to check again, and 다 만들었어요 only when none is open.
 */
export function MapStatusWord({ cwd, className }: { cwd: string; className?: string }) {
  const t = useMessages(planMessages);
  const status = useMapStatus(cwd);
  const board = useProductMap(cwd).data;
  const open = useMemo(
    () =>
      status === 'built' && board
        ? openPromises(toTreeMap(board, NOTHING_WORKING, '', { unnamed: NO_ONE, unnamedRole: NO_ONE }), board)
        : [],
    [status, board],
  );
  if (!status) return null;
  const broken = open.filter((promise) => promise.failed).length;
  const waiting = open.length - broken;
  const word = broken ? t.openToFix(broken) : waiting ? t.toRecheck(waiting) : t[`status_${status}`];
  const dot = broken ? 'bg-danger' : waiting ? 'bg-attention' : dots[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 text-meta whitespace-nowrap',
        broken ? 'text-danger' : waiting ? 'text-attention' : status === 'waiting' ? 'text-fg' : 'text-fg-muted',
        className,
      )}
    >
      <span aria-hidden="true" className={clsx('size-1.5 rounded-full', dot)} />
      {word}
    </span>
  );
}
