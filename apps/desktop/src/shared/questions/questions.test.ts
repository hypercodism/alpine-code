import type { ToolCallItem } from '@alpine/protocol';
import { describe, expect, it } from 'vitest';

import type { Item } from '@/shared/server';

import { answerTo, lookCss, pageOf, readQuestion, type Look } from './questions';

const LOOK: Look = {
  page: '#fff',
  surface: '#f5f5f5',
  ink: '#171717',
  muted: '#737373',
  line: '#e5e5e5',
  accent: '#ea580c',
  on_accent: '#fff',
  display: 'serif',
  body: 'sans-serif',
  radius: '10px',
};

const call = (args: Record<string, unknown>): ToolCallItem => ({
  id: 'c1',
  kind: 'tool_call',
  name: 'ask_user',
  args,
  status: 'done',
  result: '',
  images: 0,
  commandResult: null,
  fileChanges: null,
});

describe('readQuestion', () => {
  it('keeps the options that have a label, the pick first', () => {
    const question = readQuestion(
      call({ question: '누가 쓰나요?', options: [{ label: ' 나만 ' }, { detail: 'no label' }, { label: '여럿' }] }),
    );
    expect(question?.options.map((o) => o.label)).toEqual(['나만', '여럿']);
    expect(question?.about).toBeNull();
  });

  it('reads a look only when every token is there', () => {
    const question = readQuestion(
      call({
        question: 'q',
        options: [
          { label: 'a', look: LOOK },
          { label: 'b', look: { page: '#000' } },
        ],
      }),
    );
    expect(question?.options.map((o) => o.look)).toEqual([LOOK, null]);
  });

  it('is nothing without options', () => {
    expect(readQuestion(call({ question: 'q', options: [] }))).toBeNull();
  });
});

describe('lookCss', () => {
  it('sets the token variables', () => {
    expect(lookCss(LOOK)).toContain('--on-accent:#fff');
    expect(lookCss(LOOK)).toContain('--radius:10px');
  });
});

describe('pageOf', () => {
  it('shows the one page drawn in every look', () => {
    const question = readQuestion(
      call({
        question: 'q',
        options: [
          { label: 'a', look: LOOK },
          { label: 'b', html: '<p>page</p>', look: LOOK },
        ],
      }),
    )!;
    expect(question.options.map((o) => pageOf(question, o))).toEqual(['<p>page</p>', '<p>page</p>']);
  });
});

describe('answerTo', () => {
  const asked = call({ question: 'q', options: [{ label: '나만' }, { label: '여럿' }] });
  const question = readQuestion(asked)!;
  const reply = (text: string): Item => ({ id: 'u', kind: 'user_message', text }) as Item;

  it('waits until I answer', () => {
    expect(answerTo([asked], asked, question)).toBeNull();
  });

  it('knows the option I picked, or that I said something else', () => {
    expect(answerTo([asked, reply('여럿')], asked, question)?.picked?.label).toBe('여럿');
    expect(answerTo([asked, reply('셋이서 써요')], asked, question)).toEqual({ picked: null });
  });
});
