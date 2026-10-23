import type { FlowGetResult, FlowNode, MapLook, ProductFlow } from '@alpine/protocol';

import type { Item } from '@/shared/server';

/**
 * What the AI might write into the map files for "개발 블로그 만들어 줘", for the stories: two people, six screens
 * drawn with the theme tokens, the promises it assumes, and how the plan stands at three moments (asking, building,
 * built).
 */

const tag = (text: string) => `<span class="rounded-card bg-surface px-3 py-1 text-xs text-muted">${text}</span>`;

const post = (title: string, excerpt: string, meta: string) => `<article class="border-b border-line pb-5 pt-5">
  <div class="h-28 rounded-card bg-surface"></div>
  <p class="mt-3 text-xs text-muted">${meta}</p>
  <h2 class="font-display mt-1 text-lg font-bold leading-snug">${title}</h2>
  <p class="mt-1 text-sm leading-6 text-muted">${excerpt}</p>
</article>`;

const list = `<div class="px-5 py-6">
  <div class="flex items-center justify-between">
    <span class="font-display text-xl font-bold">개발자의 기록</span>
    <span class="rounded-card bg-accent px-3 py-1 text-xs text-on-accent">구독</span>
  </div>
  <div class="mt-4 flex gap-2">${tag('전체')}${tag('데이터베이스')}${tag('회고')}</div>
  ${post('Cloudflare D1에서 트랜잭션 없이 살아남기', 'batch로 묶어서 같은 효과를 내는 방법과 그 한계.', '10월 18일 · 6분')}
  ${post('React 19 폼 액션, 3주 써 보니', '지운 코드가 생각보다 많았다. 좋았던 점 셋.', '10월 9일 · 4분')}
  ${post('사이드 프로젝트를 3년째 유지하는 법', '매주 한 시간만 쓴다는 규칙.', '9월 27일 · 8분')}
</div>`;

const read = `<div class="px-5 py-6">
  <p class="text-sm text-muted">← 글 목록</p>
  <p class="mt-5">${tag('데이터베이스')}</p>
  <h1 class="font-display mt-3 text-2xl font-bold leading-snug">Cloudflare D1에서 트랜잭션 없이 살아남기</h1>
  <p class="mt-2 text-xs text-muted">10월 18일 · 6분 읽기</p>
  <div class="mt-5 h-36 rounded-card bg-surface"></div>
  <p class="mt-5 text-[15px] leading-7">db.transaction이 없다는 걸 배포 직전에 알았다. 처음엔 당황했지만, D1에는 batch가 있다.</p>
  <pre class="mt-4 rounded-card bg-surface p-3 text-xs leading-5 text-ink">await db.batch([
  insert(posts),
  update(tags),
])</pre>
  <p class="mt-4 text-[15px] leading-7">batch 안의 문장은 한꺼번에 반영되거나, 하나도 반영되지 않는다.</p>
</div>`;

const comment = `<div class="px-5 py-6">
  <p class="text-[15px] leading-7 text-muted">…하나도 반영되지 않는다. 끝.</p>
  <h2 class="font-display mt-6 text-lg font-bold">댓글 2</h2>
  <div class="mt-3 rounded-card border border-line p-3">
    <p class="text-sm text-muted">댓글을 남겨 주세요</p>
    <div class="mt-8 flex justify-end"><span class="rounded-card bg-accent px-4 py-1.5 text-sm text-on-accent">남기기</span></div>
  </div>
  <div class="mt-5 flex gap-3"><span class="size-8 shrink-0 rounded-full bg-surface"></span>
    <div><p class="text-sm font-semibold">민지</p><p class="mt-1 text-sm leading-6">batch 실패하면 전부 되돌아가나요?</p></div></div>
  <div class="mt-4 flex gap-3"><span class="size-8 shrink-0 rounded-full bg-surface"></span>
    <div><p class="text-sm font-semibold">한결</p><p class="mt-1 text-sm leading-6">네, 하나라도 실패하면 아무것도 반영되지 않아요.</p></div></div>
</div>`;

const login = `<div class="flex min-h-[520px] flex-col justify-center px-8">
  <p class="font-display text-2xl font-bold">개발자의 기록</p>
  <p class="mt-2 text-sm text-muted">글쓴이만 로그인해요</p>
  <div class="mt-8 rounded-card border border-line px-4 py-3 text-sm text-muted">you@example.com</div>
  <div class="mt-3 rounded-card bg-accent py-3 text-center text-sm text-on-accent">이메일로 코드 받기</div>
  <p class="mt-4 text-center text-xs text-muted">비밀번호 없이 들어와요</p>
</div>`;

