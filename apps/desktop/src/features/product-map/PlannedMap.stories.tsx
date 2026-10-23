import type { FlowGetResult, FlowNode, ProductFlow } from '@alpine/protocol';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { mergeScripts, sessionInfo, sessionScript, setUpScript, type Item, type Script } from '@/shared/server';

import { BLOG_DRAFT, BLOG_QUESTIONS } from './planBlogExample';
import { ProductMap } from './ProductMap';

const CWD = '/Users/me/dev-blog';

/** The blog's first guess as the AI writes it into the map files: cards, journeys and one screen per card. */
function draftBoard(extra: Partial<FlowGetResult> = {}): FlowGetResult {
  const nodes: FlowNode[] = Object.values(BLOG_DRAFT.cards).map((card) => ({
    id: card.id,
    title: card.title,
    kind: 'screen',
    phase: 'planned',
    tentative: !!card.maybe,
    conditions: card.promises.map((p) => ({ id: p.id, expectation: p.then })),
  }));
  const flows: ProductFlow[] = BLOG_DRAFT.people.flatMap((person) =>
    person.journeys.map((journey) => ({
      id: journey.id,
      title: journey.title.ko,
      description: journey.goal.ko,
      actor: person.name.ko,
      nodeIds: journey.steps,
      edges: journey.steps.slice(1).map((step, i) => ({ source: journey.steps[i]!, target: step })),
    })),
  );
  return {
    revision: 'plan-1',
    etag: `plan-${JSON.stringify(extra).length}`,
    exists: true,
    planned: true,
    document: { nodes, flows, edges: [] },
    screens: Object.fromEntries(Object.values(BLOG_DRAFT.cards).map((card) => [card.id, card.sketch])),
    undecided: ['누가 글을 쓰나요', '댓글을 받을까요', '어떤 느낌으로 만들까요'],
    ...extra,
  };
}

/** The AI's first question, as its `ask_user` call in the map's conversation. */
const asked = (question = BLOG_QUESTIONS[0]!): Item => ({
  id: 'ask-1',
  kind: 'tool_call',
  name: 'ask_user',
  args: {
    question: question.text,
    about: question.about,
    options: question.options.map((o) => ({ label: o.label, detail: o.detail ?? '' })),
  },
  status: 'done',
  result: "Asked. End your turn now; the person's answer comes back as their next message.",
  images: 0,
  commandResult: null,
  fileChanges: null,
});

function planned(board: FlowGetResult, items: Item[]): Script {
  return mergeScripts(
    setUpScript(),
    sessionScript({
      sessions: [{ info: sessionInfo({ id: 'map-1', cwd: CWD, purpose: 'map', title: '지도' }), items }],
    }),
    { results: { 'flow/get': () => board } },
  );
}

/**
 * A project that began as a plan opens on the plan: the real map files (cards, journeys, screens, what is left to
 * decide) and the question the map's conversation is waiting on.
 */
const meta = {
  title: 'Features/Product map/Planned',
  component: ProductMap,
  args: { cwd: CWD, sessionId: 'map-1', onSession: () => {} },
  decorators: [
    (Story) => (
      <div className="flex h-200 w-full">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    server: planned(draftBoard(), [{ id: 'u1', kind: 'user_message', text: '개발 블로그 만들어 줘' }, asked()]),
  },
} satisfies Meta<typeof ProductMap>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The first guess with its first question on the card it changes. */
export const Asking: Story = {};

/** Picking an answer sends it to the map's conversation as my words. */
export const Answering: Story = {
  play: async () => {
    const question = await screen.findByRole('region', { name: /질문|Question/ });
    const first = BLOG_QUESTIONS[0]!.options[0]!.label;
    await userEvent.click(within(question).getByRole('button', { name: new RegExp(first) }));
    await waitFor(() => expect(screen.queryByRole('region', { name: /질문|Question/ })).toBeNull());
  },
};

/** Nothing left to decide: one button builds it. */
export const Ready: Story = {
  parameters: {
    server: planned(
      draftBoard({
        undecided: [],
        look: {
          page: '#ffffff',
          surface: '#f5f5f5',
          ink: '#171717',
          muted: '#737373',
          line: '#e5e5e5',
          accent: '#171717',
          onAccent: '#ffffff',
          display: "'Noto Serif KR', serif",
          body: 'Pretendard, sans-serif',
          radius: '10px',
        },
      }),
      [{ id: 'u1', kind: 'user_message', text: '개발 블로그 만들어 줘' }],
    ),
  },
};
