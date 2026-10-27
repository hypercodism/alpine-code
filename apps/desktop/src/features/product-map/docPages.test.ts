import { describe, expect, it } from 'vitest';

import { layoutBoard } from './boardLayout';
import { docMessages } from './docMessages';
import { readDocument } from './docModel';
import { documentMarkdown, documentPage, type DocWords } from './docPages';
import { filmMessages } from './filmMessages';
import { flowTreeMessages } from './flowTreeMessages';
import type { TreeMap } from './flowTreeModel';

/** The 문서 taken out of the app: the same sections as the tab, as Markdown and as a page to print. */

const promise = (id: string, then: string, status: 'passed' | 'failed' | 'recheck') =>
  ({ id, when: '', then, status, checks: [] }) as never;

const MAP: TreeMap = {
  product: '동네 빵집',
  recent: [],
  people: [
    {
      id: 'guest',
      name: { ko: '손님', en: 'Guest' },
      role: { ko: '빵을 예약해요', en: 'Books bread' },
      start: { ko: '가게 링크를 눌러요', en: 'Taps the link' },
      tone: 1,
      journeys: [
        {
          id: 'book',
          title: { ko: '빵 예약하기', en: 'Book bread' },
          goal: { ko: '원하는 빵을 맡아 둬요', en: '' },
          steps: ['pick', 'text', 'done'],
        },
      ],
    },
  ],
  cards: {
    pick: {
      id: 'pick',
      title: '빵 고르기',
      kind: 'screen',
      screen: { src: 'data:image/png;base64,AAA', kind: 'shot', at: null },
      promises: [promise('a', '고른 빵이 담겨요', 'passed'), promise('b', '품절은 못 골라요', 'failed')],
      picks: [{ question: '얼마나 미리?', options: ['하루 전'], answer: '하루 전', by: 'ai' }],
    },
    text: { id: 'text', title: '문자 보내기', kind: 'process', promises: [] },
    done: {
      id: 'done',
      title: '예약 끝 <확인>',
      kind: 'screen',
      promises: [promise('c', '예약 번호가 보여요', 'recheck')],
      picks: [{ question: '얼마나 미리?', options: ['하루 전'], answer: '하루 전', by: 'ai' }],
    },
  },
};

const words = (): DocWords => ({
  t: docMessages.ko,
  words: flowTreeMessages.ko,
  film: filmMessages.ko,
  text: (text) => text.ko,
  device: () => 'phone',
  uses: () => 'phone',
  undecided: ['문 닫는 날은?'],
  date: '2026년 10월 27일',
});

const read = () => {
  const layout = layoutBoard(MAP, () => 'phone');
  return { layout, doc: readDocument(MAP, layout) };
};

describe('the document as Markdown', () => {
  it('says what the tab says, in the same order', () => {
    const { layout, doc } = read();
    const markdown = documentMarkdown(MAP, doc, layout, words());
    expect(markdown.startsWith('# 동네 빵집\n')).toBe(true);
    expect(markdown).toContain('2026년 10월 27일에 내보냄 · 화면 2개 · 약속 3개');
    expect(markdown).toContain('✗ 실패 1 · ○ 다시 확인 1 · ✓ 통과 1 · 정할 것 1개');
    expect(markdown).toContain('- **손님** · 휴대폰 — 빵을 예약해요\n  시작 · 가게 링크를 눌러요');
    // The journey's steps in walk order, a screen with its board number, a task without one marked so.
    expect(markdown).toContain('### 빵 예약하기 (손님)');
    expect(markdown).toMatch(/1\. `01` 빵 고르기\n2\. 문자 보내기 \(화면 없는 일\)\n3\. `02` 예약 끝 <확인>/);
    // Worst first.
    const promises = markdown.slice(markdown.indexOf('## 약속 3개'));
    expect(promises.indexOf('품절은 못 골라요')).toBeLessThan(promises.indexOf('예약 번호가 보여요'));
    expect(promises.indexOf('예약 번호가 보여요')).toBeLessThan(promises.indexOf('고른 빵이 담겨요'));
    // A decision two screens carry is written once, naming both.
    expect(markdown).toContain('## 결정 1개\n\n- 하루 전 — 얼마나 미리? · 빵 고르기 · 예약 끝 <확인>');
    expect(markdown).toContain('## 정할 것 1개\n\n- 문 닫는 날은?');
  });
});

describe('the document as a page to print', () => {
  it('shows each screen with its picture, or its name in an empty frame, and keeps words as words', () => {
    const { layout, doc } = read();
    const page = documentPage(MAP, doc, layout, words(), { pick: 'data:image/png;base64,PICK' });
    expect(page).toContain('<img src="data:image/png;base64,PICK"');
    expect(page).toContain('<span>예약 끝 &lt;확인&gt;</span>');
    expect(page).not.toContain('<확인>');
    expect(page).toContain('<h2>약속 3개</h2>');
    expect(page).toContain('<h2>정할 것 1개</h2>');
  });
});
