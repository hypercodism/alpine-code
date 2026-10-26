import { describe, expect, it } from 'vitest';

import { minutesLeft, teamShape } from './room';

const step = (count: number) => ({ title: 'x', count, model: 'm' });

describe('how a team will work, from facts (dogfood 8)', () => {
  it('says three agents in one-agent steps work one after another, not three at once', () => {
    expect(teamShape({ steps: [step(1), step(1), step(1)] })).toEqual({ oneByOne: true, most: 1 });
    expect(teamShape({ steps: [step(1), step(3)] })).toEqual({ oneByOne: false, most: 3 });
  });

  it('says how long is left only from the pace so far', () => {
    expect(minutesLeft(0, 3, 40)).toBeNull(); // nothing finished yet: no guess
    expect(minutesLeft(1, 3, 66)).toBe(132);
    expect(minutesLeft(3, 3, 200)).toBeNull();
  });
});
