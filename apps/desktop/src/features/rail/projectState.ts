import type { SessionInfo } from '@alpine/protocol';

export type ProjectState = 'attention' | 'asking' | 'building' | 'running' | null;

/**
 * The one word a project row says about its work (map-first 1), counting the map's own conversations: a question or a
 * failure waiting for me first, then a build of its plan, then any other work.
 */
export function projectState(sessions: SessionInfo[], asking: ReadonlySet<string>): ProjectState {
  if (sessions.some((s) => s.status === 'waiting' || s.status === 'failed')) return 'attention';
  if (sessions.some((s) => s.status === 'idle' && asking.has(s.id))) return 'asking';
  if (sessions.some((s) => s.purpose === 'build' && s.status === 'running')) return 'building';
  if (sessions.some((s) => s.status === 'running')) return 'running';
  return null;
}
