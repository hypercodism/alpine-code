import type { QuestionOption } from '@/shared/questions';

/** What a model might draw for "개발 블로그 만들어 줘": three ways the blog could look, as `ask_user` takes. */

interface Post {
  title: string;
  excerpt: string;
  date: string;
  read: string;
  tag: string;
}

const posts: [Post, Post, Post, Post] = [
  {
    title: 'Cloudflare D1에서 트랜잭션 없이 살아남기',
    excerpt: 'db.transaction이 없다는 걸 배포 직전에 알았다. batch로 묶어서 같은 효과를 내는 방법과 그 한계.',
    date: '10월 18일',
    read: '6분',
    tag: '데이터베이스',
  },
  {
    title: 'React 19 폼 액션, 3주 써 보니',
    excerpt: 'useActionState로 바꾸고 나서 지운 코드가 생각보다 많았다. 좋았던 점 셋, 아쉬운 점 하나.',
    date: '10월 9일',
    read: '4분',
    tag: '프론트엔드',
  },
  {
    title: '사이드 프로젝트를 3년째 유지하는 법',
    excerpt: '매주 한 시간만 쓴다는 규칙, 그리고 그 한 시간을 지키기 위해 버린 것들.',
    date: '9월 27일',
    read: '8분',
    tag: '회고',
  },
  {
    title: 'SQLite 인덱스가 갑자기 느려질 때 확인할 것',
    excerpt: 'EXPLAIN QUERY PLAN 한 줄로 찾은 범인. ANALYZE를 언제 돌려야 하는지도 정리했다.',
    date: '9월 12일',
    read: '5분',
    tag: '데이터베이스',
  },
];

const quiet = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700&display=swap">
<style>.serif{font-family:'Noto Serif KR',serif}</style></head>
<body class="bg-white text-neutral-900 antialiased">
  <header class="border-b border-neutral-200">
    <div class="mx-auto flex max-w-5xl items-center justify-between px-8 py-5">
      <span class="serif text-2xl font-bold tracking-tight">개발자의 기록</span>
      <nav class="flex items-center gap-6 text-sm text-neutral-600">
        <a>소개</a><a>태그</a>
        <a class="rounded-full bg-neutral-900 px-4 py-2 text-white">구독하기</a>
      </nav>
    </div>
  </header>
  <main class="mx-auto grid max-w-5xl grid-cols-[1fr_260px] gap-16 px-8 py-12">
    <section class="divide-y divide-neutral-100">
      ${posts
        .map(
          (p, i) => `<article class="flex gap-8 py-8 first:pt-0">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-neutral-500">한결 · ${p.date}</p>
          <h2 class="serif mt-2 text-2xl font-bold leading-snug">${p.title}</h2>
          <p class="mt-2 leading-7 text-neutral-600">${p.excerpt}</p>
          <p class="mt-4 flex gap-3 text-sm text-neutral-500"><span class="rounded-full bg-neutral-100 px-3 py-1">${p.tag}</span><span class="py-1">${p.read} 읽기</span></p>
        </div>
        <div class="h-28 w-40 shrink-0 rounded ${['bg-amber-100', 'bg-sky-100', 'bg-emerald-100', 'bg-rose-100'][i]}"></div>
      </article>`,
        )
        .join('')}
    </section>
    <aside class="flex flex-col gap-8 text-sm">
      <div>
        <div class="h-14 w-14 rounded-full bg-neutral-200"></div>
        <p class="mt-3 font-medium">한결</p>
        <p class="mt-1 leading-6 text-neutral-600">웹을 만들고, 만들면서 배운 것을 적습니다.</p>
      </div>
      <div>
        <p class="font-medium">자주 쓰는 태그</p>
        <div class="mt-3 flex flex-wrap gap-2 text-neutral-700">
          <span class="rounded-full bg-neutral-100 px-3 py-1">데이터베이스</span>
          <span class="rounded-full bg-neutral-100 px-3 py-1">프론트엔드</span>
          <span class="rounded-full bg-neutral-100 px-3 py-1">회고</span>
        </div>
      </div>
    </aside>
  </main>
