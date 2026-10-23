import type { ToolCallItem } from '@alpine/protocol';

import type { Item } from '@/shared/server';

/** The tool the agent asks me a product question with. It does not wait: my answer is my next message. */
export const ASK_USER = 'ask_user';

/** The values behind the tokens a page draws with (`bg-page`, `text-ink`, `font-display`...; see `HtmlFrame`). */
export interface Look {
  page: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  on_accent: string;
  display: string;
  body: string;
  radius: string;
}

const LOOK_KEYS = ['page', 'surface', 'ink', 'muted', 'line', 'accent', 'on_accent', 'display', 'body', 'radius'];

export interface QuestionOption {
  label: string;
  /** Why someone might pick it, in a short sentence; may be empty. */
  detail: string;
  /** A page showing what picking it would be like; empty when it has none. */
  html: string;
  look: Look | null;
}

export interface Question {
  text: string;
  /** The AI's pick first. */
  options: [QuestionOption, ...QuestionOption[]];
  /** The map card the answer changes, if it is about one. */
  about: string | null;
}

/** A look as the CSS that sets the token variables, for `HtmlFrame`'s `theme`. */
export const lookCss = (look: Look) =>
  `:root{${LOOK_KEYS.map((key) => `--${key.replace('_', '-')}:${look[key as keyof Look]}`).join(';')}}`;

function readLook(value: unknown): Look | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return LOOK_KEYS.every((key) => typeof record[key] === 'string') ? (record as unknown as Look) : null;
}

/** What the agent asked; `null` when the call's arguments are not a question. */
export function readQuestion(call: Pick<ToolCallItem, 'args'>): Question | null {
  const { question, options, about } = call.args;
  if (typeof question !== 'string' || !Array.isArray(options)) return null;
  const read = options.flatMap((o: unknown): QuestionOption[] => {
    if (typeof o !== 'object' || o === null) return [];
    const { label, detail, html, look } = o as Record<string, unknown>;
    if (typeof label !== 'string' || !label.trim()) return [];
    return [
      {
        label: label.trim(),
        detail: typeof detail === 'string' ? detail : '',
        html: typeof html === 'string' ? html : '',
        look: readLook(look),
      },
    ];
  });
  const [first, ...rest] = read;
  if (!first) return null;
  return { text: question, options: [first, ...rest], about: typeof about === 'string' && about ? about : null };
}

/**
 * The page each option shows: its own, else the first one any option drew (one page drawn once, worn in every
 * look). Empty when no option drew one.
 */
export const pageOf = (question: Question, option: QuestionOption) =>
  option.html || question.options.find((o) => o.html)?.html || '';

/**
 * How I answered: the first message I sent after the call. `picked` is the option it is, if it is one; any other
 * message answered in my own words.
 */
export function answerTo(items: Item[], call: ToolCallItem, question: Question) {
  const reply = items.slice(items.indexOf(call) + 1).find((item) => item.kind === 'user_message');
  if (reply?.kind !== 'user_message') return null;
  return { picked: question.options.find((o) => o.label === reply.text.trim()) ?? null };
}
