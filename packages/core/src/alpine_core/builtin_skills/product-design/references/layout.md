# Layout

## Scales

- **Spacing**: 4, 8, 12, 16, 24, 32, 48, 64 px (Tailwind 1, 2, 3, 4, 6, 8, 12, 16). Use nothing else.
- **Inside a group** 8-12, **between groups** 24-32, **between sections** 48+. If two things belong together they are
  closer to each other than to anything else.
- **Screen gutter**: 20 px on a phone (16 when dense), 24-32 px on a desktop; the same on every screen.
- **Radius**: one value for cards and buttons from the direction (0-4 sharp and serious, 8-12 neutral, 16-24 soft
  and friendly), smaller for small things (chips, inputs half to two thirds of it). Do not mix sharp and round.
- **Elevation**: flat by default. A shadow only for what floats over content (a sheet, a menu, a floating button).

## Hierarchy

Order of tools, strongest first: position (top, left, large area), size, weight, colour, then lines and boxes. Reach
for the next one only when the earlier ones are used up.

- Squint at the screen: the first thing you see should be the thing the person came for, the second the primary
  action. If the header or a banner wins, it is wrong.
- Secondary text is the muted ink colour, not smaller and lighter and grey at once.
- One element of maximum emphasis per screen.

## Actions

- One primary action per screen: filled with the accent. On a phone, full width at the bottom (56 px tall, 20 px
  from the edges, above the safe area) when the screen exists to do it; inline when it is optional.
- Secondary: outline or tinted. Tertiary: text only. Destructive: red text, and a confirm only when it cannot be undone.
- Buttons say what happens (verb): "예약하기", "3개 담기". Disabled buttons say why nearby.

## Screen patterns

Pick by what the screen is for, so screens differ from each other:

- **Home**: lead with one thing (today's item, the next booking, the balance), then a short list. Not a menu of
  everything the product does.
- **List / feed**: rows, not cards. A thumbnail left or none, title, one line of meta, a value right. Dividers or
  12-16 px between rows. Sorting and filters in one quiet line above.
- **Detail**: the picture or the main fact large, then three to five facts, then the action at the bottom.
- **Form**: one question per screen on a phone (토스 style), or short groups with labels above inputs; the keyboard
  type matches the field; a sensible default filled in.
- **Done / confirmation**: centred is right here: a mark, one sentence of what happened, what happens next, one button.
- **Desktop tool**: a sidebar (dimmer than the work area), a header with the view's title and filters, the work area,
  an optional detail panel. Rows 36-44 px; keyboard shortcuts for the frequent actions.
- **Landing page**: one sentence of who and what, proof (the product itself, real photos, numbers), one way in.

## States

Every screen that shows data has four states besides the good day. Draw or build each:

- **Empty**: a short line of what will be here, why it is empty, and the one action that fills it ("아직 담은 빵이
  없어요" + "오늘의 빵 보기"). An illustration only if the direction has illustrations.
- **Loading**: skeletons in the real shape of the content (rows, the picture's crop), in the surface colour; no
  centred spinner for content. A button that is working shows it in place.
- **Error**: what happened in plain words, whether anything was lost, and a retry or the next step. Never a code or
  "오류가 발생했습니다" alone.
- **Too much / too long**: long names truncate with `…` at one or two lines, long lists paginate or load more, big
  numbers still fit.

## Density

- Airy (consumer, one-handed): 1 thing per row, 56-72 px rows, generous space between sections.
- Medium (shopping, booking): 2 columns of pictures, or 64 px rows with a thumbnail.
- Dense (tools, admin, feeds to scan): 36-48 px rows, smaller text (13-14 px), lines instead of space between rows.

Pick one per product and hold it; a dense admin screen inside an airy consumer app is a different journey (computer)
and may be denser, but uses the same type, colours and radius.

## Motion

- Short: 150-250 ms, ease-out for things arriving, ease-in for leaving.
- Motion explains: a sheet slides from where it was called, an added item flies to the basket once.
- No looping animations, parallax or animated gradients unless the concept is play. Respect
  `prefers-reduced-motion`.

## Accessibility

- Text contrast at least 4.5:1 (3:1 for 24 px and up); check muted text on the surface colour too.
- Tap targets at least 44 x 44 px; at least 8 px between neighbouring targets.
- Never colour alone for meaning (add a word or an icon); every input has a visible label.
