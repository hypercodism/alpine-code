---
name: product-design
description: Give a product a look of its own - one concept, one direction held on every screen, Korean type that is set on purpose, real words and real pictures - and check the screens against it before calling them done. Use when planning how a product looks, drawing or building its screens, or when someone says it looks plain, generic or "찍어낸 것 같다".
---

# Designing a product that looks made for its people

People who use Alpine are not designers, and they can tell when an app looks like every other app an AI made. The
products they admire (토스, 당근, Apple, Linear, 배민) do not share a style. They share coherence: each knows what it
is for, and every screen says that one thing. A 카드사 app with banners, badges, gradients and six equal buttons is the
opposite: a lot of design, no idea. Your job is the idea first, then the fewest choices that carry it, held everywhere.

## 1. Start from the concept

Before the first screen, write one sentence: **what this is, for whom, and how it should feel**.

- "동네 빵집의 오늘 나온 빵을 단골이 출근길에 미리 담아 두는 앱. 갓 구운 빵 냄새처럼 따뜻하고 소박하게."
- "프리랜서 디자이너가 클라이언트 피드백을 한곳에서 정리하는 도구. 조용하고 빠르게, 일에 방해 없이."

The feeling words come from the product and its people, not from design vocabulary ("모던", "깔끔" say nothing).
Every decision after this answers to the sentence: a thing on screen stays only if it has a job for that person
there. If you would not miss it when it is gone, it goes. Decoration is allowed when it is the concept (배민's kitsch
lettering is the brand); it is not allowed as filler.

## 2. Pick one direction and hold it

A direction is six choices, made together from the concept:

| Choice | Decide | Example (the bakery) |
| --- | --- | --- |
| Layout idea | the one composition the product is built on | a big photo of today's bread, then a short list |
| Type | a display face and a text face, and how big titles get | 고운바탕 titles, Pretendard text, titles at 28 px |
| Palette | page, ink, one accent and its job, neutrals | cream page, dark brown ink, crust orange only for 담기 |
| Density | how much fits on a screen | airy: one thing per row, 20 px gutters |
| Imagery | photos, illustration or none; their crop and tone | warm daylight photos, square crops, no people |
| Motion | how things arrive and respond | short fades, a basket that bumps once when you add |

Derive it from the product, not from a favourite style:

- **Who and where**: a phone on a busy street wants large targets, one column and the answer first; a desk tool used
  all day wants density, quiet chrome and keyboard paths.
- **What they came for**: make that the largest thing on its screen (the bread, the balance, the next booking).
- **The world it lives in**: a bakery, a law office, a kids' class and a crypto dashboard have different paper, ink and
  voice. Borrow from the real thing (a bakery's kraft paper and chalkboard, a clinic's calm white).
- **One accent with one job**: the accent marks what you can do (the primary action, the current tab), nothing else.
  Everything else is neutrals. A second colour needs a reason, such as a status.

Once picked, the direction is fixed for the whole product: same type scale, spacing scale, radius, accent use and
image treatment on every screen. When you build, write the concept sentence and the six choices as a short comment
at the top of the theme file, so later sessions keep them. `references/directions.md` has worked directions for
common kinds of product and what the reference apps actually do.

## 3. Korean type, set on purpose

Default type is the loudest sign of a generic app. Choose a pairing that fits the direction (the list of web fonts
and how to load them is in `references/korean-type.md`):

- Load a real Korean face: Pretendard, SUIT or Wanted Sans for text; a serif (Noto Serif KR, 고운바탕, 마루부리,
  Hahmlet) or a characterful face (도현, 주아) for display when the concept wants it. Never only `system-ui`.
- Make the scale contrasted: one big title per screen (28-40 px on a phone), body 15-17 px, small text 13 px. Fewer
  sizes, further apart. Hierarchy comes from size and weight, then colour; not from boxes.
- Hangul needs room: body `line-height` 1.6-1.7, titles 1.25-1.35. Tighten large titles slightly
  (`letter-spacing: -0.02em`); leave body text at 0. Use `word-break: keep-all` so words do not split mid-word.
- Numbers that matter (prices, times, amounts) get tabular figures (`tabular-nums`), a heavier weight and the unit
  smaller beside them: **12,000**원.

## 4. Layout: hierarchy by size and space

Details and numbers are in `references/layout.md`. What matters most:

- **One primary action per screen**, in the accent, where the thumb or eye ends (a full-width bottom button on a
  phone). Everything else is secondary (outline or text) or moves into a menu.
- **Group with space, not borders.** A spacing scale (4, 8, 12, 16, 24, 32, 48) and nothing between; more space
  between groups than inside them. Use a divider or a card only where space cannot do it.
- **Align to edges.** One left edge for text on a screen; centre only short, single things (an empty state, a
  confirmation).
