import type { FlowGetResult, RunStoppedItem, ToolCallItem } from '@alpine/protocol';

import { ASK_USER, lookCss, pageOf, readQuestion } from '@/shared/questions';
import type { Item } from '@/shared/server';
import { toolKind } from '@/shared/tool-calls';

import type { TreeMap } from './flowTreeModel';
import type { PlanOpenPromise } from './PlanBar';

/** A question about the product, as the map shows it above its input. */
export interface PlanQuestion {
  id: string;
  /** The card it changes, outlined while it is asked; `null` when it is about the whole product. */
  about: string | null;
  text: string;
  options: PlanOption[];
}

export interface PlanOption {
  label: string;
  /** Why someone might pick it, in a few words. */
  detail?: string;
  /** The AI's pick: shown first and marked. */
  recommended?: boolean;
  /** For "how should it look": the look this option is, as theme CSS. */
  look?: string;
}

/**
 * `team`: the build's TF waits for the person: proposed (its yes) or over (it needs more agents than planned).
 * `stopped`: the build is over with cards left to build.
 */
export type PlanPhase = 'drawing' | 'asking' | 'ready' | 'building' | 'team' | 'built' | 'stopped';

/** How the build's own conversation stands: whether it works now, and the state of its latest TF. */
export interface BuildState {
  working: boolean;
  team: string | null;
  /**
   * The map's own conversation took the product up after the build last worked (a fix asked once it was built): the
   * cards it marks as being made are its work, not a build that stopped halfway.
   */
  taken?: boolean;
}

/** A TF that is still at work (or finishing), so the conversation that started it is not done. */
export const TEAM_WORKING = new Set(['running', 'over', 'stopping']);

/** What the AI is doing right now while building, in its words, and the cards that work touches. */
export interface PlanActivity {
  text: string;
  touching: string[];
}

/**
 * The question the AI asked last in the map's conversation, while I have not answered it: its options with the AI's
 * pick first, and for a look the look each option is. `sample` is the screen the looks are shown on.
 */
export function pendingQuestion(items: Item[]): { question: PlanQuestion; sample: string } | null {
  const index = items.findLastIndex((item) => item.kind === 'tool_call' && item.name === ASK_USER);
  if (index < 0 || items.slice(index + 1).some((item) => item.kind === 'user_message')) return null;
  const call = items[index] as ToolCallItem;
  if (call.status !== 'done') return null;
  const asked = readQuestion(call);
  if (!asked) return null;
  return {
    question: {
      id: call.id,
      about: asked.about,
      text: asked.text,
      options: asked.options.map((option, i) => ({
        label: option.label,
        detail: option.detail || undefined,
        recommended: i === 0,
        look: option.look ? lookCss(option.look) : undefined,
      })),
    },
    sample: pageOf(asked, asked.options[0]),
  };
}

/**
 * Where the plan stands, from facts only: the AI drawing the first map, asking (a question waits, the AI is changing
 * the map, or decisions are still open), ready once nothing is left. Once built, it follows the build's conversation
 * and its TF: building while either works, `team` while a TF waits for the person (its yes, or more agents), and
 * once both are quiet, built when every card is, else stopped.
 */
export function planPhase(
  result: FlowGetResult,
  working: boolean,
  asking: boolean,
  build: BuildState = { working: false, team: null },
): PlanPhase {
  const nodes = result.document?.nodes ?? [];
  if (result.build !== 'none' && result.build !== undefined) {
    if ((build.team === 'proposed' && !build.working) || build.team === 'over') return 'team';
    if (result.build === 'running' || build.working || (build.team && TEAM_WORKING.has(build.team))) return 'building';
    if (build.taken) return 'built';
    return nodes.length && nodes.every((node) => node.phase === 'built') ? 'built' : 'stopped';
  }
  if (!nodes.length) return working ? 'drawing' : 'asking';
  if (asking || working || (result.undecided?.length ?? 0) > 0) return 'asking';
  return 'ready';
}

/** How the activity line names what the AI does. */
export interface ActivityWords {
  onCard: (title: string) => string;
  editing: string;
  running: string;
  reading: string;
  thinking: string;
}

/** How many of the run's latest edits show their cards as being worked on. */
const RECENT_EDITS = 3;