const write = `<div class="px-5 py-5">
  <div class="flex items-center justify-between text-sm">
    <span class="text-muted">임시 저장됨</span>
    <span class="rounded-card bg-accent px-4 py-1.5 text-on-accent">발행</span>
  </div>
  <p class="font-display mt-6 text-2xl font-bold text-muted">제목을 입력하세요</p>
  <div class="mt-5 flex flex-col gap-3 text-[15px] leading-7">
    <p><span class="text-muted">##</span> 시작하며</p>
    <p>D1을 쓰다가 막힌 이야기.</p>
    <p class="rounded-card bg-surface p-3 text-xs leading-5">\`\`\`ts<br>await db.batch([...])<br>\`\`\`</p>
    <p class="text-muted">- 배운 점</p>
  </div>
</div>`;

const publish = `<div class="px-5 py-6">
  <h1 class="font-display text-xl font-bold">발행하기</h1>
  <div class="mt-5 h-32 rounded-card bg-surface"></div>
  <p class="mt-4 text-sm text-muted">한 줄 요약</p>
  <div class="mt-1 rounded-card border border-line px-3 py-2 text-sm">batch로 트랜잭션 흉내 내기</div>
  <p class="mt-4 text-sm text-muted">태그</p>
  <div class="mt-2 flex gap-2">${tag('데이터베이스')}${tag('+ 추가')}</div>
  <div class="mt-8 rounded-card bg-accent py-3 text-center text-sm text-on-accent">지금 발행</div>
</div>`;

/** The look picked for the blog ("Medium 참고"). */
export const QUIET_LOOK: MapLook = {
  page: '#ffffff',
  surface: '#f5f5f5',
  ink: '#171717',
  muted: '#737373',
  line: '#e5e5e5',
  accent: '#171717',
  onAccent: '#ffffff',
  display: "'Noto Serif KR', serif",
  body: "'Pretendard Variable', Pretendard, system-ui, sans-serif",
  radius: '10px',
};

const SCREENS: Record<string, string> = { list, read, comment, login, write, publish };

const card = (id: string, title: string, promises: [string, string][], more: Partial<FlowNode> = {}): FlowNode => ({
  id,
  title,
  kind: 'screen',
  phase: 'planned',
  conditions: promises.map(([cid, expectation]) => ({ id: cid, expectation })),
  ...more,
});

const NODES: FlowNode[] = [
  card('list', '글 목록 보기', [
    ['p-latest', '최신 글이 먼저 나와요'],
    ['p-tag', '태그를 누르면 그 태그의 글만 보여요'],
  ]),
  card('read', '글 읽기', [
    ['p-open', '로그인하지 않아도 글을 읽을 수 있어요'],
    ['p-url', '글마다 주소가 따로 있어요'],
  ]),
  card('comment', '댓글 달기', [['p-comment', '로그인한 사람만 댓글을 달 수 있어요']], { tentative: true }),
  card('login', '로그인', [['p-only-me', '나만 글을 쓸 수 있어요']]),
  card('write', '글 쓰기', [
    ['p-markdown', '마크다운으로 쓰면 바로 미리 보여요'],
    ['p-draft', '쓰던 글은 저절로 임시 저장돼요'],
  ]),
  card('publish', '발행', [['p-publish', '발행하면 글 목록 맨 위에 나와요']]),
];

const FLOWS: ProductFlow[] = [
  {
    id: 'reading',
    title: '글 찾아 읽기',
    description: '방문자가 관심 있는 글을 찾아 읽을 수 있어야 한다',
    trigger: '블로그 주소로 들어와요',
    actor: '방문자',
    nodeIds: ['list', 'read', 'comment'],
    edges: [
      { source: 'list', target: 'read' },
      { source: 'read', target: 'comment', label: '댓글을 달고 싶을 때' },
    ],
  },
  {
    id: 'writing',
    title: '글 써서 올리기',
    description: '글쓴이가 마크다운으로 글을 써서 올릴 수 있어야 한다',
    trigger: '로그인해요',
    actor: '글쓴이',
    nodeIds: ['login', 'write', 'publish'],
    edges: [
      { source: 'login', target: 'write' },
      { source: 'write', target: 'publish' },
    ],
  },
];

