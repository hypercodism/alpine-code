import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';

import type { TreeMap } from './flowTreeModel';
import { MapDocument } from './MapDocument';

const QUESTION = '공개 전에 무엇을 바꿀까요?';
const ANSWER = '세 원고를 교체해요';

const MAP: TreeMap = {
  product: '기록장',
  people: [
    {
      id: 'reader',
      name: { ko: '독자', en: 'Reader' },
      role: { ko: '읽어요', en: 'Reads' },
      start: { ko: '', en: '' },
      tone: 1,
      journeys: [
        { id: 'read', title: { ko: '읽기', en: 'Read' }, goal: { ko: '', en: '' }, steps: ['start', 'rss', 'read'] },
      ],
    },
  ],
  cards: {
    start: {
      id: 'start',
      title: '기록의 시작',
      promises: [],
      picks: [{ question: QUESTION, options: [ANSWER], answer: ANSWER, by: 'ai' }],
    },
    rss: {
      id: 'rss',
      title: 'RSS로 받아보기',
      promises: [],
      picks: [{ question: QUESTION, options: [ANSWER], answer: ANSWER, by: 'ai' }],
    },
    read: {
      id: 'read',
      title: '기록 읽기',
      promises: [],
      decision: '글자를 크게 해요',
      picks: [{ question: QUESTION, options: [ANSWER], answer: ANSWER, by: 'person' }],
    },
  },
  recent: [],
};

afterEach(cleanup);

describe('MapDocument decisions', () => {
  it('lists a decision carried by several screens once, naming each screen', () => {
    render(
      <LocaleProvider locale="ko">
        <MapDocument map={MAP} onShowOnBoard={vi.fn()} />
      </LocaleProvider>,
    );
    // 3 distinct: the AI's pick on two screens, the person's pick, and the note.
    expect(screen.getAllByText('결정 3개').length).toBeGreaterThan(0);
    const section = document.querySelector('[data-doc="decisions"]') as HTMLElement;
    const shown = within(section).getAllByText(ANSWER);
    expect(shown).toHaveLength(2);
    const meta = shown[0]!.nextElementSibling!.textContent!;
    expect(meta).toContain('기록의 시작');
    expect(meta).toContain('RSS로 받아보기');
    expect(meta).not.toContain('기록 읽기');
    expect(meta).toContain('AI가 정함');
  });
});

describe('MapDocument promises', () => {
  const promise = (id: string, status: 'passed' | 'failed' | 'recheck') => ({
    id,
    when: '',
    then: `${id} 약속`,
    status,
    checks: [],
  });
  const WITH_PROMISES: TreeMap = {
    ...MAP,
    cards: {
      ...MAP.cards,
      start: {
        ...MAP.cards.start!,
        promises: [promise('ok', 'passed'), promise('again', 'recheck'), promise('bad', 'failed')] as never,
      },
    },
  };

  it('shows the promises by status in the header, and lists a broken one before a confirmed one', () => {
    render(
      <LocaleProvider locale="ko">
        <MapDocument map={WITH_PROMISES} undecided={['무엇을?']} onShowOnBoard={vi.fn()} />
      </LocaleProvider>,
    );
    const status = screen.getByLabelText('약속 상태');
    expect(status.textContent).toContain('✗ 실패 1');
    expect(status.textContent).toContain('○ 다시 확인 1');
    expect(status.textContent).toContain('✓ 통과 1');
    expect(status.textContent).toContain('정할 것 1개');
    expect(status.textContent).not.toContain('확인 중');
    const section = document.querySelector('[data-doc="promises"]') as HTMLElement;
    const rows = within(section)
      .getAllByRole('listitem')
      .map((row) => row.textContent!);
    expect(rows[0]).toContain('bad 약속');
    expect(rows[1]).toContain('again 약속');
    expect(rows[2]).toContain('ok 약속');
  });
});
