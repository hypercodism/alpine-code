import { boardSituations } from './boardSituations';
import type { Device } from './planLook';
import { hasScreenArea, isJourneyLink, type Journey, type Person, type TreeCard, type TreeMap } from './flowTreeModel';

/**
 * Where everything sits on the board (the map as one canvas, 10-27): a lane per person who uses the product, holding
 * their screens in the order they are walked, and between the first lane and the rest a band of what happens with no
 * screen (a message sent, someone told). Columns are shared by all lanes, so a screen that follows a step in another
 * lane stands under it, and arrows read left to right and down. Every card is drawn once, in the first lane that walks
 * it; every way between cards (a journey's edges, else step after step, a journey called by another) is one arrow.
 */

export type BoardNodeKind = 'phone' | 'computer' | 'system';

export interface BoardNode {
  id: string;
  kind: BoardNodeKind;
  /** The frame's box, in board pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where its row starts and how tall it is (title above the frame, caption under it). */
  rowY: number;
  /** "01", "02"...: screens in reading order, lane by lane. */
  number?: string;
  /** The lane and journey it is drawn in. */
  personId: string | null;
  journeyId: string | null;
  /** How wide its column is, when its situations are wider than its frame: arrows go down past them. */
  span?: number;
  /** Under a screen: its own situations, each a small screen (`boardSituations`). */
  situations?: BoardSituation[];
  /** Under a screen: the tray its situations sit in. */
  tray?: BoardSituation;
  /** Under a screen: where the list naming its common situations starts. */
  commonY?: number;
}

