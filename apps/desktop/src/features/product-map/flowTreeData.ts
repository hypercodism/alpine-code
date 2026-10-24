import type { FlowGetResult, FlowNode, ProductFlow } from '@alpine/protocol';

import {
  UNPLACED,
  type Journey,
  type Person,
  type PromiseStatus,
  type TreeCard,
  type TreeMap,
  type TreePromise,
} from './flowTreeModel';
import type { Device } from './planLook';

/**
 * The person-first tree from what the server sends for the map (`flow/get`): cards with their promises and the state
 * Alpine computed for each (passed, broken, recheck because files changed…), journeys with their edges, and the
 * recent changes. Who walks which journey comes from each journey's `actor`; journeys without one are grouped
 * together until the map names them.
 */
export function toTreeMap(
  result: FlowGetResult,
  /** Ids of the sessions working now (running or waiting): their cards show as being checked. */
  working: ReadonlySet<string>,
  product: string,
  words: {
    unnamed: Person['name'];
    unnamedRole: Person['role'];
    /** Given, cards no journey holds yet show in a row of their own (a plan the AI is still drawing). */
    unplaced?: Person['name'];
    unplacedRole?: Person['role'];
  },
): TreeMap {
  const document = result.document ?? {};
  const cards: Record<string, TreeCard> = {};
  const devices = new Map<string, Device>();
  for (const flow of document.flows ?? [])
    for (const step of flow.nodeIds ?? []) if (flow.device && !devices.has(step)) devices.set(step, flow.device);
  for (const node of document.nodes ?? []) cards[node.id] = toCard(node, result, working, devices.get(node.id));

  const groups = new Map<string, ProductFlow[]>();
  for (const flow of document.flows ?? []) {
    const actor = flow.actor?.trim() ?? '';
    groups.set(actor, [...(groups.get(actor) ?? []), flow]);
  }
  const people: Person[] = [...groups].map(([actor, flows], index) => ({
    id: actor ? `actor:${actor}` : 'actor:',
    name: actor ? { ko: actor, en: actor } : words.unnamed,
    role: actor ? { ko: '', en: '' } : words.unnamedRole,
    start: { ko: flows[0]?.trigger ?? '', en: flows[0]?.trigger ?? '' },
    tone: ((index % 5) + 1) as Person['tone'],
    journeys: flows.map(toJourney),
  }));
  const placed = new Set(people.flatMap((person) => person.journeys.flatMap((journey) => journey.steps)));
  const loose = Object.keys(cards).filter((id) => !placed.has(id));
  if (words.unplaced && loose.length)
    people.push({
      id: 'actor:unplaced',
      name: words.unplaced,
      role: words.unplacedRole ?? { ko: '', en: '' },
      start: { ko: '', en: '' },
      tone: ((people.length % 5) + 1) as Person['tone'],
      journeys: [{ id: UNPLACED, title: words.unplaced, goal: words.unplacedRole ?? { ko: '', en: '' }, steps: loose }],
    });

  return {
    product,
    people,
    cards,
    recent: (result.changes ?? []).map((change) => ({
      at: change.at,
      kind: change.kind,
      cardId: change.nodeId,
      detail: change.detail ?? '',
    })),
  };
}

function toJourney(flow: ProductFlow): Journey {
  const text = (value: string | undefined) => ({ ko: value ?? '', en: value ?? '' });
  return {
    id: flow.id,
    title: text(flow.title),
    goal: text(flow.description),
    trigger: text(flow.trigger),
    steps: flow.nodeIds ?? [],
    edges: (flow.edges ?? []).map((edge) => ({ from: edge.source, to: edge.target, label: edge.label ?? '' })),
    device: flow.device ?? null,
  };
}

function toCard(node: FlowNode, result: FlowGetResult, working: ReadonlySet<string>, device?: Device): TreeCard {
  const state = result.states?.[node.id];
  const checking = !!node.sessionId && working.has(node.sessionId);
  const promises: TreePromise[] = (node.conditions ?? []).map((condition) => {
    const promise = state?.promises?.[condition.id];
    const check = [...(node.checks ?? [])].reverse().find((item) => item.conditionId === condition.id);
    const status: PromiseStatus =
      checking && promise?.status !== 'passed' ? 'checking' : (promise?.status ?? 'unconfirmed');
    return {
      id: condition.id,
      when: '',
      then: condition.expectation,
      status,
      note: check?.plain || check?.summary || '',
      checkedAt: promise?.stamp?.at ?? null,
      steps: check?.steps ?? [],
      seen: (check?.observations ?? []).map((observation) => observation.label ?? ''),
      limits: check?.limits ?? [],
      environment: check?.environment ?? '',
      changedFiles: promise?.changed ?? [],
      question: promise?.issue === 'question',
    };
  });
  return {
    id: node.id,
    title: node.title,
    promises,
    description: node.description ?? '',
    kind: node.kind ?? 'process',
    tags: node.tags ?? [],
    sources: node.sources ?? [],
    howToTry: node.howToTry ?? '',
    example: node.example ?? '',
    priority: node.priority ?? null,
    scope: node.scope ?? null,
    decision: node.decision ?? '',
    sessionId: node.sessionId ?? null,
    screen: result.previews?.[node.id]
      ? { src: result.previews[node.id]!, kind: 'shot', at: node.previewAt ?? null }
      : result.sketches?.[node.id]
        ? { src: result.sketches[node.id]!, kind: 'sketch', at: null }
        : result.screens?.[node.id]
          ? { src: result.screens[node.id]!, kind: 'planned', at: null, device: device ?? null }
          : undefined,
    tentative: !!node.tentative,
    path: node.path ?? null,
    picks: (node.decisions ?? []).map((pick) => ({
      question: pick.question,
      options: pick.options ?? [],
      answer: pick.answer,
      by: pick.by ?? 'person',
    })),
  };
}
