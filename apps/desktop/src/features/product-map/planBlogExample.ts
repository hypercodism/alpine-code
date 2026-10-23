import type { Person } from './flowTreeModel';
import {
  planned,
  withCard,
  withoutCard,
  withPromise,
  withPromises,
  type Plan,
  type PlanBuildStep,
  type PlanCard,
  type PlanQuestion,
  type RecordThread,
} from './planModel';
import { MAGAZINE, QUIET, TERMINAL } from './planThemes';

/**
 * What the AI might draw, ask and do for "개발 블로그 만들어 줘", for the stories: a first guess, four questions and how
 * building it goes.
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

const people: Person[] = [
  {
    id: 'visitor',
    name: { ko: '방문자', en: 'Visitor' },
    role: { ko: '글을 찾아 읽는 사람', en: 'Finds and reads posts' },
    start: { ko: '블로그 주소로 들어와요', en: 'Opens the blog' },
    tone: 2,
    journeys: [
      {
        id: 'reading',
        title: { ko: '글 찾아 읽기', en: 'Find and read a post' },
        goal: { ko: '글을 찾아 읽어요', en: 'Finds and reads posts' },
        steps: ['list', 'read', 'comment'],
      },
    ],
  },
  {
    id: 'writer',
    name: { ko: '글쓴이', en: 'Writer' },
    role: { ko: '블로그 주인', en: 'Owns the blog' },
    start: { ko: '로그인해요', en: 'Signs in' },
    tone: 1,
    journeys: [
      {
        id: 'writing',
        title: { ko: '글 써서 올리기', en: 'Write and publish' },
        goal: { ko: '글을 써서 올려요', en: 'Writes and publishes' },
        steps: ['login', 'write', 'publish'],
      },
    ],
  },
];

const card = (id: string, title: string, sketch: string, more: Partial<PlanCard> = {}): PlanCard => ({
  id,
  title,
  sketch,
  promises: [],
  ...more,
});

/** The AI's first guess from one line: two people, six screens, one step that waits on a question. */
export const BLOG_DRAFT: Plan = {
  product: '개발 블로그',
  people,
  cards: {
    list: card('list', '글 목록 보기', list),
    read: card('read', '글 읽기', read),
    comment: card('comment', '댓글 달기', comment, { maybe: true, note: '질문에 따라' }),
    login: card('login', '로그인', login, { promises: [planned('p-only-me', '나만 글을 쓸 수 있어요')] }),
    write: card('write', '글 쓰기', write),
    publish: card('publish', '발행', publish),
  },
};

const promise = (plan: Plan, id: string, ...promises: ReturnType<typeof planned>[]) =>
  withCard(plan, id, (c) => ({ ...c, promises: [...c.promises, ...promises] }));

export const BLOG_QUESTIONS: PlanQuestion[] = [
  {
    id: 'q-read',
    about: 'read',
    text: '방문자는 로그인하지 않고도 글을 읽을 수 있어야 하죠?',
    options: [
      {
        label: '네, 누구나 읽어요',
        recommended: true,
        apply: (plan) =>
          promise(
            plan,
            'read',
            planned('p-open', '로그인하지 않아도 글을 읽을 수 있어요'),
            planned('p-url', '글마다 주소가 따로 있어요'),
          ),
      },
      {
        label: '로그인한 사람만',
        apply: (plan) => promise(plan, 'read', planned('p-closed', '로그인한 사람만 글을 읽을 수 있어요')),
      },
    ],
  },
  {
    id: 'q-comment',
    about: 'comment',
    text: '방문자가 댓글을 달 수 있게 할까요?',
    options: [
      {
        label: '로그인한 사람만',
        detail: '광고 글을 막아요',
        recommended: true,
        apply: (plan) =>
          withCard(plan, 'comment', (c) => ({
            ...c,
            maybe: false,
            note: '이메일로 로그인',
            promises: [planned('p-comment', '로그인한 사람만 댓글을 달 수 있어요')],
          })),
      },
      {
        label: '누구나',
        apply: (plan) =>
          withCard(plan, 'comment', (c) => ({
            ...c,
            maybe: false,
            note: '로그인 없이',
            promises: [planned('p-comment', '누구나 댓글을 달 수 있어요')],
          })),
      },
      { label: '댓글 없이', apply: (plan) => withoutCard(plan, 'comment') },
    ],
  },
  {
    id: 'q-write',
    about: 'write',
    text: '글은 어떻게 쓸까요?',
    options: [
      {
        label: '마크다운',
        detail: '코드가 보기 좋게 나와요',
        recommended: true,
        apply: (plan) =>
          promise(
            withCard(plan, 'write', (c) => ({ ...c, note: '마크다운' })),
            'write',
            planned('p-code', '코드 블록이 색으로 구분돼요'),
          ),
      },
      {
        label: '워드처럼 꾸미는 편집기',
        apply: (plan) => withCard(plan, 'write', (c) => ({ ...c, note: '꾸미는 편집기' })),
      },
    ],
  },
  {
    id: 'q-look',
    about: null,
    text: '어떤 느낌으로 만들까요?',
    options: [
      { label: '조용한 글방', detail: 'Medium 참고', recommended: true, look: QUIET },
      { label: '매거진', detail: 'Ghost 참고', look: MAGAZINE },
      { label: '터미널 노트', detail: 'GitHub 블로그 참고', look: TERMINAL },
    ],
  },
];

