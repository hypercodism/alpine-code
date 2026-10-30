import type { Meta, StoryObj } from '@storybook/react-vite';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import type { FlowGetResult } from '@alpine/protocol';
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

/** A board whose 글 쓰기 screen breaks its first promise. */
function brokenBlog(): FlowGetResult {
  const board = { ...blogBoard('built'), build: 'ended' as const };
  const write = board.document!.nodes!.find((node) => node.id === 'write')!;
  const promise = write.conditions![0]!.id;
  return {
    ...board,
    states: {
      ...board.states,
      write: {
        ...board.states!.write!,
        promises: { ...board.states!.write!.promises, [promise]: { status: 'failed' } },
      },
    },
  };
}

/** The app running (here a page standing in for it) with a promise broken: one red line over it, never on it. */
export const AppBroken: Story = {
  parameters: {
    server: mergeScripts(
      setUpScript(),
      (() => {
        const server = {
          id: 'dev-1',
          cwd,
          command: 'npm run dev',
          port: 5173,
          status: 'running' as const,
          url: 'about:blank#app',
          external: false,
        };
        return { results: { 'devServers/open': { server }, 'devServers/list': { servers: [server] } } };
      })(),
      sessionScript({
        sessions: [
          {
            info: sessionInfo({ id: 'map-1', cwd, purpose: 'map', title: '보드' }),
            items: [
              { id: 'u1', kind: 'user_message', text: 'RSS 주소 안내가 헷갈려요. 고쳐 줘' },
              {
                id: 'a1',
                kind: 'agent_message',
                agent: null,
                text: '고쳤어요. 인터넷에 올리기 전에는 주소 대신 "올리면 주소가 생겨요"라고 보여 줘요.\n\n[글 쓰기 화면 보기](#screen:write)',
              },
            ],
          },
          { info: sessionInfo({ id: 'build-1', cwd, purpose: 'build', title: '만들기' }), items: blogBuild('built') },
        ],
      }),
      boardScript(brokenBlog()),
    ),
  },
};
