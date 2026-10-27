import type { BoardLayout } from './boardLayout';
import {
  hasScreenArea,
  STATUS_ORDER,
  type Journey,
  type Person,
  type PromiseStatus,
  type TreeCard,
  type TreeMap,
  type TreePromise,
} from './flowTreeModel';

/** A decision as the document lists it: once, with every screen that carries it. */
export interface DocDecision {
  answer: string;
  question: string;
  cards: TreeCard[];
}

/**
 * What the 문서 says, read from the board: the people, their journeys, the cards in the board's reading order, every
 * promise worst first, how many stand each way, and each decision once. The tab, its Markdown and its PDF all read it,
 * so the three never say different things.
 */
export interface DocContent {
  people: Person[];
  journeys: Journey[];
  /** Each card's own journey: the first that walks it, where the board draws it, and so the frame it wears. */
  homes: Map<string, Journey>;
  promises: { card: TreeCard; promise: TreePromise }[];
  statuses: { status: PromiseStatus; count: number }[];
  decisions: DocDecision[];
  /** How many cards have a screen. */
  screens: number;
}

export function readDocument(map: TreeMap, layout: BoardLayout): DocContent {
  const people = map.people.filter((person) => person.journeys.some((journey) => journey.steps.length));
  const homes = new Map<string, Journey>();
  for (const person of people)
    for (const journey of person.journeys)
      for (const step of journey.steps) if (!homes.has(step)) homes.set(step, journey);
  // Cards in the board's reading order: lane by lane, row by row, left to right.
  const ordered = Object.values(layout.nodes)
    .sort((a, b) => a.rowY - b.rowY || a.x - b.x)
    .map((node) => map.cards[node.id])
    .filter((card): card is TreeCard => !!card);
  // Worst first (broken, then to check again, … confirmed last); the board's order holds within each status.
  const promises = ordered
    .flatMap((card) => card.promises.map((promise) => ({ card, promise })))
    .sort((a, b) => STATUS_ORDER.indexOf(a.promise.status) - STATUS_ORDER.indexOf(b.promise.status));
  const statuses = STATUS_ORDER.map((status) => ({
    status,
    count: promises.filter((one) => one.promise.status === status).length,
  })).filter((one) => one.count > 0);
  // A decision several screens carry (the same answer to the same question) is listed once, naming each of its screens.
  const decisions: DocDecision[] = [];
  for (const card of ordered)
    for (const found of [
      ...(card.decision ? [{ answer: card.decision, question: '' }] : []),
      ...(card.picks ?? []).map((pick) => ({ answer: pick.answer, question: pick.question })),
    ]) {
      const same = decisions.find(
        (decision) => decision.answer === found.answer && decision.question === found.question,
      );
      if (!same) decisions.push({ ...found, cards: [card] });
      else if (!same.cards.includes(card)) same.cards.push(card);
    }
  return {
    people,
    journeys: people.flatMap((person) => person.journeys.filter((journey) => journey.steps.length)),
    homes,
    promises,
    statuses,
    decisions,
    screens: ordered.filter((card) => hasScreenArea(card)).length,
  };
}

export const mark = (status: PromiseStatus) => (status === 'passed' ? '✓' : status === 'failed' ? '✗' : '○');