/** The screen a "how should it look" option shows itself with. */
export const BLOG_LOOK_SAMPLE = list;

const PICTURES = [
  'bg-gradient-to-br from-amber-200 via-rose-200 to-sky-300',
  'bg-gradient-to-br from-sky-300 via-indigo-300 to-violet-400',
  'bg-gradient-to-br from-emerald-200 via-teal-300 to-cyan-400',
];

/** The running app's screen, for the stories: the sketch with real pictures where it had empty boxes. */
const captured = (sketch: string) => {
  let n = 0;
  return sketch.replaceAll(
    'rounded-card bg-surface"></div>',
    () => `rounded-card ${PICTURES[n++ % PICTURES.length]}"></div>`,
  );
};

const capture =
  (...ids: string[]) =>
  (plan: Plan) =>
    ids.reduce((p, id) => withCard(p, id, (c) => ({ ...c, capture: captured(c.sketch) })), plan);

const all =
  (...changes: ((plan: Plan) => Plan)[]) =>
  (plan: Plan) =>
    changes.reduce((p, change) => change(p), plan);

/** One promise about deleted posts, as the person or the AI picked it. */
const onDelete = (id: string, then: string) => (plan: Plan) =>
  withCard(plan, 'publish', (c) => ({
    ...c,
    promises: [...c.promises.filter((p) => p.id !== 'p-delete' && p.id !== 'p-keep'), planned(id, then)],
  }));

/** A question that came up while building, which the map did not answer. */
export const BLOG_DELETE_QUESTION: PlanQuestion = {
  id: 'q-delete',
  about: 'publish',
  text: '글을 지우면 거기 달린 댓글은 어떻게 할까요?',
  options: [
    { label: '같이 지워요', recommended: true, apply: onDelete('p-delete', '글을 지우면 댓글도 같이 지워져요') },
    { label: '댓글은 남겨 둬요', apply: onDelete('p-keep', '글을 지워도 댓글은 남아요') },
  ],
};

/** The AI answers a new question with its pick and goes on; the card keeps the question for the person. */
const decide = (question: PlanQuestion) => (plan: Plan) => {
  const pick = Math.max(
    0,
    question.options.findIndex((o) => o.recommended),
  );
  const applied = question.options[pick]?.apply?.(plan) ?? plan;
  return question.about
    ? withCard(applied, question.about, (c) => ({ ...c, decided: { question, picked: pick } }))
    : applied;
};

/**
 * How building goes, in the AI's own order: the data first (it touches most screens), sign-in, then screens a few at a
 * time. A check fails once and is fixed without asking anyone; a question the map did not answer is answered by the
 * AI with its pick, and the work goes on.
 */
export const BLOG_BUILD: PlanBuildStep[] = [
  { wait: 500, activity: { text: '데이터 구조를 짜는 중', touching: ['list', 'read', 'comment', 'write', 'publish'] } },
  { wait: 1800, activity: { text: '로그인을 만드는 중', touching: ['login'] } },
  {
    wait: 1600,
    activity: { text: '로그인을 확인하는 중', touching: ['login'] },
    change: all(capture('login'), (p) => withPromises(p, 'login', 'checking')),
  },
  {
    wait: 1300,
    activity: { text: '글 목록과 글 읽기 화면을 만드는 중', touching: ['list', 'read'] },
    change: (p) => withPromises(p, 'login', 'passed'),
  },
  {
    wait: 1900,
    activity: { text: '글 읽기를 확인하는 중', touching: ['read'] },
    change: all(
      capture('list', 'read'),
      (p) => withPromises(p, 'list', 'passed'),
      (p) => withPromises(p, 'read', 'checking'),
    ),
  },
  {
    wait: 1500,
    activity: { text: '글 읽기를 고치는 중', touching: ['read'] },
    change: all(
      (p) => withPromises(p, 'read', 'passed'),
      (p) => withPromise(p, 'read', 'p-open', 'failed', '로그인하지 않은 창에서 열었더니 로그인 화면이 먼저 나왔어요'),
    ),
  },
  {
    wait: 2000,
    activity: { text: '글 읽기를 다시 확인하는 중', touching: ['read'] },
    change: (p) => withPromise(p, 'read', 'p-open', 'checking'),
  },
  {
    wait: 1300,
    activity: { text: '글 쓰기와 발행을 만드는 중', touching: ['write', 'publish'] },
    change: all(
      (p) => withPromises(p, 'read', 'passed'),
      (p) => withPromise(p, 'read', 'p-open', 'passed', '로그인하지 않은 창에서 열어 보니 글이 바로 보였어요'),
    ),
  },
  {
    wait: 2000,
    activity: { text: '댓글을 만드는 중', touching: ['comment'] },
    change: all(capture('write', 'publish'), (p) => withPromises(p, 'write', 'passed'), decide(BLOG_DELETE_QUESTION)),
  },
  {
    wait: 1900,
    activity: { text: '댓글과 발행을 확인하는 중', touching: ['comment', 'publish'] },
    change: all(
      capture('comment'),
      (p) => withPromises(p, 'comment', 'checking'),
      (p) => withPromises(p, 'publish', 'checking'),
    ),
  },
  {
    wait: 1400,
    activity: null,
    change: all(
      (p) => withPromises(p, 'comment', 'passed'),
      (p) => withPromises(p, 'publish', 'passed'),
    ),
  },
];

