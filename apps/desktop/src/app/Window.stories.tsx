import type { Meta, StoryObj } from '@storybook/react-vite';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';

import { blogBoard, blogBuild } from '@/features/product-map/planExample';
import { boardScript } from '@/features/product-map/testBoard';
import { openSettings, useSettingsSheet, type SettingsPlace } from '@/shared/navigation';
import { mergeScripts, sessionInfo, sessionScript, setUpScript } from '@/shared/server';

import { routeTree } from './routeTree.gen';

// A project the scripted server lists.
const cwd = '/Users/me/alpine-code';

/** The whole window on a built blog's board; with `open`, settings is open over it at that place. */
function Window({ open }: { open?: SettingsPlace }) {
  const [router] = useState(() => {
    if (open) openSettings(open);
    else useSettingsSheet.setState({ place: null });
    return createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [`/board?project=${encodeURIComponent(cwd)}`] }),
    });
  });
  return <RouterProvider router={router} />;
}

/**
 * The window has one shape: a project's board, the place beside it, and the rail. Settings is reached from the rail's
 * 설정 (and ⌘, and ⋯ › 설정), or from 스킬 n beside the agent in the input bar, which opens that agent; either way it
 * is one sheet over the board, and closing it is going back.
 */
const meta = {
  title: 'Shell/Window',
  component: Window,
  parameters: {
    layout: 'fullscreen',
    server: mergeScripts(
      setUpScript(),
      { results: { 'devServers/list': { servers: [] } } },
      sessionScript({
        sessions: [
          {
            info: sessionInfo({ id: 'map-1', cwd, purpose: 'map', title: '보드' }),
            items: [{ id: 'u1', kind: 'user_message', text: '개발 블로그 만들어 줘' }],
          },
          { info: sessionInfo({ id: 'build-1', cwd, purpose: 'build', title: '만들기' }), items: blogBuild('built') },
          // A conversation of its own, which 지난 대화 (⌘K) can delete; the map's and the build's go with the project.
          {
            info: sessionInfo({ id: 'chat-1', cwd, title: '로그인 버튼 고치기' }),
            items: [{ id: 'c1', kind: 'user_message', text: '로그인 버튼이 안 눌려' }],
          },
        ],
      }),
      boardScript({ ...blogBoard('built'), build: 'ended' }),
    ),
  },
} satisfies Meta<typeof Window>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The board with 설정 at the bottom of the rail and 스킬 n beside the agent in the input bar. */
export const Board: Story = {};

/** Settings opened from the rail: the agents first, since giving the AI skills and tools is what it is opened for. */
export const SettingsOpen: Story = { args: { open: 'agents' } };
