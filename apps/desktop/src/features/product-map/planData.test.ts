import type { FlowGetResult, FlowNode } from '@alpine/protocol';
import { describe, expect, it } from 'vitest';

import type { Item } from '@/shared/server';

import type { TreeMap } from './flowTreeModel';
import { buildActivity, pendingQuestion, planPhase, toPlan } from './planData';

const node = (id: string, more: Partial<FlowNode> = {}): FlowNode => ({ id, title: id, phase: 'planned', ...more });
const board = (nodes: FlowNode[], more: Partial<FlowGetResult> = {}): FlowGetResult => ({
  revision: 'r',
  planned: true,
  document: { nodes, flows: [], edges: [] },
  ...more,
});
const tree: TreeMap = { product: 'blog', people: [], cards: {}, recent: [] };

const ask = (id: string, options: unknown[]): Item =>
  ({
    id,
    kind: 'tool_call',
    name: 'ask_user',
    args: { question: '누가 쓰나요?', about: 'write', options },
    status: 'done',
    result: '',
    images: 0,
    commandResult: null,
    fileChanges: null,
  }) as Item;
const said = (text: string): Item => ({ id: `u-${text}`, kind: 'user_message', text }) as Item;

describe('toPlan', () => {
  it('shows each card with its screen, my latest answer and the AI’s own pick', () => {
    const plan = toPlan(
      board(
        [
          node('write', {
            tentative: true,
            decisions: [
              { question: '누가 쓰나요?', options: ['나만', '여럿'], answer: '나만', by: 'person' },
              { question: '임시 저장할까요?', options: ['네', '아니요'], answer: '아니요', by: 'ai' },
            ],
          }),
        ],
        { screens: { write: '<main>글쓰기</main>' } },
      ),
      tree,
    );
    const card = plan.cards.write!;
    expect([card.sketch, card.note, card.maybe]).toEqual(['<main>글쓰기</main>', '나만', true]);
    expect(card.decided?.question.text).toBe('임시 저장할까요?');
    expect(card.decided?.picked).toBe(1);
  });
});

describe('pendingQuestion', () => {
  it('is the last question I have not answered, the AI’s pick first', () => {
    const items = [said('블로그'), ask('a1', [{ label: '나만' }, { label: '여럿' }])];
    const pending = pendingQuestion(items);
    expect(pending?.question.about).toBe('write');
    expect(pending?.question.options.map((o) => [o.label, o.recommended])).toEqual([
      ['나만', true],
      ['여럿', false],
    ]);
    expect(pendingQuestion([...items, said('나만')])).toBeNull();
  });
});

describe('planPhase', () => {
  const plan = toPlan(board([node('write')]), tree);
  it('asks while something is left, and is ready once nothing is', () => {
    expect(planPhase(plan, board([node('write')], { undecided: ['느낌'] }), false, false)).toBe('asking');
    expect(planPhase(plan, board([node('write')]), true, false)).toBe('asking');
    expect(planPhase(plan, board([node('write')]), false, false)).toBe('ready');
  });
  it('follows the build once it starts', () => {
    expect(planPhase(plan, board([node('write')], { build: 'running' }), true, false)).toBe('building');
    expect(planPhase(plan, board([node('write')], { build: 'ended' }), false, false)).toBe('built');
    expect(planPhase(plan, board([]), true, false)).toBe('drawing');
  });
});

describe('buildActivity', () => {
  const words = {
    onCard: (title: string) => `${title} 만드는 중`,
    editing: '고치는 중',
    running: '실행 중',
    reading: '읽는 중',
    thinking: '생각 중',
  };
  const call = (id: string, name: string, args: Record<string, unknown>): Item =>
    ({ ...ask(id, []), name, args }) as Item;
  const built = board([node('write', { title: '글 쓰기', sources: ['src/write.tsx'] }), node('read')]);
  it('names the card its latest call is about and the cards its edits touch', () => {
    const items = [
      said('만들어 주세요'),
      call('e1', 'edit', { path: '/p/src/write.tsx' }),
      call('e2', 'write', { path: '/p/.alpine-code/map/features/read.json' }),
      call('b1', 'bash', { command: 'pnpm test' }),
    ];
    expect(buildActivity(items, built, words)).toEqual({ text: '실행 중', touching: ['write', 'read'] });
    expect(buildActivity(items.slice(0, 2), built, words)?.text).toBe('글 쓰기 만드는 중');
    expect(buildActivity([said('만들어 주세요')], built, words)).toBeNull();
  });
});
