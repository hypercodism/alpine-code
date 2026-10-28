import type { Meta, StoryObj } from '@storybook/react-vite';

import { mergeScripts, sessionInfo, sessionScript, setUpScript, type Script } from '@/shared/server';

import { blogBoard, blogBuild, blogConversation, type PlanMoment } from './planExample';
import { ProductMap } from './ProductMap';

const CWD = '/Users/me/dev-blog';

/** The blog's map at one moment of its plan, with its conversation (working while it builds). */
function server(moment: PlanMoment): Script {
  return mergeScripts(
    setUpScript(),
    sessionScript({
      sessions: [
        {
          info: sessionInfo({ id: 'map-1', cwd: CWD, purpose: 'map', title: '지도' }),
          items: blogConversation(moment),
        },
        {
          info: sessionInfo({
            id: 'build-1',
            cwd: CWD,
            purpose: 'build',
            title: '만들기',
            status: moment === 'building' ? 'running' : 'idle',
          }),
          items: blogBuild(moment),
        },
      ],
    }),
    { results: { 'flow/get': () => blogBoard(moment) } },
  );
}

/**
 * One map for every project: a product planned on it reads the same as one mapped from its code (people, their way
 * in, journeys, steps with their screens and promises), with the plan's own parts on top: the screens the AI drew in
 * the look picked, the question above the input on the card it changes, what is left to decide, then what the AI
 * does while building and what it decided on its own.
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
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ProductMap>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기획 중: grey screens until a look is picked, a dashed step that waits on the question, "정할 것 2개". */
export const Planning: Story = { parameters: { server: server('asking') } };

/** The build proposed a TF: it waits for the person's yes, answered from the map. */
export const TeamProposed: Story = { parameters: { server: server('team') } };

/** 만드는 중: what the AI does now above the input; the cards its edits touch outlined with snow on their screens. */
export const Building: Story = { parameters: { server: server('building') } };

/** The build is over with cards left: it says so, and continues where it stopped. */
export const Stopped: Story = { parameters: { server: server('stopped') } };

/** 다 만든: every promise checked, and 앱 열기. */
export const Built: Story = { parameters: { server: server('built') } };