export type PlanMoment = 'asking' | 'team' | 'building' | 'stopped' | 'built';

/** The blog's map at one moment of its plan. */
export function blogBoard(moment: PlanMoment): FlowGetResult {
  const building = moment !== 'asking';
  const started = moment === 'building' || moment === 'stopped' || moment === 'built';
  const nodes = NODES.map((node) => {
    if (!building) return node;
    const phase =
      moment === 'built' || (started && ['login', 'list', 'read'].includes(node.id))
        ? 'built'
        : moment === 'building'
          ? 'building'
          : 'planned';
    const decisions =
      node.id === 'publish'
        ? [
            {
              question: '글을 지우면 거기 달린 댓글은 어떻게 할까요?',
              options: ['같이 지워요', '댓글은 남겨 둬요'],
              answer: '같이 지워요',
              by: 'ai' as const,
            },
          ]
        : node.id === 'comment'
          ? [
              {
                question: '방문자가 댓글을 달 수 있게 할까요?',
                options: ['로그인한 사람만', '누구나', '댓글 없이'],
                answer: '로그인한 사람만',
                by: 'person' as const,
              },
            ]
          : [];
    const sources = node.id === 'write' ? ['src/routes/write.tsx'] : [];
    return { ...node, phase, tentative: false, decisions, sources } as FlowNode;
  });
  const passed = (id: string) => moment === 'built' || (started && ['login', 'list', 'read'].includes(id));
  return {
    revision: `blog-${moment}`,
    etag: `blog-${moment}`,
    exists: true,
    planned: true,
    build: moment === 'asking' ? 'none' : moment === 'building' ? 'running' : 'ended',
    buildSession: building ? 'build-1' : null,
    document: { nodes, flows: FLOWS, edges: [] },
    screens: SCREENS,
    look: building ? QUIET_LOOK : null,
    undecided: building ? [] : ['댓글을 받을까요', '어떤 느낌으로 만들까요'],
    states: building
      ? Object.fromEntries(
          nodes.map((node) => [
            node.id,
            {
              promises: Object.fromEntries(
                (node.conditions ?? []).map((c) => [c.id, { status: passed(node.id) ? 'passed' : 'unconfirmed' }]),
              ),
            },
          ]),
        )
      : {},
  } as unknown as FlowGetResult;
}

const said = (id: string, text: string): Item => ({ id, kind: 'user_message', text });

const call = (id: string, name: string, args: Record<string, unknown>): Item => ({
  id,
  kind: 'tool_call',
  name,
  args,
  status: 'done',
  result: '',
  images: 0,
  commandResult: null,
  fileChanges: null,
});

/** The map conversation: the question it waits on while planning. */
export function blogConversation(moment: PlanMoment): Item[] {
  const asked = call('ask-1', 'ask_user', {
    question: '방문자가 댓글을 달 수 있게 할까요?',
    about: 'comment',
    options: [{ label: '로그인한 사람만', detail: '광고 글을 막아요' }, { label: '누구나' }, { label: '댓글 없이' }],
  });
  return moment === 'asking' ? [said('u1', '개발 블로그 만들어 줘'), asked] : [said('u1', '개발 블로그 만들어 줘')];
}

/** The build's own conversation: the TF it proposed, or its latest calls. */
export function blogBuild(moment: PlanMoment): Item[] {
  const request = said('b1', '이대로 만들어 주세요.');
  if (moment === 'team')
    return [
      request,
      {
        id: 'tf-1',
        kind: 'taskforce',
        title: '블로그 화면과 데이터 만들기',
        steps: [
          { title: '데이터와 화면 구현', count: 2, model: 'anthropic/claude-sonnet-5' },
          { title: '통합 실행과 약속 검증', count: 1, model: 'anthropic/claude-sonnet-5' },
        ],
        minutes: 35,
        status: 'proposed',
        members: [],
        step: '',
        log: null,
        needed: null,
        error: null,
        startedAt: null,
      } as unknown as Item,
    ];
  return [
    request,
    call('e1', 'edit', { path: 'src/routes/write.tsx' }),
    call('e2', 'write', { path: '.alpine-code/map/features/publish.json' }),
    call('e3', 'edit', { path: 'src/routes/write.tsx' }),
  ];
}
