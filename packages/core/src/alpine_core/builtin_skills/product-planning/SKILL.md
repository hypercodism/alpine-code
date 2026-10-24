---
name: product-planning
description: Plan a new product on its product map with the person before building it - draw a first guess of who uses it and every screen, then ask the product questions that are left, one at a time. Use when someone describes a product that does not exist yet, or asks to plan or redesign one.
---

# Planning a product on its map

The person described a product in a few words. They are not a developer: they decide what the product is, you decide
everything technical. The map is the plan they read and change; it is also the contract you will build against.

## 1. Draw a first guess at once

Do not ask anything before the map exists. People fix a wrong picture more easily than they answer an empty question.

- **People**: who uses the product (손님, 사장님, 글쓴이, 방문자). One flow per journey, its `actor` the person's name
  for them. Most products have two or three people; a visitor who only reads is a person too.
- **Device**: each flow's `device`, what that person uses it on: `"phone"` for people who use it on the go (손님,
  회원, 방문자), `"computer"` for desk work (직원, 관리자, 사장님이 가게에서 보는 화면). Decide it yourself; ask only
  when it is a real product question (a shop owner who might manage from either).
- **Steps**: one card per screen they pass through, in order, with `kind: "screen"` and `phase: "planned"`. Five to
  twelve screens in all is usual for a first product. A step that exists only if an open question goes one way gets
  `tentative: true`.
- **Promises**: two to four conditions per card, in plain words, that you assume ("글 목록은 최신 글이 먼저 나온다",
  "로그인하지 않아도 글을 읽을 수 있다"). They are what you will build and check later.
- **A screen per card**: `.alpine-code/map/screens/<card id>.html` (see "Drawing a screen").
- **What is left to decide**: `undecided` in map.json, each a short line in the person's words ("누가 글을 쓰나요",
  "댓글을 받을까요", "어떤 느낌으로 만들까요"). The look is always last.

Think about what the best products of this kind do (see "References") and draw that, not the plainest version.
Before the first screen, write the product's concept sentence and draw in the direction you would pick, as the
design skill (`product-design`) says: the sketches already have the product's layout, not a neutral wireframe.
Public pages need no sign-in unless the person asked for it. Write every word in the person's language.

## 2. Ask one question at a time

Use `ask_user` with `about` set to the card the answer changes (none when it is about the whole product), then end
your turn. Ask the question whose answer changes the map most first.

- Only product decisions, in their words: what it does, for whom, what happens when. Never data, APIs, libraries or
  structure: decide those yourself. Never what you can find out yourself.
- Your pick first, with a reason a non-developer understands in `detail`. Two to four options, each a real choice.
- When the answer comes, change the map in place: add or remove cards, make a tentative step real or delete it,
  add promises the answer implies. Record it on the card as a decision
  (`{"question", "options", "answer", "by": "person"}`) and drop the line from `undecided`. Then ask the next one.
- An answer in their own words counts too; if it is unclear, take the closest reading and say what you took.
- How many questions, and when the plan is good enough, is your call. Stop asking when what is left would not change
  what they see.
- If they say to decide the rest ("나머지는 알아서 정해 줘"), decide every open line with your picks, record each as
  a decision with `"by": "ai"`, empty `undecided`, and draw the result. Keep the look question unless they said to
  decide that too.

## 3. The look comes last

