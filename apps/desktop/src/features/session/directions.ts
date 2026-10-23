import type { ToolCallItem } from '@alpine/protocol';

import type { Item } from '@/shared/server';

/** The tool the agent shows ways a new app could look with, for me to pick one. */
export const PROPOSE_DIRECTIONS = 'propose_directions';

/** One way the app could look: its name, what it is like, the site it takes after and a page drawn in that look. */
export interface Direction {
  title: string;
  summary: string;
  /** The site it takes after, e.g. "Medium". */
  reference: string;
  /** The page as HTML, drawn with Tailwind classes. */
  html: string;
}

/** What the agent asks and the ways it drew; `null` when the call's arguments are not that. */
export function readDirections(call: ToolCallItem): { question: string; options: [Direction, ...Direction[]] } | null {
  const { question, options } = call.args;
  if (!Array.isArray(options)) return null;
  const valid = options.filter(
    (o): o is Direction =>
      typeof o === 'object' &&
      o !== null &&
      typeof (o as Direction).title === 'string' &&
      typeof (o as Direction).html === 'string',
  );
  const [first, ...rest] = valid.map((o) => ({
    title: o.title.trim(),
    summary: typeof o.summary === 'string' ? o.summary : '',
    reference: typeof o.reference === 'string' ? o.reference : '',
    html: o.html,
  }));
  if (!first) return null;
  return { question: typeof question === 'string' ? question : '', options: [first, ...rest] };
}

/**
 * How I answered: the first message I sent after the call. `picked` is the way it names, if it names one; a message
 * that names none answered in my own words.
 */
export function answerTo(items: Item[], call: ToolCallItem, options: Direction[]) {
  const after = items.slice(items.indexOf(call) + 1);
  const reply = after.find((item) => item.kind === 'user_message');
  if (!reply || reply.kind !== 'user_message') return null;
  return { picked: options.find((o) => reply.text.includes(o.title)) ?? null };
}
