import { describe, expect, it } from 'vitest';

import { deviceOf, filmSteps, towards } from './filmstripModel';
import type { Journey, TreeMap } from './flowTreeModel';

const journey = (more: Partial<Journey> = {}): Journey => ({
  id: 'j',
  title: { ko: '예약', en: '예약' },
  goal: { ko: '', en: '' },
  steps: ['a', 'b', 'c', 'd'],
  ...more,
});

describe('filmSteps', () => {
  it('marks a step that forks with its ways in flow order, and a step that leads back', () => {
    const steps = filmSteps(
      journey({
        edges: [
          { from: 'a', to: 'c', label: '안 했으면' },
          { from: 'a', to: 'b', label: '로그인했으면' },
          { from: 'c', to: 'd', label: '' },
          { from: 'd', to: 'a', label: '처음으로' },
        ],
      }),
    );
    expect(steps.map((step) => step.forks.map((way) => way.label))).toEqual([
      ['로그인했으면', '안 했으면'],
      [],
      [],
      [],
    ]);
    expect(steps[3]!.loops).toEqual([{ to: 'a', label: '처음으로' }]);
    // One way on is no fork.
    expect(steps[2]!.forks).toEqual([]);
  });
});

describe('deviceOf', () => {
  const map = (src: string) =>
    ({ cards: { a: { id: 'a', title: 'A', promises: [], screen: { src, kind: 'shot' } } } }) as unknown as TreeMap;

  it('takes the journey’s own device, else the shape of its pictures, else a phone', () => {
    expect(deviceOf(journey({ device: 'computer' }), map('x'), () => false)).toBe('computer');
    expect(deviceOf(journey(), map('wide.png'), (src) => src === 'wide.png')).toBe('computer');
    expect(deviceOf(journey(), map('tall.png'), () => false)).toBe('phone');
    expect(deviceOf(journey(), map('unknown.png'), () => undefined)).toBe('phone');
  });
});

describe('towards', () => {
  it.each([
    ['첫 화면', '첫 화면으로'],
    ['목록', '목록으로'],
    ['메일', '메일로'],
    ['홈', '홈으로'],
    ['장바구니', '장바구니로'],
    ['Home', 'Home(으)로'],
  ])('%s → %s', (word, said) => expect(towards(word)).toBe(said));
});