/** A situation drawn as a small screen under its screen: its frame's box, its name over it. */
export interface BoardSituation {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardEdge {
  from: string;
  to: string;
  label: string;
}

export interface BoardJourneyRow {
  journey: Journey;
  y: number;
  height: number;
  /** The strip of what has no screen under the row, when the journey has any. */
  band?: { y: number; height: number };
}

export interface BoardLane {
  kind: 'person';
  person: Person;
  y: number;
  height: number;
  rows: BoardJourneyRow[];
}

export interface BoardLayout {
  lanes: BoardLane[];
  nodes: Record<string, BoardNode>;
  edges: BoardEdge[];
  width: number;
  height: number;
}

/** The sizes the board is drawn at. */
export const BOARD = {
  pad: 28,
  laneHeader: 64,
  lanePad: 22,
  laneGap: 24,
  rowGap: 34,
  columnGap: 136,
  title: 24,
  caption: 96,
  /** A situation's small screen, two to a line under its screen; its name over it, a way back under it. */
  situation: { phone: { w: 96, h: 192 }, computer: { w: 184, h: 128 }, title: 22, foot: 20, gap: 12 },
  /** The tray the situations sit in: its heading over them, and its edge around them. */
  tray: { head: 26, pad: 10, gap: 12 },
  /** The list naming the common situations: its lead, then one line each. */
  common: { lead: 26, line: 20 },
  phone: { w: 168, h: 336 },
  computer: { w: 380, h: 264 },
  system: { w: 196, h: 52 },
  systemRow: 52,
} as const;

/** The ways a journey goes: its own edges when it has them, else each step to the next. */
function waysOf(journey: Journey): BoardEdge[] {
  if (journey.edges?.length) return journey.edges.map((edge) => ({ from: edge.from, to: edge.to, label: edge.label }));
  return journey.steps.slice(1).map((to, index) => ({ from: journey.steps[index]!, to, label: '' }));
}

/** Every way between cards on the board, a journey called by another going to its first step and back from its last. */
export function boardEdges(map: TreeMap): BoardEdge[] {
  const journeys = new Map(map.people.flatMap((person) => person.journeys).map((journey) => [journey.id, journey]));
  const end = (step: string, first: boolean): string | null => {
    if (!isJourneyLink(step)) return map.cards[step] ? step : null;
    const called = journeys.get(step.slice('flow:'.length));
    const steps = called?.steps.filter((one) => !isJourneyLink(one)) ?? [];
    return (first ? steps[0] : steps.at(-1)) ?? null;
  };
  const seen = new Map<string, BoardEdge>();
  for (const journey of journeys.values())
    for (const way of waysOf(journey)) {
      const from = end(way.from, false);
      const to = end(way.to, true);
      if (!from || !to || from === to) continue;
      const key = `${from}>${to}`;
      const known = seen.get(key);
      if (!known) seen.set(key, { from, to, label: way.label });
      else if (!known.label && way.label) known.label = way.label;
    }
  return [...seen.values()];
}

/**
 * How far along the walk each card is: the longest way to it from a card nothing leads to. A way back (a loop) is
 * left out, so it never pushes a card further right.
 */
export function boardRanks(cards: string[], edges: BoardEdge[]): Map<string, number> {
  const next = new Map<string, string[]>(cards.map((id) => [id, []]));
  for (const edge of edges) if (next.has(edge.from) && next.has(edge.to)) next.get(edge.from)!.push(edge.to);
  // Ways back are the ones that close a loop in a walk from the cards in their order.
  const back = new Set<string>();
  const state = new Map<string, 'open' | 'done'>();
  const visit = (id: string) => {
    state.set(id, 'open');
    for (const to of next.get(id)!) {
      if (state.get(to) === 'open') back.add(`${id}>${to}`);
      else if (!state.has(to)) visit(to);
    }
    state.set(id, 'done');
  };
  for (const id of cards) if (!state.has(id)) visit(id);
  const into = new Map<string, number>(cards.map((id) => [id, 0]));
  for (const [from, tos] of next) for (const to of tos) if (!back.has(`${from}>${to}`)) into.set(to, into.get(to)! + 1);
  const rank = new Map<string, number>(cards.map((id) => [id, 0]));
  const ready = cards.filter((id) => into.get(id) === 0);
  while (ready.length) {
    const id = ready.shift()!;
    for (const to of next.get(id)!) {
      if (back.has(`${id}>${to}`)) continue;
      rank.set(to, Math.max(rank.get(to)!, rank.get(id)! + 1));
      into.set(to, into.get(to)! - 1);
      if (into.get(to) === 0) ready.push(to);
    }
  }
  return rank;
}

/** Lays the map out as a board. `device` says what each journey is used on. */
export function layoutBoard(map: TreeMap, device: (journey: Journey) => Device): BoardLayout {
  const people = map.people.filter((person) => person.journeys.some((journey) => journey.steps.length));
  // Each card once, in the first journey that walks it: a screen in the journey's row, the rest in the row's strip of
  // what has no screen, right under it.
  const home = new Map<string, Journey>();
  const screens = new Set<string>();
  for (const person of people)
    for (const journey of person.journeys)
      for (const step of journey.steps) {
        const card = map.cards[step];
        if (isJourneyLink(step) || !card || home.has(step)) continue;
        home.set(step, journey);
        if (hasScreenArea(card)) screens.add(step);
      }
  const cards = [...home.keys()];
  const edges = boardEdges(map).filter((edge) => home.has(edge.from) && home.has(edge.to));
  const rank = boardRanks(cards, edges);
  // A card nothing leads to (a not-found page, reached only by a wrong address) goes last in its row, not first;
  // the journey's own first step stays first.
  const reached = new Set(edges.map((edge) => edge.to));
  // A row's screens stand in the order its journey walks them, so the board reads left to right as the person goes
  // (a button back, like 모든 주제, is an arrow pointing left). What has no screen follows what leads to it.
  const byRank = (ids: string[], journey: Journey) => {
    const key = (id: string) => (reached.has(id) || journey.steps[0] === id ? rank.get(id)! : 1e6);
    return [...ids].sort((a, b) => key(a) - key(b));
  };
  const byWalk = (ids: string[], journey: Journey) => {
    const key = (id: string) => (reached.has(id) || journey.steps[0] === id ? journey.steps.indexOf(id) : 1e6);
    return [...ids].sort((a, b) => key(a) - key(b));
  };
  const from = new Map<string, string[]>(cards.map((id) => [id, []]));
  for (const edge of edges) from.get(edge.to)!.push(edge.from);
  const kindOf = (id: string): BoardNodeKind =>
    !screens.has(id) ? 'system' : device(home.get(id)!) === 'computer' ? 'computer' : 'phone';
  const left = BOARD.pad + BOARD.lanePad;

  // In drawing order: a row's cards side by side in walk order, pushed right only past a card elsewhere that leads to
  // them (the owner's list after the message that tells them); what has no screen right after what leads to it,
  // stacked where several would overlap.
  const nodes: Record<string, BoardNode> = {};
  const rowKey = new Map<string, string>();
  const past = (id: string, key: string, gap: number = BOARD.columnGap) =>
    Math.max(
      left,
      ...from
        .get(id)!
        .filter((one) => nodes[one] && rowKey.get(one) !== key)
        .map((one) => nodes[one]!.x + (nodes[one]!.span ?? nodes[one]!.w) + gap),
    );
  const lanes: BoardLane[] = [];
  let y = BOARD.pad;
  for (const person of people) {
    const top = y;
    let rowY = top + BOARD.laneHeader;
    const rows: BoardJourneyRow[] = [];
    for (const journey of person.journeys) {
      const mine = journey.steps.filter((id, index) => home.get(id) === journey && journey.steps.indexOf(id) === index);
      if (!mine.length) continue;
      const shown = byWalk(
        mine.filter((id) => screens.has(id)),
        journey,
      );
      const loose = byRank(
        mine.filter((id) => !screens.has(id)),
        journey,
      );
      const key = `${person.id}/${journey.id}`;
      const frame = Math.max(0, ...shown.map((id) => BOARD[kindOf(id)].h));
      const branchesY = rowY + BOARD.title + frame + BOARD.caption;
      let branches = 0;
      let next = left;
      for (const id of shown) {
        const kind = kindOf(id);
        const x = Math.max(next, past(id, key));
        rowKey.set(id, key);
        const branch = situationsUnder(
          map.cards[id]!,
          kind === 'computer' ? 'computer' : 'phone',
          x,
          branchesY,
          BOARD[kind].w,
        );
        branches = Math.max(branches, branch.height);
        nodes[id] = {
          id,
          kind,
          ...BOARD[kind],
          x,
          y: rowY + BOARD.title,
          rowY,
          personId: person.id,
          journeyId: journey.id,
          ...(branch.width > BOARD[kind].w ? { span: branch.width } : {}),
          ...(branch.situations.length ? { situations: branch.situations } : {}),
          ...(branch.tray ? { tray: branch.tray } : {}),
          ...(branch.commonY !== undefined ? { commonY: branch.commonY } : {}),
        };
        next = x + Math.max(BOARD[kind].w, branch.width) + BOARD.columnGap;
      }
      const above = shown.length ? BOARD.title + frame + BOARD.caption + branches : 0;
      let band: BoardJourneyRow['band'];
      if (loose.length) {
        const bandY = rowY + above + (shown.length ? 6 : 0);
        const levels: { x: number; w: number }[][] = [];
        const bandKey = `${key}/band`;
        for (const id of loose) {
          const x = Math.max(
            past(id, bandKey),
            ...from
              .get(id)!
              .filter((one) => nodes[one] && rowKey.get(one) === bandKey)
              .map((one) => nodes[one]!.x + nodes[one]!.w + BOARD.columnGap / 2),
          );
          const w = BOARD.system.w;
          let level = levels.findIndex((placed) =>
            placed.every((one) => x + w + 16 <= one.x || one.x + one.w + 16 <= x),
          );
          if (level < 0) level = levels.push([]) - 1;
          levels[level]!.push({ x, w });
          rowKey.set(id, bandKey);
          nodes[id] = {
            id,
            kind: 'system',
            ...BOARD.system,
            x,
            y: bandY + BAND_LABEL + level * (BOARD.system.h + 14),
            rowY: bandY,
            personId: person.id,
            journeyId: journey.id,
          };
        }
        band = { y: bandY, height: BAND_LABEL + levels.length * (BOARD.system.h + 14) - 14 + 14 };
      }
      const height = band ? band.y + band.height - rowY : above;
      rows.push({ journey, y: rowY, height, band });
      rowY += height + BOARD.rowGap;
    }
    const height = rowY - BOARD.rowGap - top + BOARD.lanePad;
    lanes.push({ kind: 'person', person, y: top, height, rows });
    y = top + height + BOARD.laneGap;
  }
  const right = (node: BoardNode) => Math.max(node.x + node.w, ...(node.situations ?? []).map((one) => one.x + one.w));
  const width = Math.max(720, ...Object.values(nodes).map((node) => right(node) + BOARD.lanePad + BOARD.pad));
  let number = 0;
  for (const lane of lanes)
    for (const row of lane.rows) {
      // In the order the journey walks them; what is not on the walk follows, left to right.
      const walk = (id: string) => row.journey.steps.indexOf(id);
      const order = (id: string) => (walk(id) < 0 ? Infinity : walk(id));
      for (const id of Object.keys(nodes)
        .filter((one) => nodes[one]!.kind !== 'system' && nodes[one]!.rowY === row.y)
        .sort((a, b) => order(a) - order(b) || nodes[a]!.x - nodes[b]!.x))
        nodes[id]!.number = String(++number).padStart(2, '0');
    }
  return { lanes, nodes, edges, width, height: Math.max(y - BOARD.laneGap + BOARD.pad, 320) };
}

/**
 * A screen's situations under it, from `top` (10-27 rule for variations: the same screen in another situation is not
 * a step of the walk, so it gets no arrow into it; it sits in a tray hung under its screen, named by when it happens).
 * In the tray: its own ones two to a line, then the common ones named one to a line.
 */
function situationsUnder(
  card: TreeCard,
  device: Device,
  x: number,
  top: number,
  frameWidth: number,
): { situations: BoardSituation[]; tray?: BoardSituation; commonY?: number; width: number; height: number } {
  const { framed, common } = boardSituations(card);
  if (!framed.length && !common.length) return { situations: [], width: 0, height: 0 };
  const { pad, head, gap } = BOARD.tray;
  const size = BOARD.situation[device];
  const line = BOARD.situation.title + size.h + BOARD.situation.foot + BOARD.situation.gap;
  const inside = { x: x + pad, y: top + gap + head };
  const situations = framed.map((situation, index) => ({
    id: situation.id,
    x: inside.x + (index % 2) * (size.w + BOARD.situation.gap),
    y: inside.y + Math.floor(index / 2) * line + BOARD.situation.title,
    ...size,
  }));
  const lines = Math.ceil(framed.length / 2);
  const commonY = common.length ? inside.y + lines * line : undefined;
  const content = framed.length > 1 ? size.w * 2 + BOARD.situation.gap : framed.length ? size.w : 0;
  const width = Math.max(frameWidth, content + pad * 2);
  const height =
    head + lines * line + (common.length ? BOARD.common.lead + common.length * BOARD.common.line : 0) + pad;
  return {
    situations,
    tray: { id: card.id, x, y: top + gap, w: width, h: height },
    commonY,
    width,
    height: gap + height,
  };
}

/** The height of a strip's label, "화면 없는 일", over its cards. */
export const BAND_LABEL = 26;

export interface Point {
  x: number;
  y: number;
}

/**
 * An arrow's way from one card to another, at right angles and never across a card or the words under it: out of the
 * card's right side (from the button that leads on, when the real screen says where it is: `start`), along the gap
 * beside it, and into the other card's nearer side. A way back along a row goes under the row.
 */
export function route(
  from: BoardNode,
  to: BoardNode,
  start?: Point,
  rowBottom?: number,
): { path: string; middle: Point } {
  const s = start ?? { x: from.x + from.w, y: from.y + Math.min(from.h / 2, 140) };
  const ey = to.y + Math.min(to.h / 2, 140);
  const gutter = from.x + (from.span ?? from.w) + BOARD.columnGap / 2;
  if (from.rowY === to.rowY && to.x >= from.x + from.w) {
    const mid = Math.round((from.x + (from.span ?? from.w) + to.x) / 2);
    return { path: `M${s.x},${s.y} H${mid} V${ey} H${to.x}`, middle: { x: mid, y: (s.y + ey) / 2 } };
  }
  if (from.rowY === to.rowY) {
    const low = (rowBottom ?? from.y + from.h + BOARD.caption) - 8;
    const back = to.x - BOARD.columnGap / 2;
    return {
      path: `M${s.x},${s.y} H${gutter} V${low} H${back} V${ey} H${to.x}`,
      middle: { x: (gutter + back) / 2, y: low },
    };
  }
  if (from.x < to.x + to.w && to.x < from.x + from.w) {
    // Straight up or down the column, near the cards' right edge where their titles and words do not reach.
    const x = Math.round(Math.min(from.x + from.w, to.x + to.w) - 18);
    const down = to.y > from.y;
    const sy = down ? from.y + from.h : from.y;
    const ty = down ? to.y : to.y + to.h;
    return { path: `M${x},${sy} V${ty}`, middle: { x, y: (sy + ty) / 2 } };
  }
  const intoLeft = gutter <= to.x;
  const ex = intoLeft ? to.x : to.x + to.w;
  return {
    path: `M${s.x},${s.y} H${gutter} V${ey} H${ex}`,
    middle: { x: gutter, y: (s.y + ey) / 2 },
  };
}
