import { useSessions } from '@/shared/server';

/**
 * Whether the AI is at work anywhere right now: a conversation, a map drawing or planning, or a build, running or
 * waiting on an answer. Restarting or quitting would stop it, so those ask first.
 */
export function useWorkRunning(): boolean {
  return (useSessions().data ?? []).some((s) => !s.archived && (s.status === 'running' || s.status === 'waiting'));
}