</body></html>`;

const magazine = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>body{font-family:'Pretendard Variable',sans-serif}</style></head>
<body class="bg-stone-100 text-stone-900 antialiased">
  <header class="mx-auto max-w-6xl px-8 pt-10 pb-6 text-center">
    <p class="text-xs font-semibold tracking-[0.3em] text-orange-600">DEV JOURNAL</p>
    <h1 class="mt-2 text-5xl font-extrabold tracking-tight">개발자의 기록</h1>
    <nav class="mt-6 flex justify-center gap-8 border-y border-stone-300 py-3 text-sm font-medium text-stone-600">
      <a class="text-stone-900">전체</a><a>데이터베이스</a><a>프론트엔드</a><a>회고</a><a>소개</a>
    </nav>
  </header>
  <main class="mx-auto max-w-6xl px-8 pb-16">
    <section class="grid grid-cols-[1.4fr_1fr] gap-8">
      <article class="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div class="h-72 bg-gradient-to-br from-orange-400 via-rose-400 to-violet-500"></div>
        <div class="p-7">
          <span class="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">${posts[0].tag}</span>
          <h2 class="mt-4 text-3xl font-bold leading-tight">${posts[0].title}</h2>
          <p class="mt-3 leading-7 text-stone-600">${posts[0].excerpt}</p>
          <p class="mt-4 text-sm text-stone-500">${posts[0].date} · ${posts[0].read} 읽기</p>
        </div>
      </article>
      <div class="flex flex-col gap-8">
        ${posts
          .slice(1, 3)
          .map(
            (p, i) => `<article class="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
          <div class="h-28 ${['bg-gradient-to-r from-sky-400 to-indigo-500', 'bg-gradient-to-r from-emerald-400 to-teal-500'][i]}"></div>
          <div class="p-5">
            <span class="text-xs font-semibold text-orange-600">${p.tag}</span>
            <h3 class="mt-1 text-xl font-bold leading-snug">${p.title}</h3>
            <p class="mt-2 text-sm text-stone-500">${p.date} · ${p.read} 읽기</p>
          </div>
        </article>`,
          )
          .join('')}
      </div>
    </section>
    <h2 class="mt-14 text-sm font-semibold tracking-widest text-stone-500">최근 글</h2>
    <section class="mt-4 grid grid-cols-3 gap-6">
      ${[posts[3], posts[1], posts[2]]
        .map(
          (p) => `<article class="rounded-2xl bg-white p-5 shadow-sm">
        <span class="text-xs font-semibold text-orange-600">${p.tag}</span>
        <h3 class="mt-1 font-bold leading-snug">${p.title}</h3>
        <p class="mt-2 text-sm leading-6 text-stone-600">${p.excerpt}</p>
      </article>`,
        )
        .join('')}
    </section>
  </main>
</body></html>`;

const terminal = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>body{font-family:'Pretendard Variable',sans-serif}.mono{font-family:'JetBrains Mono',monospace}</style></head>
<body class="min-h-screen bg-zinc-950 text-zinc-200 antialiased">
  <main class="mx-auto max-w-3xl px-8 py-14">
    <p class="mono text-sm text-emerald-400">~/개발자의-기록 <span class="text-zinc-500">$</span> ls posts<span class="ml-1 inline-block h-4 w-2 translate-y-0.5 bg-emerald-400"></span></p>
    <h1 class="mt-6 text-4xl font-bold tracking-tight text-white">개발자의 기록</h1>
    <p class="mt-3 text-zinc-400">만들고, 부수고, 다시 만든 것들의 메모.</p>
    <nav class="mono mt-8 flex gap-3 text-xs">
      <span class="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-300">#전체</span>
      <span class="rounded border border-zinc-700 px-2 py-1 text-zinc-400">#데이터베이스</span>
      <span class="rounded border border-zinc-700 px-2 py-1 text-zinc-400">#프론트엔드</span>
      <span class="rounded border border-zinc-700 px-2 py-1 text-zinc-400">#회고</span>
    </nav>
    <section class="mt-10 flex flex-col">
      ${posts
        .map(
          (p) => `<article class="grid grid-cols-[90px_1fr] gap-6 border-t border-zinc-800 py-6">
        <time class="mono pt-1 text-xs text-zinc-500">2026.${p.date.replace(/(\d+)월 (\d+)일/, (_, m: string, d: string) => `${m.padStart(2, '0')}.${d.padStart(2, '0')}`)}</time>
        <div>
          <h2 class="text-xl font-semibold text-white">${p.title}</h2>
          <p class="mt-2 leading-7 text-zinc-400">${p.excerpt}</p>
          <p class="mono mt-3 text-xs text-emerald-400/80">#${p.tag} · ${p.read}</p>
        </div>
      </article>`,
        )
        .join('')}
    </section>
  </main>
</body></html>`;

export const BLOG_LOOKS: QuestionOption[] = [
  {
    label: 'Medium 참고',
    detail: '흰 바탕에 명조체 제목, 글 목록 하나만 길게. 글 읽기에 집중하는 블로그예요.',
    html: quiet,
    look: null,
  },
  {
    label: 'Ghost 참고',
    detail: '대표 글을 크게 걸고 나머지는 카드로. 색이 있고 첫 화면이 화려해요.',
    html: magazine,
    look: null,
  },
  {
    label: 'GitHub 블로그 참고',
    detail: '어두운 화면에 코드 글꼴을 섞은 개발자 느낌. 날짜와 태그가 앞에 나와요.',
    html: terminal,
    look: null,
  },
];
