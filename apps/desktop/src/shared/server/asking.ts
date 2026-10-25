import { create } from 'zustand';

import { ASK_USER } from '@/shared/questions';

import type { Item } from './sessionState';

/**
 * The sessions whose AI asked me something and waits for my answer: its turn is over (idle), so its status alone
 * does not say it needs me. Known from the events of every session (`SessionStore` notes them) and from a session's
 * items whenever it is opened; a question asked while the app was closed is known once its session is opened.
 */
export const useAsking = create<{ ids: ReadonlySet<string> }>(() => ({ ids: new Set() }));

export function noteAsking(sessionId: string, asking: boolean) {
  const { ids } = useAsking.getState();
  if (ids.has(sessionId) === asking) return;
  const next = new Set(ids);
  if (asking) next.add(sessionId);
  else next.delete(sessionId);
  useAsking.setState({ ids: next });
}

/** Whether `items` end on a question I have not answered: an `ask_user` call that finished, with no message of mine after it. */
export function asksMe(items: readonly Item[]): boolean {
  const index = items.findLastIndex((item) => item.kind === 'tool_call' && item.name === ASK_USER);
  if (index < 0) return false;
  const call = items[index]!;
  return (
    call.kind === 'tool_call' &&
    call.status === 'done' &&
    !items.slice(index + 1).some((item) => item.kind === 'user_message')
  );
}

/** What an item that just started or finished says about a question waiting: asked, answered, or nothing. */
export function askingChange(item: Item, finished: boolean): boolean | null {
  if (item.kind === 'user_message') return false;
  if (finished && item.kind === 'tool_call' && item.name === ASK_USER && item.status === 'done') return true;
  return null;
}