/** The card a path belongs to: one whose sources include it, or the card's own map file or screen. */
function cardOf(path: string, nodes: NonNullable<FlowGetResult['document']>['nodes']): string | null {
  const own = /\.alpine-code\/map\/(?:features\/([\w-]+)\.json|screens\/([\w-]+)\.html)$/.exec(path);
  if (own) return own[1] ?? own[2] ?? null;
  const at = (source: string) => path === source || path.endsWith(`/${source.replace(/^\.\//, '')}`);
  return (nodes ?? []).find((node) => (node.sources ?? []).some(at))?.id ?? null;
}

/**
 * What the AI is doing now while it builds, from its own tool calls in the run under way: the card its latest call is
 * about (by the file it names), else the kind of work; and the cards its latest edits touched. `null` before the run
 * has done anything.
 */
export function buildActivity(items: Item[], result: FlowGetResult, words: ActivityWords): PlanActivity | null {
  const start = items.findLastIndex((item) => item.kind === 'user_message');
  const calls = items.slice(start + 1).filter((item): item is ToolCallItem => item.kind === 'tool_call');
  const nodes = result.document?.nodes ?? [];
  const title = (id: string | null) => (id ? (nodes.find((node) => node.id === id)?.title ?? null) : null);
  const pathOf = (call: ToolCallItem) => {
    const { path, file_path } = call.args;
    return typeof path === 'string' ? path : typeof file_path === 'string' ? file_path : null;
  };
  const touching = [
    ...new Set(
      calls
        .filter((call) => toolKind(call.name) === 'edit')
        .slice(-RECENT_EDITS)
        .flatMap((call) => {
          const path = pathOf(call);
          const card = path && cardOf(path, nodes);
          return card ? [card] : [];
        }),
    ),
  ];
  const last = calls.at(-1);
  if (!last) return null;
  const path = pathOf(last);
  const card = title(path && cardOf(path, nodes));
  const kind = toolKind(last.name);
  const text = card
    ? words.onCard(card)
    : kind === 'edit'
      ? words.editing
      : kind === 'run'
        ? words.running
        : kind === 'read' || kind === 'search'
          ? words.reading
          : words.thinking;
  return { text, touching };
}

/** Why the latest run of a conversation stopped on its own, when it did: the core's reason, after my last words. */
export function stopReason(items: Item[]): RunStoppedItem['reason'] | null {
  const start = items.findLastIndex((item) => item.kind === 'user_message');
  const stopped = items.slice(start + 1).findLast((item) => item.kind === 'run_stopped');
  return stopped?.kind === 'run_stopped' ? stopped.reason : null;
}

/**
 * The AI's last words in a conversation, once its turn is over: what it said after my last message, unless it ended
 * the turn with a question (which the map shows as a question). A turn that stopped before its end has no answer, only
 * why it stopped (`stopped`, with the stop's own id). `null` while there is none.
 */
export function lastReply(
  items: Item[],
): { id: string; text: string; stopped?: undefined } | { id: string; stopped: RunStoppedItem['reason'] } | null {
  const start = items.findLastIndex((item) => item.kind === 'user_message');
  if (start < 0) return null;
  const turn = items.slice(start + 1);
  const stop = turn.findLast((item) => item.kind === 'run_stopped');
  if (stop?.kind === 'run_stopped') return { id: stop.id, stopped: stop.reason };
  if (turn.some((item) => item.kind === 'tool_call' && item.name === ASK_USER)) return null;
  const reply = turn.findLast((item) => item.kind === 'agent_message' && !!item.text.trim());
  return reply?.kind === 'agent_message' ? { id: reply.id, text: reply.text.trim() } : null;
}

/**
 * The promises a built product still has open, as the completion card lists them and the top bar counts them: every
 * one not passed, broken when its last check failed (it stays broken while the AI works on its card).
 */
export function openPromises(map: TreeMap | null, board: FlowGetResult | undefined): PlanOpenPromise[] {
  return Object.values(map?.cards ?? {}).flatMap((card) =>
    card.promises
      .filter((promise) => promise.status !== 'passed')
      .map((promise) => {
        const failed = board?.states?.[card.id]?.promises?.[promise.id]?.status === 'failed';
        return {
          cardId: card.id,
          card: card.title,
          promiseId: promise.id,
          text: promise.then,
          note: failed ? promise.note : '',
          failed,
        };
      }),
  );
}
