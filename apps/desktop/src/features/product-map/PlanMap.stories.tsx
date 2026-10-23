import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, within } from 'storybook/test';

import { BLOG_BUILD, BLOG_DRAFT, BLOG_LOOK_SAMPLE, BLOG_QUESTIONS } from './planBlogExample';
import { PlanMap } from './PlanMap';
import { usePlanScript, type ScriptStart } from './planScript';

/** The map of "개발 블로그 만들어 줘", played as the AI would: every story can be clicked on from where it starts. */
function Scripted({ start }: { start: ScriptStart }) {
  const script = usePlanScript(BLOG_DRAFT, BLOG_QUESTIONS, BLOG_BUILD, start);
  return (
    <div className="h-screen">
      <PlanMap
        plan={script.plan}
        phase={script.phase}
        question={script.question}
        left={script.left}
        look={script.look}
        preview={script.preview}
        thinking={script.thinking}
        activity={script.activity}
        reviewing={script.reviewing}
        sample={BLOG_LOOK_SAMPLE}
        onAnswer={script.answer}
        onAnswerInWords={script.answerInWords}
        onPreview={script.lookAt}
        onDecideRest={script.decideRest}
        onBuild={script.build}
        onReview={script.review}
        onDecide={script.decide}
        onOpenApp={() => {}}
      />
    </div>
  );
}

/**
 * A new project's main screen: the product planned on its map. One line becomes a first guess, questions shape it
 * one at a time, the look comes last, and it is built on the same map.
 */
const meta = {
  title: 'Features/Product map/Plan',
  component: Scripted,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Scripted>;

export default meta;
type Story = StoryObj<typeof meta>;

/** From the start: the first guess draws itself card by card, then the questions begin. Click through to the end. */
export const FromOneLine: Story = { args: { start: 'drawing' } };

/** The first question, on the card it changes, which grows so its screen can be read. */
export const FirstQuestion: Story = { args: { start: { question: 0 } } };

/** Answering puts its promises on the card at once, and the next question moves to its card. */
export const AnswerChangesTheMap: Story = {
  args: { start: { question: 0 } },
  play: async () => {
    const asked = await screen.findByRole('region', { name: /질문|Question/ });
    await userEvent.click(within(asked).getByRole('button', { name: /네, 누구나 읽어요/ }));
    await expect(await screen.findByText('로그인하지 않아도 글을 읽을 수 있어요')).toBeVisible();
    await expect(await screen.findByText('방문자가 댓글을 달 수 있게 할까요?', {}, { timeout: 3000 })).toBeVisible();
  },
};

/** A step that waits on a question is dashed until it is answered. */
export const StepThatDependsOnAnAnswer: Story = { args: { start: { question: 1 } } };

/** The last question is the look: each option restyles the whole map while it is looked at. */
export const PickTheLook: Story = { args: { start: { question: 3 } } };

/** "Decide the rest for me": the AI answers what is left and the cards it decided say so. */
export const DecideTheRest: Story = {
  args: { start: { question: 1 } },
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: /나머지는 알아서 정해 줘|Decide the rest/ }));
    await expect(await screen.findByRole('button', { name: /이대로 만들기|Build it/ })).toBeVisible();
    await expect(screen.getAllByText(/AI가 정함/).length).toBeGreaterThan(0);
  },
};

/** Nothing is left to decide: one button builds it. */
export const ReadyToBuild: Story = { args: { start: 'ready' } };

/**
 * Building is the AI's work, in its own order, and no one needs to watch: the line above the input says what it does
 * now and the cards it touches glow. A screen captured from the running app replaces its sketch; a promise is ticked
 * only once checked. One check fails and is fixed without asking; a question the map did not answer is answered by
 * the AI so the work goes on, and waits on its card for the person.
 */
export const Building: Story = {
  args: { start: 'ready' },
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: /이대로 만들기|Build it/ }));
    await expect(await screen.findByText(/데이터 구조를 짜는 중/)).toBeVisible();
    await expect(await screen.findByText(/로그인 화면이 먼저 나왔어요/, {}, { timeout: 15000 })).toBeVisible();
  },
};

/** Built: real screens on every card, every promise checked, and what the AI decided on its own one click away. */
export const Built: Story = { args: { start: 'built' } };

/** The question the AI answered while building, opened from its card: the answer it went with is marked. */
export const ChangeWhatTheAiDecided: Story = {
  args: { start: 'built' },
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: /AI가 정한 것 1개|decided by the AI/ }));
    const asked = await screen.findByRole('region', { name: /질문|Question/ });
    await userEvent.click(within(asked).getByRole('button', { name: /댓글은 남겨 둬요/ }));
    await expect(await screen.findByText('글을 지워도 댓글은 남아요')).toBeVisible();
  },
};
