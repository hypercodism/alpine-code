import type { CardDecision, FlowGetResult, MapLook, ToolCallItem } from '@alpine/protocol';

import { ASK_USER, lookCss, pageOf, readQuestion } from '@/shared/questions';
import { toolKind } from '@/shared/tool-calls';
import type { Item } from '@/shared/server';

import type { TreeMap } from './flowTreeModel';
import type { Plan, PlanActivity, PlanCard, PlanPhase, PlanQuestion } from './planModel';
import type { PlanLook } from './planThemes';

/**
 * A planned map from what the server sends for it: the people and steps of the person-first tree, each step with the
 * screen the AI drew (`screens/<card>.html`), the promises it assumed and the product questions answered on it. The
 * latest answer the person gave is the card's note; the latest one the AI took on its own is its decision to review.
 */
export function toPlan(result: FlowGetResult, tree: TreeMap): Plan {
  const cards: Record<string, PlanCard> = {};
  for (const node of result.document?.nodes ?? []) {
    const decisions = node.decisions ?? [];
    const mine = decisions.filter((d) => d.by !== 'ai').at(-1);
    const ai = decisions.filter((d) => d.by === 'ai').at(-1);
    cards[node.id] = {
      id: node.id,
      title: node.title,
      sketch: result.screens?.[node.id] ?? '',
      note: mine?.answer,
      maybe: !!node.tentative,
      promises: tree.cards[node.id]?.promises ?? [],
      capture: result.previews?.[node.id] ? `<img src="${result.previews[node.id]}" class="w-full">` : undefined,
      decided: ai ? decidedBy(ai, node.id) : undefined,
    };
  }
  return { product: tree.product, people: tree.people, cards };
}

function decidedBy(decision: CardDecision, cardId: string): PlanCard['decided'] {
  const labels = decision.options?.length ? decision.options : [decision.answer];
  const picked = Math.max(labels.indexOf(decision.answer), 0);
  return {
    question: {
      id: `decided:${cardId}`,
      about: cardId,
      text: decision.question,
      options: labels.map((label) => ({ label })),
    },
    picked,
  };
}

/** The look the planned screens wear, as theme CSS. */
export const mapLook = (look: MapLook): PlanLook => ({
  id: 'map',
  css: lookCss({ ...look, on_accent: look.onAccent }),
});

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
        look: option.look ? { id: `${call.id}:${i}`, css: lookCss(option.look) } : undefined,
      })),
    },
    sample: pageOf(asked, asked.options[0]),
  };
}

/**
 * Where the plan stands, from facts only: the AI drawing the first map, asking (a question waits, the AI is changing
 * the map, or decisions are still open), ready once nothing is left, building while the build's session works, built
 * once it ended (the done line then says how many promises were checked).
 */
export function planPhase(plan: Plan, result: FlowGetResult, working: boolean, asking: boolean): PlanPhase {
  const nodes = result.document?.nodes ?? [];
  if (result.build === 'running') return 'building';
  if (result.build === 'ended') return 'built';
  if (!nodes.length) return working ? 'drawing' : 'asking';
  if (asking || working || (result.undecided?.length ?? 0) > 0 || !Object.keys(plan.cards).length) return 'asking';
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
