import type { FlowGetResult, FlowNode } from '@alpine/protocol';
import { describe, expect, it } from 'vitest';

import type { Item } from '@/shared/server';

import { toTreeMap } from './flowTreeData';
import { buildActivity, pendingQuestion, planPhase } from './planData';
import { blogBoard } from './planExample';

const node = (id: string, more: Partial<FlowNode> = {}): FlowNode => ({ id, title: id, phase: 'planned', ...more });
const board = (nodes: FlowNode[], more: Partial<FlowGetResult> = {}): FlowGetResult => ({
  revision: 'r',
  planned: true,
  document: { nodes, flows: [], edges: [] },
  ...more,
});
const words = {
  unnamed: { ko: '누군가', en: 'Someone' },
  unnamedRole: { ko: '', en: '' },
  unplaced: { ko: '정리 전', en: 'Not placed' },
};

const call = (id: string, name: string, args: Record<string, unknown>): Item =>
  ({
    id,
    kind: 'tool_call',
    name,
    args,
    status: 'done',
    result: '',
    images: 0,
    commandResult: null,
    fileChanges: null,
  }) as Item;
const ask = (id: string, options: unknown[]) =>
  call(id, 'ask_user', { question: '누가 쓰나요?', about: 'write', options });
const said = (text: string): Item => ({ id: `u-${text}`, kind: 'user_message', text }) as Item;

describe('a planned map read person first', () => {
  it('shows each card with its planned screen and what was decided on it', () => {
    const tree = toTreeMap(blogBoard('building'), new Set(), 'blog', words);
    expect(tree.cards.list?.screen?.kind).toBe('planned');
    expect(tree.cards.publish?.picks?.at(-1)).toMatchObject({ answer: '같이 지워요', by: 'ai' });
    expect(tree.people.map((person) => person.name.ko)).toEqual(['방문자', '글쓴이']);
  });

  it('shows cards no journey holds yet in a row of their own, only when asked to', () => {
    const tree = toTreeMap(board([node('home', { tentative: true })]), new Set(), 'blog', words);
    expect(tree.people.map((p) => [p.name.ko, p.journeys[0]?.steps])).toEqual([['정리 전', ['home']]]);
    expect(tree.cards.home?.tentative).toBe(true);
    const plain = { unnamed: words.unnamed, unnamedRole: words.unnamedRole };
    expect(toTreeMap(board([node('home')]), new Set(), 'blog', plain).people).toEqual([]);
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
  it('asks while something is left, and is ready once nothing is', () => {
    expect(planPhase(board([node('write')], { undecided: ['느낌'] }), false, false)).toBe('asking');
    expect(planPhase(board([node('write')]), true, false)).toBe('asking');
    expect(planPhase(board([node('write')]), false, false)).toBe('ready');
    expect(planPhase(board([]), true, false)).toBe('drawing');
  });
  it('follows the build and its TF once it starts', () => {
    const quiet = { working: false, team: null };
    const running = board([node('write')], { build: 'running' });
    const ended = board([node('write')], { build: 'ended' });
    expect(planPhase(running, false, false, { working: true, team: null })).toBe('building');
    // The build proposed a TF and waits: not over, it waits for the person's yes.
    expect(planPhase(ended, false, false, { working: false, team: 'proposed' })).toBe('team');
    expect(planPhase(ended, false, false, { working: false, team: 'running' })).toBe('building');
    // Over: built only when every card is.
    expect(planPhase(ended, false, false, quiet)).toBe('stopped');
    expect(planPhase(board([node('write', { phase: 'built' })], { build: 'ended' }), false, false, quiet)).toBe(
      'built',
    );
  });
});

describe('buildActivity', () => {
  const activity = {
    onCard: (title: string) => `${title} 만드는 중`,
    editing: '고치는 중',
    running: '실행 중',
    reading: '읽는 중',
    thinking: '생각 중',
  };
  const built = board([node('write', { title: '글 쓰기', sources: ['src/write.tsx'] }), node('read')]);
  it('names the card its latest call is about and the cards its edits touch', () => {
    const items = [
      said('만들어 주세요'),
      call('e1', 'edit', { path: '/p/src/write.tsx' }),
      call('e2', 'write', { path: '/p/.alpine-code/map/features/read.json' }),
      call('b1', 'bash', { command: 'pnpm test' }),
    ];
    expect(buildActivity(items, built, activity)).toEqual({ text: '실행 중', touching: ['write', 'read'] });
    expect(buildActivity(items.slice(0, 2), built, activity)?.text).toBe('글 쓰기 만드는 중');
    expect(buildActivity([said('만들어 주세요')], built, activity)).toBeNull();
  });
});
