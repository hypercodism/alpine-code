import type { Person, TreePromise } from './flowTreeModel';
import { SKETCH_FONTS, type PlanLook } from './planThemes';

/**
 * A map drawn before the product exists, to plan it: the same people, journeys and promises as the map of a built
 * product, with a sketch of every screen instead of a capture. The person shapes it by answering the AI's questions,
 * one at a time; once nothing is left to decide the AI builds it on its own, in whatever order it sees fit. The map
 * then changes only on facts: a screen captured from the running app takes its sketch's place, a promise is ticked
 * when it was checked.
 */

export interface PlanCard {
  id: string;
  title: string;
  /** The screen as the AI drew it: HTML drawn with the theme tokens only, so a look restyles it (`planThemes`). */
  sketch: string;
  /** One short line under the title: what was decided, e.g. "마크다운", or "AI가 정함". */
  note?: string;
  /** A step that depends on a question still open: drawn dashed until it is answered. */
  maybe?: boolean;
  promises: TreePromise[];
  /** The screen captured from the running app, drawn the same way as a sketch; once there, it takes the sketch's place. */
  capture?: string;
  /**
   * A question about the product that came up while building. The AI answered it with its own pick so the work goes
   * on; the person may pick another whenever they like.
   */
  decided?: { question: PlanQuestion; picked: number };
}

export interface Plan {
  product: string;
  people: Person[];
  cards: Record<string, PlanCard>;
}

export interface PlanOption {
  label: string;
  /** Why someone might pick it, in a few words. */
  detail?: string;
  /** The AI's pick: shown first and marked. */
  recommended?: boolean;
  /** For "how should it look": the look this option is. */
  look?: PlanLook;
  /** What picking it changes on the map. */
  apply?: (plan: Plan) => Plan;
}

export interface PlanQuestion {
  id: string;
  /** The card it changes, outlined while it is asked; `null` when it is about the whole product. */
  about: string | null;
  text: string;
  options: PlanOption[];
}

export type PlanPhase = 'drawing' | 'asking' | 'ready' | 'building' | 'built';

/** What the AI is doing right now while building, in its words, and the cards that work touches. */
export interface PlanActivity {
  text: string;
  touching: string[];
}

/** One thing that happens while building, after `wait` ms: what the AI starts doing, and what it changed. */
export interface PlanBuildStep {
  wait: number;
  activity: PlanActivity | null;
  change?: (plan: Plan) => Plan;
}

/** A promise that is planned: nothing is built to check it against yet. */
export const planned = (id: string, then: string): TreePromise => ({
  id,
  when: '',
  then,
  status: 'planned',
  note: '',
  checkedAt: null,
});

/** A sketch's body as a whole page, with every look's fonts and the page's ground and ink from the theme. */
export const sketchPage = (body: string) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8">${SKETCH_FONTS}</head>` +
  `<body class="bg-page text-ink font-body antialiased">${body}</body></html>`;

/** The cards of the map in reading order: person by person, journey by journey, step by step. */
export const planOrder = (plan: Plan) =>
  plan.people.flatMap((person) => person.journeys.flatMap((journey) => journey.steps)).filter((id) => plan.cards[id]);

/** Changes one card. */
export const withCard = (plan: Plan, id: string, change: (card: PlanCard) => PlanCard): Plan => {
  const card = plan.cards[id];
  return card ? { ...plan, cards: { ...plan.cards, [id]: change(card) } } : plan;
};

/** Sets where one promise of a card stands, with the check's own sentence. */
export const withPromise = (
  plan: Plan,
  cardId: string,
  promiseId: string,
  status: TreePromise['status'],
  note = '',
): Plan =>
  withCard(plan, cardId, (c) => ({
    ...c,
    promises: c.promises.map((p) => (p.id === promiseId ? { ...p, status, note } : p)),
  }));

/** Sets every promise of a card at once. */
export const withPromises = (plan: Plan, cardId: string, status: TreePromise['status']): Plan =>
  withCard(plan, cardId, (c) => ({ ...c, promises: c.promises.map((p) => ({ ...p, status, note: '' })) }));

/** Takes a step off the map: out of every journey and out of the cards. */
export const withoutCard = (plan: Plan, id: string): Plan => {
  const cards = { ...plan.cards };
  delete cards[id];
  return {
    ...plan,
    cards,
    people: plan.people.map((person) => ({
      ...person,
      journeys: person.journeys.map((journey) => ({ ...journey, steps: journey.steps.filter((s) => s !== id) })),
    })),
  };
};

/** Only the first `count` cards in reading order, as the map looks while it is still being drawn. */
export function drawnSoFar(plan: Plan, count: number): Plan {
  const shown = new Set(planOrder(plan).slice(0, count));
  return {
    ...plan,
    cards: Object.fromEntries(Object.entries(plan.cards).filter(([id]) => shown.has(id))),
    people: plan.people
      .map((person) => ({
        ...person,
        journeys: person.journeys
          .map((journey) => ({ ...journey, steps: journey.steps.filter((id) => shown.has(id)) }))
          .filter((journey) => journey.steps.length > 0),
      }))
      .filter((person) => person.journeys.length > 0),
  };
}

/**
 * One request and the work it led to, as the map keeps it: what used to be a conversation of its own. It sits under
 * the cards it touched; a request that touched none is kept with the map as a whole.
 */
export interface RecordThread {
  id: string;
  /** The request in the person's words. */
  title: string;
  at: string;
  cards: string[];
  steps: RecordStep[];
}

export interface RecordStep {
  at: string;
  /** Who said or did it: the person, the AI, or a check of a promise and how it ended. */
  kind: 'me' | 'ai' | 'passed' | 'failed';
  text: string;
  /** The cards this step was about, when not all of the thread's. */
  cards?: string[];
  /** What it changed or ran, for whoever wants to look: files and commands. */
  detail?: string[];
}

/** The steps of a thread that were about `cardId`. */
export const stepsFor = (thread: RecordThread, cardId: string) =>
  thread.steps.filter((step) => (step.cards ?? thread.cards).includes(cardId));
