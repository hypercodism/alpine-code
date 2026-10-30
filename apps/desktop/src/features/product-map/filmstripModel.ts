import { hasScreenArea, isJourneyLink, type Journey, type Person, type TreeMap } from './flowTreeModel';
import type { Device } from './planLook';

/**
 * The map read as a filmstrip: per person, each journey's screens in the order they are walked. A step that forks
 * (two or more ways on) is followed by its ways as small rows with their conditions; a step that leads back says so in
 * one line under it. Nothing here draws; it decides what the strip shows.
 */

/** A way on from a step that forks, with its condition ("로그인했으면"). */
export interface FilmWay {
  to: string;
  label: string;
}

export interface FilmStep {
  /** A card id, or `flow:<journey id>` for a step that goes through another journey. */
  id: string;
  /** The ways on when the step forks into two or more; empty otherwise. */
  forks: FilmWay[];
  /** Steps already passed that it leads back to. */
  loops: FilmWay[];
}

/** A journey's steps in flow order, each with where it forks and where it leads back. */
export function filmSteps(journey: Journey): FilmStep[] {
  const order = new Map<string, number>();
  journey.steps.forEach((id, index) => order.has(id) || order.set(id, index));
  const out = new Map<string, FilmWay[]>();
  for (const edge of journey.edges ?? []) {
    if (!order.has(edge.from) || !order.has(edge.to) || edge.from === edge.to) continue;
    out.set(edge.from, [...(out.get(edge.from) ?? []), { to: edge.to, label: edge.label }]);
  }
  return journey.steps.map((id, index) => {
    const ways = [...(out.get(id) ?? [])].sort((a, b) => order.get(a.to)! - order.get(b.to)!);
    const ahead = ways.filter((way) => order.get(way.to)! > index);
    return { id, forks: ahead.length > 1 ? ahead : [], loops: ways.filter((way) => order.get(way.to)! < index) };
  });
}

/**
 * What the person on a journey uses: what the journey says, else (a map drawn from code) what its pictures say (wide
 * ones are a computer's), else a phone.
 */
export function deviceOf(journey: Journey, map: TreeMap, wide: (src: string) => boolean | undefined): Device {
  if (journey.device) return journey.device;
  let wider = 0;
  let taller = 0;
  for (const id of journey.steps) {
    const screen = map.cards[id]?.screen;
    if (!screen || screen.kind === 'planned') continue;
    const shape = wide(screen.src);
    if (shape === true) wider += 1;
    else if (shape === false) taller += 1;
  }
  return wider > taller ? 'computer' : 'phone';
}

/** The devices a person's journeys are used on, each once, phone first. */
export function devicesOf(devices: Device[]): Device[] {
  return (['phone', 'computer'] as const).filter((device) => devices.includes(device));
}

/** A person's journeys and the screens across them (a screen shared by two journeys counts once). */
export function personCounts(map: TreeMap, person: Person) {
  return {
    journeys: person.journeys.length,
    screens: screensIn(
      map,
      person.journeys.flatMap((journey) => journey.steps),
    ).size,
  };
}

function screensIn(map: TreeMap, steps: string[]) {
  return new Set(steps.filter((id) => !isJourneyLink(id) && map.cards[id] && hasScreenArea(map.cards[id])));
}

/** A Korean word with 로 or 으로 after it as its last sound needs ("첫 화면으로", "목록으로"); (으)로 when unsure. */
export function towards(word: string) {
  const code = (word.trim().at(-1) ?? '').charCodeAt(0) - 0xac00;
  if (!(code >= 0 && code <= 11171)) return `${word}(으)로`;
  const final = code % 28;
  return final === 0 || final === 8 ? `${word}로` : `${word}으로`;
}
