---
name: product-planning
description: Plan a new product on its product map with the person before building it - draw a first guess of who uses it and every screen, then ask the product questions that are left, one at a time. Use when someone describes a product that does not exist yet, or asks to plan or redesign one.
---

# Planning a product on its map

The person described a product in a few words. They are not a developer: they decide what the product is, you decide
everything technical. The map is the plan they read and change; it is also the contract you will build against.

They see the map, not its files. Talk to them in their language, about screens, promises and choices: never mention
files, JSON, paths or code words to them ("지도에 적었어요", not "map.json에 썼어요"; "화면을 다 만들었어요", not "JSON이
유효한지 확인했어요").

The screens on the map are the product's real screens: you write them in the project's own code on made-up data, and
the map shows the running app (see "Writing a screen"). A designer judges the plan by those screens and by the hard
situations they handle; a drawing that only shows a good day is why people go back to their design tools.

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
- **Situations**: each screen card's `states`, the situations it must handle besides the ordinary one, in the
  person's words: nothing there yet ("아직 글이 없을 때"), sold out or full, an error or no connection, not allowed or
  not signed in, waiting for an answer, a very long name or a hundred items. Two to five for most screens; skip the
  ones that cannot happen. Each is a real screen on the map (`?alpine-state=<id>`), so think them through the way a
  good designer would: what the person sees, and what they can do next.
- **Promises**: two to four conditions per card, in plain words, that you assume ("글 목록은 최신 글이 먼저 나온다",
  "로그인하지 않아도 글을 읽을 수 있다"), plus one for each situation (with `state` set to it: "글이 없으면 첫 글을
  쓰자고 알려 준다"). They are what you will build and check later.
- **A screen per card**: written in the project's code with its `path` (see "Writing a screen"). Install what the
  project needs and start its dev server once, as the project's own instructions say; the map opens every screen
  through it.
- **What is left to decide**: `undecided` in map.json, each a short line in the person's words ("누가 글을 쓰나요",
  "댓글을 받을까요", "어떤 느낌으로 만들까요"). The look is always last.

Think about what the best products of this kind do (see "References") and draw that, not the plainest version.
Before the first screen, write the product's concept sentence and draw in the direction you would pick, as the
design skill (`product-design`) says: the first screens already have the product's layout, not a neutral wireframe.
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
`.alpine-code/map/look.json` (the same keys), drop the line from `undecided`, and restyle the code with it (the look's
values as the project's theme): the map shows the running app, so every screen changes as you do. If the picked
direction's layout differs from the screens, rework them in it.

When `undecided` is empty and nothing is being asked, tell them in one short line that the plan is ready to build.
Do not build until they say so.

## Writing a screen

Each planned screen is real code in the project, as the project's instructions say (its stack, its folders), reading
made-up data. Four habits let the map show it, its situations and its links without you drawing anything:

1. **An address per screen**: the card's `path` (`/order/time`) opens that screen directly, with nothing done before
   it. A screen never needs an earlier screen to have run: it reads what it shows (the picked bread, the signed-in
   owner) from the made-up data.
2. **One made-up data module** (`src/fake.ts` or the stack's equivalent) that every screen reads through plain
   functions (`todayBreads()`, `reservations()`), with real-sounding content: names, prices, dates, enough items to
   read as real. `?alpine-state=<state id>` in the address picks a situation (`/order?alpine-state=sold-out`); without
   it, the ordinary day. The build later replaces what is inside those functions, not the screens.
3. **Marks the map reads**, plain attributes, no package:
   - `data-alpine-screen="<card id>"` on the screen's outermost element;
   - `data-alpine-to="<card id>"` on every button or link that moves to another screen (the map draws the arrow from
     it, and tells the person when a planned arrow has no button);
   - `data-alpine-promise="<condition id>"` on the element that keeps a promise (the price, the disabled day, the
     empty message), so the map can pin the promise to it.
4. **Every situation drawn for real**: an empty list says why it is empty and what to do; an error says what happened
   and offers the way out; a sold-out item looks and behaves sold out. How each should look is in the design skill.

```tsx
export function Menu() {
  const breads = todayBreads(); // from src/fake.ts; ?alpine-state=empty gives []
  return (
    <main data-alpine-screen="menu">
      {breads.length === 0 ? (
        <p data-alpine-promise="empty-note">오늘은 아직 빵이 없어요. 사장님이 올리면 바로 보여요.</p>
      ) : (
        breads.map((b) => <BreadRow key={b.id} bread={b} />)
      )}
      <button data-alpine-to="time" onClick={() => go("/order/time")}>다음</button>
    </main>
  );
}
```

Write the screens for the device of their journey (a phone screen around 390 px wide, a desktop window around 1280 px
with room for a side menu or a table). How to make them look designed rather than generic is in the design skill.
Planning stops at the screens: no real data, sign-in, payments or server work until the person says to build.

## Looks

A look sets every token (the look question's previews are drawn with them, and the project's theme takes them).
Fonts that are always available in the previews: `'Pretendard Variable', Pretendard`,
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
- `features/<id>.json`: `path`, `states`, and `state` on a situation's conditions.
- `look.json`, next to `map.json`.

## Building it

When the person says to build, the map is the contract. Some things that help:

- The screens already exist on made-up data. Building makes them real: data that is stored, sign-in, payments,
  server work. Replace what is inside the made-up data functions, not the screens, and keep every address, situation
  and mark: in development `?alpine-state=` still shows each situation, so the map keeps showing all of them.
- The person watches the map while you build; it is how they see where you are. Move one card at a time, never all
  at the end: before you start a screen's work, set its card's phase to `building` and list in its `sources` the
  files you will touch for it; the moment it works on real data, set it `built` with a `preview`, then go on to the
  next card.
- Follow the design skill for type, pictures, states and the look-then-fix pass.
- Keep the person's words: the texts on the planned screens are the texts of the product.
- Run the product and look at every screen you built before you call a card built.
- What the person needs to try a screen themselves (where to sign in, a password you set, a test card) goes into its
  card's `howToTry` in plain words, not only into your message. Leave Alpine's own marks out of it (`?alpine-state=`,
  situation ids): each situation opens from its chip on the map.
- A screen card's `path` is the address that shows that screen in the running app (`/reservations`,
  `/admin/members`), so the app can open it. A path only, no host.
