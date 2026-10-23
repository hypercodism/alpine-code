import type { Meta, StoryObj } from '@storybook/react-vite';
import clsx from 'clsx';
import { History, LoaderCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';

import { BLOG_BUILD, BLOG_DRAFT, BLOG_LOOK_SAMPLE, BLOG_QUESTIONS, BLOG_RECORD } from './planBlogExample';
import { PlanMap } from './PlanMap';
import { AllRecords, CardRecord, RecordReply } from './PlanRecord';
import { usePlanScript } from './planScript';
import { WIREFRAME } from './planThemes';

type Side = { card: string } | { record: true; open?: string } | null;

/** The projects, with no sessions under them: a project is its map. Only for this board. */
function ProjectsRail() {
  const projects = [
    { name: 'dev-blog', short: 'DB', state: '완성', tone: 'bg-avatar-2 text-avatar-2-ink', current: true },
    { name: '꽃집 예약', short: '꽃', state: '만드는 중', tone: 'bg-avatar-5 text-avatar-5-ink', busy: true },
    { name: 'flask', short: 'FL', state: '지도 그리기 전', tone: 'bg-avatar-3 text-avatar-3-ink' },
  ];
  return (
    <nav aria-label="프로젝트" className="flex w-60 shrink-0 flex-col gap-0.5 px-2 pt-3">
      <button
        type="button"
        className="mb-3 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-body text-fg hover:bg-hover"
      >
        <Plus size={15} aria-hidden />새 프로젝트
      </button>
      {projects.map((project) => (
        <a
          key={project.name}
          href="#"
          aria-current={project.current || undefined}
          className={clsx(
            'flex items-center gap-2.5 rounded-lg px-2 py-1.5',
            project.current ? 'bg-canvas-raised' : 'hover:bg-hover',
          )}
        >
          <span className={clsx('flex size-7 shrink-0 items-center justify-center rounded-lg text-meta', project.tone)}>
            {project.short}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body text-fg">{project.name}</span>
            <span
              className={clsx('flex items-center gap-1 text-meta', project.busy ? 'text-interactive' : 'text-fg-muted')}
            >
              {project.busy && <LoaderCircle size={11} className="animate-spin" aria-hidden />}
              {project.state}
            </span>
          </span>
        </a>
      ))}
    </nav>
  );
}

/** A built project as its own home: the map, with what was done kept under its cards instead of a session screen. */
function Home({ side: initial = null, asked = false }: { side?: Side; asked?: boolean }) {
  const script = usePlanScript(BLOG_DRAFT, BLOG_QUESTIONS, BLOG_BUILD, 'built');
  const [side, setSide] = useState<Side>(initial);
  const theme = (script.look ?? WIREFRAME).css;
  const card = side && 'card' in side ? script.plan.cards[side.card] : undefined;
  const deploy = BLOG_RECORD.find((thread) => thread.id === 't-deploy');
  const recordOpen = !!side && 'record' in side;
  return (
    <div className="flex h-screen bg-canvas-sunken">
      <ProjectsRail />
      <div className="min-w-0 flex-1">
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
          selected={card?.id ?? null}
          onOpenCard={(id) => setSide(card?.id === id ? null : { card: id })}
          headerEnd={
            <button
              type="button"
              aria-pressed={recordOpen}
              onClick={() => setSide(recordOpen ? null : { record: true })}
              className={clsx(
                'ml-2 flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-meta hover:bg-hover',
                recordOpen ? 'bg-hover text-fg' : 'text-fg-muted',
              )}
            >
              <History size={13} aria-hidden />
              기록
            </button>
          }
          reply={
            asked && deploy ? (
              <RecordReply thread={deploy} onOpen={() => setSide({ record: true, open: 't-deploy' })} />
            ) : undefined
          }
          side={
            card ? (
              <CardRecord card={card} theme={theme} threads={BLOG_RECORD} onClose={() => setSide(null)} />
            ) : side && 'record' in side ? (
              <AllRecords
                plan={script.plan}
                threads={BLOG_RECORD}
                open={side.open}
                onOpenCard={(id) => setSide({ card: id })}
                onClose={() => setSide(null)}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}

/**
 * The session screen folded into the map. A project opens on its map; the left list has projects only. What was
 * asked and done is kept under the cards it touched, opened beside the map; the record lists every request, the ones
 * that touched no card too. Click any card, or 기록 at the top.
 */
const meta = {
  title: 'Features/Product map/Project home',
  component: Home,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Home>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opening a built project: its map, nothing else to read. */
export const OpensOnTheMap: Story = {};

/** A card opened: its real screen, its promises with what each check saw, and every request that touched it. */
export const CardOpened: Story = {
  args: { side: { card: 'read' } },
  play: async () => {
    const panel = await screen.findByRole('complementary', { name: '글 읽기' });
    await expect(
      within(panel).getByText('글은 로그인 없이 보이게 고쳤어요. 로그인은 글을 쓸 때만 물어요.'),
    ).toBeVisible();
    await userEvent.click(within(panel).getAllByRole('button', { name: /바꾼 것 1개/ })[0]!);
    await expect(within(panel).getByText('src/App.tsx')).toBeVisible();
  },
};

/** Clicking a card on the map opens it beside the map; clicking it again closes it. */
export const ClickACard: Story = {
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: '로그인', pressed: false }));
    await expect(await screen.findByRole('complementary', { name: '로그인' })).toBeVisible();
  },
};

/** The whole record: every request, newest first, with the cards it touched or "지도 밖". */
export const Record: Story = { args: { side: { record: true } } };

/** Something asked in the map's input that is about no card: the answer shows above the input and is kept in the record. */
export const AskedOffTheMap: Story = {
  args: { asked: true },
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: '기록에서 보기' }));
    const panel = await screen.findByRole('complementary', { name: '기록' });
    await expect(within(panel).getByText(/데이터베이스 주소가 비어 있어서/)).toBeVisible();
  },
};
