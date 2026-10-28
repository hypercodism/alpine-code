import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { BoardSize, boardFrames, useBoardDevice, useBoardSize } from './boardDevice';
import type { Journey, TreeMap } from './flowTreeModel';
import type { Device } from './planLook';

/** One app is drawn at one size, the board's; several apps keep each journey's own device. */

const journey = (id: string, steps: string[], device: Device): Journey => ({
  id,
  title: { ko: id, en: id },
  goal: { ko: '', en: '' },
  steps,
  device,
});

const mapOf = (journeys: Journey[], paths = true): TreeMap => ({
  product: 'test',
  recent: [],
  people: journeys.map((one, index) => ({
    id: `p${index}`,
    name: { ko: one.id, en: one.id },
    role: { ko: '', en: '' },
    start: { ko: '', en: '' },
    tone: 1,
    journeys: [one],
  })),
  cards: Object.fromEntries(
    ['a', 'b', 'c', 'd'].map((id) => [
      id,
      { id, title: id, kind: 'screen', promises: [], path: paths ? `/${id}` : null },
    ]),
  ),
});

const uses = (one: Journey) => one.device!;

describe('one app or several', () => {
  it('is one responsive web app when people on phones and on computers share a screen', () => {
    // basecamp: a visitor on a phone and a reader on a computer both open the front page.
    const map = mapOf([journey('visit', ['a', 'b'], 'phone'), journey('read', ['a', 'c', 'd'], 'computer')]);
    expect(boardFrames(map, uses)).toEqual({ oneApp: true, usual: 'phone' });
  });

  it('is several apps when phone and computer people share no screen', () => {
    // The bakery: the customer's phone app and the owner's desk screens.
    const map = mapOf([journey('book', ['a', 'b'], 'phone'), journey('orders', ['c', 'd'], 'computer')]);
    expect(boardFrames(map, uses).oneApp).toBe(false);
  });

  it('draws most screens at the device most of them are walked on', () => {
    const map = mapOf([journey('visit', ['a'], 'phone'), journey('read', ['a', 'b', 'c', 'd'], 'computer')]);
    expect(boardFrames(map, uses).usual).toBe('computer');
  });
});

describe('the board size', () => {
  const wrap =
    (size: Device | null) =>
    ({ children }: { children: ReactNode }) => (
      <BoardSize.Provider value={{ size, set: () => {} }}>{children}</BoardSize.Provider>
    );

  it('draws every journey of one app at the size picked, and offers the switch for a web app', () => {
    const map = mapOf([journey('visit', ['a', 'b'], 'phone'), journey('read', ['a', 'c'], 'computer')]);
    const frame = renderHook(() => useBoardDevice(map), { wrapper: wrap('computer') }).result.current;
    expect(map.people.map((person) => frame(person.journeys[0]!))).toEqual(['computer', 'computer']);
    expect(renderHook(() => useBoardSize(map), { wrapper: wrap(null) }).result.current).toMatchObject({
      shown: true,
      size: 'phone',
    });
  });

  it("keeps each journey's own device for several apps, with no switch", () => {
    const map = mapOf([journey('book', ['a', 'b'], 'phone'), journey('orders', ['c', 'd'], 'computer')]);
    const frame = renderHook(() => useBoardDevice(map), { wrapper: wrap('computer') }).result.current;
    expect(map.people.map((person) => frame(person.journeys[0]!))).toEqual(['phone', 'computer']);
    expect(renderHook(() => useBoardSize(map), { wrapper: wrap(null) }).result.current.shown).toBe(false);
  });

  it('offers no switch for screens without addresses (not a web app)', () => {
    const map = mapOf([journey('visit', ['a', 'b'], 'phone')], false);
    expect(renderHook(() => useBoardSize(map), { wrapper: wrap(null) }).result.current.shown).toBe(false);
  });
});