- **Vary the composition by what each screen is for.** A home that leads with one big thing, a list that is a calm
  list, a detail that is a picture and a few facts, a form that is one question at a time. Not the same card grid on
  every screen.
- **Design the hard states.** Empty (what goes here and the one action that fills it), loading (a skeleton in the
  real shape, not a spinner in the middle), error (what happened and what to do, in plain words), and long content
  (a 30-character name, 200 items).
- **Touch and read**: targets at least 44 px, text contrast at least 4.5:1, nothing below 12 px.

## 5. Words are design

Every word on screen is the product's, in the person's language. Write like 토스 (`references/writing.md`): 해요체,
one message per sentence, the button says what happens ("담기", "예약 확정하기", not "확인"), no filler sentences, no
jargon, errors that say what to do next. Real names, prices, dates and places in every example; never lorem ipsum,
"Item 1", "Title" or English left over from a template.

## 6. Pictures

When a product is about things people look at (food, places, rooms, people, products, work), real photos do more
than any colour. Take free ones from Openverse, download them into the project (never hotlink), and credit them as
`references/images.md` says: search in English, filter to licences that allow commercial use and changes, pick a set
that shares one tone and crop, write `CREDITS.md` beside them and the attribution line the licence asks for. If
nothing fits, draw a placeholder that belongs to the direction (the accent's tint with an icon or the item's name),
never a grey box. Tell the person once that they can swap in their own photos.

Icons come from one set (Lucide, Heroicons or Tabler, one weight), never emoji standing in for icons.

## 7. Generic tells

If any of these is on a screen, it was not designed. Fix it before showing it:

- Only the system font, every text the same few sizes, titles barely bigger than body.
- Emoji used as icons or bullets; icons from mixed sets.
- Grey boxes where pictures should be; stock "avatar" circles with initials everywhere.
- Purple or blue gradients, glassmorphism, glows, a gradient on the logo text.
- The same card grid on every screen; every element in a card; cards inside cards.
- A shadow, a border and a radius on everything.
- Everything centred, including paragraphs and forms.
- Four buttons of equal weight; two accents fighting; a badge or a "NEW" on everything.
- A hero with a headline, a subline and two buttons on a product that is not a landing page.
- Lorem ipsum, "Welcome to App", "Dashboard", "Lorem", English placeholders or template text left in.
- Numbers without units or alignment; dates as `2026-10-25T09:00`.
- A banner, carousel or promo that no one in the concept sentence asked for.

## 8. In the plan

The planned screens are real code on made-up data: write the first ones already in the direction you would pick,
their layout following the concept, not a neutral wireframe, with real pictures as section 5 says. Every situation of
a screen (section 4) is designed as carefully as its ordinary day: it is a screen of its own on the map.

The look question offers two to four **different directions**, not colourways of one screen. Each option differs in
layout idea, type pairing, palette and imagery, and is named after the real product it takes after ("당근 참고",
"Kinfolk 참고"). Your pick comes first and its `detail` says the feeling in plain words. Give **every** option its own
`html`: the product's most telling screen, drawn in that direction's composition, so the person compares real
alternatives side by side (these previews cannot load pictures: a picture's place is a `bg-surface` block at the
real crop with a short muted line of what goes there). Once a direction is picked, put it in the project's theme
right away and, when its layout differs from the screens, rework them in it.

## 9. In the build

- Put the direction in the product's theme: the look's tokens as the Tailwind theme variables, the fonts linked in
  `index.html`, the type and spacing scales as the only sizes used. Built screens should look like the planned ones,
  then better.
- Build every state from section 4, with the product's real words.
- Fetch and credit pictures before you style the screens that show them.

## 10. Look, then fix

After building or redrawing screens, look at them with `app_screen` (a phone screen at 390 px wide, a computer screen
at 1280 px; it shows the whole page and what it says). Check each against:

1. **Concept**: does this screen say the concept sentence? Is there anything without a job?
2. **Direction**: same type scale, spacing, radius, accent use and image treatment as the other screens?
3. **One primary action**: is it obvious within three seconds what to do here?
4. **Generic tells**: any from section 7?
5. **Korean type**: real faces loaded, contrasted scale, line height and `keep-all`, numbers set?
6. **Pictures**: do they share one tone and crop, are they in the project and credited?
7. **States and words**: empty, loading and error designed; every word real and in the person's language?

Fix what fails and look again. Call a screen done when you would show it next to the reference app it takes after.

## References

- `references/directions.md`: what the reference apps actually do, and worked directions per kind of product.
- `references/korean-type.md`: Korean web fonts, how to load them, pairings, scale and numerals.
- `references/layout.md`: spacing and type scales, screen patterns, states, density.
- `references/writing.md`: 토스's writing principles with before and after examples.
- `references/images.md`: finding, downloading and crediting free photos with Openverse.
