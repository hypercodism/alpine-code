import type { FlowGetResult, ProjectInfo } from '@alpine/protocol';

import { sessionInfo, type Item, type Script, type ScriptContext } from '@/shared/server';

import { blogBoard, blogBuild, blogConversation, type PlanMoment } from './planExample';

/**
 * A planned product for the app in a plain browser (`pnpm dev`, no server process): the blog of the stories, on its
 * map, which the scripted server walks through as the person does. Its conversation waits on the first question;
 * answers shrink what is left to decide, 이대로 만들기 starts a build (the scripted turn, which asks before a command),
 * and the build's end decides the map: every card built, or stopped part way when it was stopped.
 */
export const PLAN_DEMO_CWD = '/Users/me/dev-blog';

const PROJECT: ProjectInfo = {
  path: PLAN_DEMO_CWD,
  name: 'dev-blog',
  branch: 'main',
  lastUsedAt: new Date().toISOString(),
  archived: false,
  lastAgent: null,
};

/** The plan's conversation, waiting on its first question. */
export const PLAN_DEMO_SESSIONS: { info: ReturnType<typeof sessionInfo>; items: Item[] }[] = [
  {
    info: sessionInfo({ id: 'blog-map', cwd: PLAN_DEMO_CWD, purpose: 'map', title: '개발 블로그 만들어 줘' }),
    items: blogConversation('asking'),
  },
];

/** The plan built by an AI 팀 at work (`alpine.demo` `{ "planTeam": true }`): its build conversation, with the team. */
export const PLAN_TEAM_SESSIONS: { info: ReturnType<typeof sessionInfo>; items: Item[] }[] = [
  {
    info: sessionInfo({ id: 'blog-build', cwd: PLAN_DEMO_CWD, purpose: 'build', title: 'Build the planned product' }),
    items: blogBuild('team').map((item) =>
      item.kind === 'taskforce' ? { ...item, status: 'running', startedAt: new Date().toISOString() } : item,
    ),
  },
];

type Results = NonNullable<Script['results']>;

/** `inner` with the blog plan on top: its project, its map, and its conversations' effect on the map. */
export function planDemo(inner: Script, { team = false }: { team?: boolean } = {}): Script {
  const results = inner.results ?? {};
  const call = async <M extends keyof Results>(method: M, params: unknown, context: ScriptContext) => {
    const result = results[method] as unknown;
    if (result === undefined) throw new Error(`The script has no result for ${method}`);
    return typeof result === 'function' ? await result(params, context) : result;
  };
  let undecided = ['댓글을 받을까요', '어떤 느낌으로 만들까요'];
  let build: string | null = team ? 'blog-build' : null;

  /** The map as the plan stands: asking until the build starts, then following the build's conversation. */
  const board = async (context: ScriptContext): Promise<FlowGetResult> => {
    let moment: PlanMoment = 'asking';
    let state: FlowGetResult['build'] = 'none';
    if (build) {
      const open = (await call('session/open', { sessionId: build }, context)) as {
        info: { status: string };
        items: Item[];
      };
      const turn = open.items.slice(open.items.findLastIndex((item) => item.kind === 'user_message') + 1);
      // A team at work builds too, while its conversation waits for it.
      const busy =
        open.info.status === 'running' ||
        open.info.status === 'waiting' ||
        open.items.some((item) => item.kind === 'taskforce' && item.status === 'running');
      moment = busy ? 'building' : turn.some((item) => item.kind === 'run_stopped') ? 'stopped' : 'built';
      state = busy ? 'running' : 'ended';
    }
    const base = blogBoard(moment);
    return {
      ...base,
      revision: `blog-${moment}-${undecided.length}`,
      etag: `blog-${moment}-${undecided.length}`,
      build: state,
      buildSession: build,
      ...(build ? {} : { undecided }),
    };
  };

  return {
    events: inner.events,
    results: {
      ...results,
      'projects/list': async (params, context) => {
        const listed = (await call('projects/list', params, context)) as { projects: ProjectInfo[]; clones: [] };
        return listed.projects.some((p) => p.path === PLAN_DEMO_CWD)
          ? listed
          : { ...listed, projects: [...listed.projects, PROJECT] };
      },
      'flow/get': async (params, context) =>
        params.cwd === PLAN_DEMO_CWD ? board(context) : (call('flow/get', params, context) as Promise<FlowGetResult>),
      'flow/prepare': async (params, context) => {
        if (params.cwd !== PLAN_DEMO_CWD) return call('flow/prepare', params, context) as never;
        if (params.action === 'build') build = params.sessionId ?? null;
        return { board: await board(context), nodeId: params.nodeId ?? null, prompt: params.request ?? '' };
      },
      'session/send': async (params, context) => {
        if (params.sessionId === 'blog-map' && !build) {
          // Leaving the rest to the AI decides everything; any other answer settles one decision.
          if (/알아서 정해/.test(params.text)) undecided = [];
          else if (!/물어봐/.test(params.text)) undecided = undecided.slice(1);
        }
        return call('session/send', params, context) as never;
      },
    },
  };
}
