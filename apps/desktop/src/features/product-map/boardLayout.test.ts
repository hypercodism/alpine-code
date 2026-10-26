import { describe, expect, it } from 'vitest';

import { BOARD, boardRanks, layoutBoard, route } from './boardLayout';
import type { Journey, TreeCard, TreeMap } from './flowTreeModel';

const card = (id: string, kind: TreeCard['kind'] = 'screen'): TreeCard => ({ id, title: id, kind, promises: [] });
const journey = (id: string, steps: string[], more: Partial<Journey> = {}): Journey => ({
  id,
  title: { ko: id, en: id },
  goal: { ko: '', en: '' },
  steps,
  ...more,
});

/** The bakery of the mockup: a customer books on a phone, a message goes out, the owner sees it at a desk. */
const bakery: TreeMap = {
  product: '동네 빵집',
  recent: [],
  cards: Object.fromEntries(
    [
      card('pick'),
      card('time'),
      card('contact'),
      card('confirm'),
      card('done'),
      card('change'),
      card('text', 'process'),
      card('tell', 'process'),
      card('bake'),
      card('orders'),
    ].map((one) => [one.id, { ...one, tentative: one.id === 'change' }]),
  ),
  people: [
    {
      id: 'guest',
      name: { ko: '손님', en: 'Guest' },
      role: { ko: '', en: '' },
      start: { ko: '', en: '' },
      tone: 1,
      journeys: [
        journey('book', ['pick', 'time', 'contact', 'confirm', 'done', 'change', 'text', 'tell'], {
          edges: [
            { from: 'pick', to: 'time', label: '' },
            { from: 'time', to: 'contact', label: '' },
            { from: 'contact', to: 'confirm', label: '' },
            { from: 'confirm', to: 'done', label: '' },
            { from: 'done', to: 'change', label: '' },
            { from: 'confirm', to: 'text', label: '예약하면' },
            { from: 'text', to: 'tell', label: '' },
            { from: 'tell', to: 'flow:owner', label: '새 예약이 떠요' },
          ],
        }),
      ],
    },
    {
      id: 'owner',
      name: { ko: '사장님', en: 'Owner' },
      role: { ko: '', en: '' },
      start: { ko: '', en: '' },
      tone: 2,
      journeys: [journey('owner', ['orders', 'bake'], { device: 'computer' })],
    },
  ],
};

const device = (one: Journey) => one.device ?? 'phone';

describe('the board (10-27: the map as one canvas)', () => {
  it('puts each person in a lane, and what a journey does without a screen in a strip right under its row', () => {
    const board = layoutBoard(bakery, device);
    expect(board.lanes.map((lane) => lane.person.id)).toEqual(['guest', 'owner']);
    const row = board.lanes[0]!.rows[0]!;
    expect(row.band).toBeDefined();
    expect(board.nodes.text!.y).toBeGreaterThan(board.nodes.pick!.y + board.nodes.pick!.h);
    expect(board.nodes.text!.y).toBeLessThan(row.y + row.height);
    expect(board.nodes.text!.kind).toBe('system');
    expect(board.nodes.orders!.kind).toBe('computer');
    // Lanes do not overlap, top to bottom.
    for (let i = 1; i < board.lanes.length; i++)
      expect(board.lanes[i]!.y).toBeGreaterThanOrEqual(board.lanes[i - 1]!.y + board.lanes[i - 1]!.height);
  });

  it('reads left to right in walk order, and a screen that follows a step in another lane stands after it', () => {
    const board = layoutBoard(bakery, device);
    const x = (id: string) => board.nodes[id]!.x;
    expect(x('pick')).toBeLessThan(x('time'));
    expect(x('confirm')).toBeLessThan(x('done'));
    expect(x('text')).toBeGreaterThan(x('confirm'));
    // The owner's list comes after the message that tells them, though it is their journey's first screen.
    expect(board.nodes.orders!.x).toBeGreaterThan(board.nodes.tell!.x + board.nodes.tell!.w);
    // And the owner's lane keeps its own order.
    expect(x('bake')).toBeGreaterThan(x('orders'));
  });

  it('numbers the screens in reading order, lane by lane, and not what has no screen', () => {
    const board = layoutBoard(bakery, device);
    expect(['pick', 'time', 'contact', 'confirm', 'done', 'change'].map((id) => board.nodes[id]!.number)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
    ]);
    expect(board.nodes.orders!.number).toBe('07');
    expect(board.nodes.text!.number).toBeUndefined();
  });

  it('draws every way once, a journey called by another going to its first screen', () => {
    const board = layoutBoard(bakery, device);
    expect(board.edges).toContainEqual({ from: 'tell', to: 'orders', label: '새 예약이 떠요' });
    expect(board.edges).toContainEqual({ from: 'confirm', to: 'text', label: '예약하면' });
    expect(board.edges.filter((edge) => edge.from === 'pick' && edge.to === 'time')).toHaveLength(1);
  });

  it('leaves a loop out of the order, so a way back never pushes a screen right', () => {
    const ranks = boardRanks(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b', label: '' },
        { from: 'b', to: 'c', label: '' },
        { from: 'c', to: 'a', label: '' },
      ],
    );
    expect([ranks.get('a'), ranks.get('b'), ranks.get('c')]).toEqual([0, 1, 2]);
  });

  it('routes an arrow from the real button, along the gap, into the next screen', () => {
    const board = layoutBoard(bakery, device);
    const from = board.nodes.pick!;
    const to = board.nodes.time!;
    const { path } = route(from, to, { x: from.x + from.w - 10, y: from.y + 300 });
    expect(path.startsWith(`M${from.x + from.w - 10},${from.y + 300}`)).toBe(true);
    expect(path.endsWith(`H${to.x}`)).toBe(true);
    expect(BOARD.columnGap).toBeGreaterThan(0);
  });
});

describe('a screen nothing leads to', () => {
  it('stands last in its row, after the ones the walk reaches', () => {
    const map: TreeMap = {
      ...bakery,
      cards: { ...bakery.cards, lost: card('lost') },
      people: [
        {
          ...bakery.people[0]!,
          journeys: [
            journey('read', ['pick', 'lost', 'time'], {
              edges: [
                { from: 'pick', to: 'time', label: '' },
                { from: 'lost', to: 'pick', label: '처음으로' },
              ],
            }),
          ],
        },
      ],
    };
    const board = layoutBoard(map, device);
    expect(board.nodes.lost!.x).toBeGreaterThan(board.nodes.time!.x);
  });
});