/** What the map keeps of the work so far: the plan, the build, a change to one card, and a request off the map. */
export const BLOG_RECORD: RecordThread[] = [
  {
    id: 't-plan',
    title: '개발 블로그 만들어 줘',
    at: '오늘 14:02',
    cards: ['list', 'read', 'comment', 'login', 'write', 'publish'],
    steps: [
      { at: '14:02', kind: 'me', text: '개발 블로그 만들어 줘' },
      { at: '14:02', kind: 'ai', text: '방문자와 글쓴이, 화면 여섯 개로 초안을 그렸어요.' },
      { at: '14:03', kind: 'me', text: '네, 누구나 읽어요', cards: ['read'] },
      { at: '14:03', kind: 'me', text: '로그인한 사람만', cards: ['comment'] },
      { at: '14:04', kind: 'me', text: '마크다운', cards: ['write'] },
      { at: '14:04', kind: 'me', text: '조용한 글방' },
    ],
  },
  {
    id: 't-build',
    title: '이대로 만들기',
    at: '오늘 14:05',
    cards: ['list', 'read', 'comment', 'login', 'write', 'publish'],
    steps: [
      { at: '14:05', kind: 'me', text: '이대로 만들기' },
      {
        at: '14:06',
        kind: 'ai',
        text: '글과 댓글을 담을 데이터 구조를 짰어요.',
        cards: ['list', 'read', 'comment', 'write', 'publish'],
        detail: ['worker/schema/app.ts', 'drizzle/0002_posts.sql', 'scripts/seed.sql'],
      },
      {
        at: '14:08',
        kind: 'ai',
        text: '이메일 코드로 글쓴이만 들어오게 했어요.',
        cards: ['login'],
        detail: ['worker/auth.ts', 'src/SignIn.tsx'],
      },
      { at: '14:09', kind: 'passed', text: '나만 글을 쓸 수 있어요', cards: ['login'] },
      {
        at: '14:11',
        kind: 'ai',
        text: '글 목록과 글 읽기 화면을 만들었어요.',
        cards: ['list', 'read'],
        detail: ['src/Posts.tsx', 'src/Post.tsx', 'worker/routes/posts.ts'],
      },
      {
        at: '14:12',
        kind: 'failed',
        text: '로그인하지 않은 창에서 열었더니 로그인 화면이 먼저 나왔어요',
        cards: ['read'],
      },
      {
        at: '14:13',
        kind: 'ai',
        text: '글은 로그인 없이 보이게 고쳤어요. 로그인은 글을 쓸 때만 물어요.',
        cards: ['read'],
        detail: ['src/App.tsx'],
      },
      { at: '14:13', kind: 'passed', text: '로그인하지 않아도 글을 읽을 수 있어요', cards: ['read'] },
      { at: '14:13', kind: 'passed', text: '글마다 주소가 따로 있어요', cards: ['read'] },
      {
        at: '14:16',
        kind: 'ai',
        text: '글을 지우면 댓글도 같이 지우기로 정하고 만들었어요. 카드에서 바꿀 수 있어요.',
        cards: ['publish'],
        detail: ['worker/routes/posts.ts'],
      },
      { at: '14:19', kind: 'ai', text: '다 만들었어요. 약속 6개를 모두 확인했어요.' },
    ],
  },
  {
    id: 't-title',
    title: '글 목록에서 제목을 더 크게 해 줘',
    at: '오늘 15:10',
    cards: ['list'],
    steps: [
      { at: '15:10', kind: 'me', text: '글 목록에서 제목을 더 크게 해 줘' },
      {
        at: '15:11',
        kind: 'ai',
        text: '제목 글자를 18에서 22로 키웠어요. 휴대폰에서도 두 줄을 넘지 않아요.',
        detail: ['src/Posts.tsx'],
      },
    ],
  },
  {
    id: 't-deploy',
    title: '배포가 왜 안 돼?',
    at: '오늘 15:40',
    cards: [],
    steps: [
      { at: '15:40', kind: 'me', text: '배포가 왜 안 돼?' },
      {
        at: '15:41',
        kind: 'ai',
        text: '데이터베이스 주소가 비어 있어서 배포가 멈췄어요. 주소를 채우고 다시 배포했고, 지금은 dev-blog.alpinesite.app에서 열려요.',
        detail: ['$ npm run deploy', 'wrangler.jsonc'],
      },
    ],
  },
];
