import { describe, expect, it } from 'vitest';

import { boardSituations, isCommonSituation } from './boardSituations';
import type { TreeCard } from './flowTreeModel';

const card = (states: TreeCard['states']): TreeCard => ({
  id: 'home',
  title: '홈',
  kind: 'screen',
  promises: [],
  states,
});

describe('situations on the board', () => {
  it('folds waiting and connection, which every screen has, and keeps what is particular to the product', () => {
    expect(isCommonSituation({ id: 'loading', title: '글을 기다리는 동안' })).toBe(true);
    expect(isCommonSituation({ id: 'load-failed', title: '목록을 불러오지 못했을 때' })).toBe(true);
    expect(isCommonSituation({ id: 'feed-error', title: '피드 안내의 기록을 불러오지 못했을 때' })).toBe(true);
    expect(isCommonSituation({ id: 'offline', title: 'Offline' })).toBe(true);
    expect(isCommonSituation({ id: 'empty', title: '아직 공개한 글이 없을 때' })).toBe(false);
    expect(isCommonSituation({ id: 'copy-failed', title: '브라우저가 코드 복사를 막았을 때' })).toBe(false);
    expect(isCommonSituation({ id: 'sold-out', title: '빵이 다 팔렸을 때' })).toBe(false);
  });

  it("draws a screen's own situations first, then its proposals, and names the common ones", () => {
    const { framed, common } = boardSituations(
      card([
        { id: 'later', title: '예약이 꽉 찼을 때', handled: false },
        { id: 'loading', title: '기다리는 동안' },
        { id: 'empty', title: '빵이 없을 때' },
      ]),
    );
    expect(framed.map((one) => one.id)).toEqual(['empty', 'later']);
    expect(common.map((one) => one.id)).toEqual(['loading']);
  });
});
