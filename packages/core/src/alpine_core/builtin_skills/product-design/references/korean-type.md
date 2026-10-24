# Korean type

## Faces that load on the web

Text faces (sans):

| Face | CSS family | Load |
| --- | --- | --- |
| Pretendard | `'Pretendard Variable', Pretendard` | `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css` |
| SUIT | `'SUIT Variable'` | `https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css` |
| Wanted Sans | `'Wanted Sans Variable'` | `https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css` |
| IBM Plex Sans KR | `'IBM Plex Sans KR'` | Google Fonts |
| 고운돋움 | `'Gowun Dodum'` | Google Fonts |

Display and reading faces:

| Face | CSS family | Feels | Load |
| --- | --- | --- | --- |
| Noto Serif KR | `'Noto Serif KR'` | classic, editorial | Google Fonts |
| 고운바탕 | `'Gowun Batang'` | warm, handmade, gentle | Google Fonts |
| 마루부리 | `'MaruBuri'` | calm, literary, modern serif | `https://hangeul.pstatic.net/hangeul_static/css/maru-buri.css` |
| Hahmlet | `'Hahmlet'` | contemporary serif, variable weight | Google Fonts |
| 나눔명조 | `'Nanum Myeongjo'` | traditional, formal | Google Fonts |
| 도현 | `'Do Hyeon'` | bold sign lettering (배민) | Google Fonts |
| 주아 | `'Jua'` | round, friendly, playful (배민) | Google Fonts |

Google Fonts in one link: `https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap` (add each
`family=` you use, with only the weights you use). Google serves Korean in small slices, so only the glyphs on the
page download. Always end the stack with a fallback: `'Gowun Batang', 'Noto Serif KR', serif`.

In a built product, link the fonts in `index.html` (`<link rel="preconnect">` to the host, then the stylesheet) or
install them from npm (`pretendard`), and set the families in the Tailwind theme (`--font-display`, `--font-body`).

## Pairings

- **Pretendard alone**, weights 400/600/700: the safest; make it special with scale and spacing, not a second face.
- **고운바탕 titles + Pretendard text**: warm, local, handmade (bakery, florist, tea shop, small brand).
- **Noto Serif KR or 마루부리 titles + Pretendard text**: editorial, calm (blog, magazine, portfolio, clinic).
- **Hahmlet titles + SUIT text**: contemporary and confident (studio, gallery, architecture).
- **SUIT or Wanted Sans alone**: crisp and a little more geometric than Pretendard (tool, booking, fitness).
- **도현 or 주아 titles + Pretendard text**: loud and friendly; only when the concept is playful, titles only.
- **IBM Plex Sans KR + a mono for numbers**: technical, honest (developer tool, data).

One display face and one text face at most. Never a decorative face for body text, buttons or numbers in tables.

## Scale

A phone screen, in px (desktop: multiply titles by about 1.25, keep body at 15-16 for dense tools):

| Role | Size | Weight | Line height | Letter spacing |
| --- | --- | --- | --- | --- |
| Screen title / big number | 28-40 | 700 | 1.25-1.3 | -0.02em |
| Section title | 20-22 | 700 | 1.35 | -0.01em |
| Body | 15-17 | 400 | 1.6-1.7 | 0 |
| Label, button | 15-16 | 600 | 1.4 | 0 |
| Small, meta | 13 | 400-500 | 1.5 | 0 |

Five sizes cover most products. If two sizes are 1-2 px apart, merge them. A serif title is often best one step
larger and one weight lighter than a sans title.

## Hangul specifics

- `word-break: keep-all` on text (Tailwind `break-keep`), so lines break between words, not inside them.
- Body text measure: about 25-35 Hangul characters per line on a phone, at most about 45 on a desktop column.
- Do not use italics for Korean (most faces have none; the browser slants it badly); use weight or colour.
- Do not put spaces in Korean with letter-spacing; tighten only titles.
- Mixed Korean and Latin: Pretendard and SUIT already match Latin to Hangul; with a serif, check that numbers and
  Latin do not look smaller than the Hangul beside them.

## Numbers

- `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`) wherever numbers line up or change (prices, times,
  counts, tables).
- Group thousands (12,000), put the unit after in a smaller, lighter size (**12,000**원, **3**시간 전).
- Dates and times in Korean order and words: "10월 25일 (토) 오후 3:00", "어제", "3분 전".
