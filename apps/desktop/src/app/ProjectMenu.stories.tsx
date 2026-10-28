import type { Meta, StoryObj } from '@storybook/react-vite';
import { createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { expect, screen, userEvent, waitFor } from 'storybook/test';

import { chatScript } from '@/shared/server';

import { ProjectMenu } from './ProjectMenu';

/**
 * The project's name with ⌄: the recent projects, then 새 프로젝트 and 보관함. Opening or getting a project already
 * made is under 새 프로젝트's input, not a menu row of its own.
 */
const meta = {
  title: 'Shell/Project menu',
  component: ProjectMenu,
  parameters: { layout: 'fullscreen', server: chatScript({ sessions: [] }) },
  args: { current: null },
  decorators: [
    (Story) => {
      const router = createRouter({
        routeTree: createRootRoute({ component: () => <div className="h-screen p-3">{Story()}</div> }),
      });
      return <RouterProvider router={router} />;
    },
  ],
} satisfies Meta<typeof ProjectMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opened on the 새 프로젝트 screen. */
export const Open: Story = {
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: /다른 프로젝트로|Other projects/ }));
    await waitFor(() => expect(screen.getByRole('list', { name: /최근 프로젝트|Recent/ })).toBeVisible());
  },
};
