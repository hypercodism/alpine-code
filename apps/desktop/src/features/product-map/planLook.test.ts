import { describe, expect, it } from 'vitest';

import { toTreeMap } from './flowTreeData';
import { blogBoard } from './planExample';
import { DESKTOP_WIDTH, SCREEN_WIDTH, screenWidthFor } from './planLook';

const words = { unnamed: { ko: '누군가', en: 'Someone' }, unnamedRole: { ko: '', en: '' } };

describe('screenWidthFor', () => {
  it('draws a computer journey at desktop width and everything else as a phone', () => {
    expect(screenWidthFor('computer')).toBe(DESKTOP_WIDTH);
    expect(screenWidthFor('phone')).toBe(SCREEN_WIDTH);
    expect(screenWidthFor(null)).toBe(SCREEN_WIDTH);
    expect(screenWidthFor(undefined)).toBe(SCREEN_WIDTH);
  });
});

describe('devices and paths on the tree', () => {
  it('gives each journey its device and each planned screen the device of its journey', () => {
    const tree = toTreeMap(blogBoard('asking'), new Set(), 'blog', words);
    const journeys = tree.people.flatMap((person) => person.journeys);
    expect(journeys.find((j) => j.id === 'writing')?.device).toBe('computer');
    expect(journeys.find((j) => j.id === 'reading')?.device).toBe('phone');
    expect(tree.cards.write?.screen?.device).toBe('computer');
    expect(tree.cards.list?.screen?.device).toBe('phone');
    expect(tree.cards.list?.path).toBeNull();
  });

  it('carries the path a built screen was given', () => {
    const tree = toTreeMap(blogBoard('built'), new Set(), 'blog', words);
    expect(tree.cards.read?.path).toBe('/posts/d1-batch');
    expect(tree.cards.write?.path).toBe('/write');
  });
});