Ask how it should look with `ask_user`: two to four options that are different directions (layout, type, palette and
imagery; see the design skill's "In the plan"), not colourways of one screen. Name each after a real product it takes
after ("당근 참고", "Kinfolk 참고"), give it a `look` (the token values below), a `detail` saying what it feels like,
and its own `html`: the product's most telling screen drawn in that direction. Once they pick, write the look to
`.alpine-code/map/look.json` (the same keys) and drop the line from `undecided`. The app restyles every screen at once;
if the picked direction's layout differs from the sketches, redraw them in it.

When `undecided` is empty and nothing is being asked, tell them in one short line that the plan is ready to build.
Do not build until they say so.

## Drawing a screen

A screen file is the `<body>` content of one screen, drawn with Tailwind 4 classes: a phone screen (390 px wide) for
a phone journey, a desktop window (about 1280 px wide, with room for a side menu or a table) for a computer journey.
A screen in both kinds of journey is drawn for the first one it appears in. Tailwind is loaded for you; add no
`<script>`, `<link>` or `<style>`, and no images (a `bg-surface` block at the picture's real crop, with a short muted
line of what goes there). Use only these tokens for colour, type and corners, so a look restyles it:

| Token | For |
| --- | --- |
| `bg-page`, `text-ink`, `text-muted` | background, main text, secondary text |
| `bg-surface`, `border-line` | cards, inputs, dividers |
| `bg-accent`, `text-on-accent`, `text-accent` | buttons, links, highlights |
| `font-display`, `font-body` | titles, text |
| `rounded-card` | cards and buttons |

Spacing, sizes and layout are plain Tailwind (`p-4`, `text-2xl`, `flex`, `grid-cols-2`). Use real, specific content
(real-sounding titles, names, prices, dates), never lorem ipsum. Show the screen as someone would see it on a good day,
with enough items to read as real (four posts, not one). How to make a screen look designed rather than generic
(type scale, one primary action, varied compositions, the tells to avoid) is in the design skill.

```html
<header class="flex items-center justify-between border-b border-line px-4 py-3">
  <span class="font-display text-lg text-ink">개발자의 기록</span>
  <button class="rounded-card bg-accent px-3 py-1.5 text-sm text-on-accent">구독하기</button>
</header>
<main class="flex flex-col gap-3 p-4">
  <article class="rounded-card border border-line bg-surface p-4">
    <p class="text-xs text-muted">10월 18일 · 6분</p>
    <h2 class="mt-1 font-display text-lg text-ink">Cloudflare D1에서 트랜잭션 없이 살아남기</h2>
    <p class="mt-1 text-sm text-muted">batch로 묶어서 같은 효과를 내는 방법과 그 한계.</p>
  </article>
</main>
```

## Looks

A look sets every token. Fonts that are always available in sketches: `'Pretendard Variable', Pretendard`,
`'SUIT Variable'`, `'Wanted Sans Variable'`, `'IBM Plex Sans KR'`, `'Gowun Dodum'`, `'Noto Serif KR'`,
`'Gowun Batang'`, `'MaruBuri'`, `'Hahmlet'`, `'Nanum Myeongjo'`, `'Do Hyeon'`, `'Jua'`, `'JetBrains Mono'`; end each
with a fallback (`sans-serif`, `serif`, `monospace`). Pairings are in the design skill. Starting points to adapt to
the product, not to use as they are:

| Look | page | surface | ink | muted | line | accent | on_accent | display | radius |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Quiet reading (Medium) | #ffffff | #f5f5f5 | #171717 | #737373 | #e5e5e5 | #171717 | #ffffff | Noto Serif KR | 10px |
| Magazine (Ghost) | #f5f5f4 | #ffffff | #1c1917 | #78716c | #e7e5e4 | #ea580c | #ffffff | Pretendard | 14px |
| Developer (GitHub) | #09090b | #18181b | #f4f4f5 | #a1a1aa | #27272a | #34d399 | #052e16 | JetBrains Mono | 4px |
| Friendly shop (Toss) | #f9fafb | #ffffff | #191f28 | #6b7684 | #e5e8eb | #3182f6 | #ffffff | Pretendard | 16px |
| Warm local (당근) | #fffaf5 | #ffffff | #212124 | #868b94 | #f0e6dc | #ff6f0f | #ffffff | Pretendard | 12px |
| Calm tool (Notion) | #ffffff | #f7f6f3 | #37352f | #787774 | #e9e9e7 | #2383e2 | #ffffff | Pretendard | 6px |
| Warm craft (동네 빵집) | #faf6ef | #ffffff | #2b2118 | #8a7b6c | #ece3d6 | #c8682c | #ffffff | Gowun Batang | 12px |

`body` is a text face (Pretendard, SUIT, Wanted Sans) unless the look is all monospace.

## References

What the good ones do, by kind of product:

- **Blog or writing**: Medium, Ghost, velog. Reading comes first: a calm list, generous type, reading time, tags,
  an author line. Visitors read without signing in; only writers sign in.
- **Shop**: Toss Shopping, 29CM, Shopify themes. Big product pictures, price and one clear buy button, a cart that is
  always reachable, order status after paying.
- **Booking** (salon, class, clinic): 네이버 예약, Calendly. Pick a service, then a time from what is free, then
  confirm; a reminder before; cancelling without calling.
- **Community or local**: 당근, Reddit. A feed of what is new nearby or in a topic, posting in two taps, replies,
  reporting.
- **Tool or dashboard**: Notion, Linear. The thing they came for on the first screen, little chrome, keyboard and
  search for regulars.
- **Portfolio or landing page**: Framer and Read.cv sites. One clear sentence of who and what, the best work first,
  one way to get in touch.

## Files

You edit the map's files as the map's own instructions say. For planning you also use:

- `features/<id>.json`: `decisions` (product questions about the card and their answers) and `tentative`.
- `map.json`: `undecided`.
- `screens/<card id>.html` and `look.json`, next to `map.json`.

## Building it

When the person says to build, the map is the contract. Some things that help:

- Skeleton first, then flesh: make every screen reachable with its real layout and the plan's look, then make each
  promise work, then polish.
- Use the look's tokens as the product's own theme, so the built screens look like the planned ones, and follow the
  design skill for type, pictures, states and the look-then-fix pass.
- Keep the person's words: the texts on the planned screens are the texts of the product.
- Run the product and look at every screen you built before you call a card built.
- Write each screen card's `path`: the address that shows that screen in the running app (`/reservations`,
  `/admin/members`), so the app can open it. A path only, no host.
