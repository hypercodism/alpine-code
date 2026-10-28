import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';

import { chatScript, cloudScript, mergeScripts } from '@/shared/server';

import { NewProject } from './NewProject';

const server = mergeScripts(
  chatScript({ newProject: { judgeMs: 600, createMs: 500 } }),
  cloudScript({ signedIn: true }),
);

function Example({ folder = null }: { folder?: string | null }) {
  return (
    <div className="flex h-screen">
      <NewProject folder={folder} onPlanning={fn()} />
    </div>
  );
}

/**
 * 새 프로젝트, the one place a new product starts: one line, where to make it (a new folder, or an empty folder the
 * person made), the setup the AI picks, and the project made with its map planning the idea.
 */
const meta = {
  title: 'New session/New project',
  component: Example,
  parameters: { server, layout: 'fullscreen' },
} satisfies Meta<typeof Example>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Under the input, a project already made is opened from this computer or got from a repository. */
export const Ready: Story = {};

/** 회사·팀 프로젝트 받기 under the input: the repository address, in a dialog over the screen. */
export const GettingAProject: Story = {
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: /회사·팀 프로젝트 받기|Get a company or team project/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  },
};

/** Where it is made: a new folder in the clone folder, or an empty folder picked here. */
export const Where: Story = {
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: /^(만들 곳|Make it in):/ }));
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /빈 폴더 고르기|Pick an empty folder/ })).toBeVisible(),
    );
  },
};

/** Opened from the map of an empty folder: that folder is where it is made. */
export const InAFolder: Story = { args: { folder: '/Users/me/Developments/devlog' } };

/** After sending: the AI's pick of a setup, then 만들기. */
export const PickingASetup: Story = {
  play: async () => {
    await userEvent.type(await screen.findByLabelText(/메시지|Message/), '동네 공방 원데이 클래스 예약 페이지');
    await userEvent.click(screen.getByRole('button', { name: /보내기|Send/ }));
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeVisible(), { timeout: 3000 });
  },
};
