import type { MapLook } from '@alpine/protocol';

import { lookCss } from '@/shared/questions';

/**
 * How planned screens are drawn. A screen draws only with the theme tokens (`bg-page`, `text-ink`, `bg-accent`,
 * `font-display`, `rounded-card`...; see `HtmlFrame`), so a look is a handful of CSS variables and picking one restyles
 * every screen at once, without drawing them again. Until a look is picked the screens are grey lines.
 */

const SANS = `'Pretendard Variable', Pretendard, system-ui, sans-serif`;

/** The grey lines screens wear until a look is picked. */
export const WIREFRAME = lookCss({
  page: '#ffffff',
  surface: '#f1f4f7',
  ink: '#5d6975',
  muted: '#9aa5b0',
  line: '#e1e7ed',
  accent: '#c3ccd5',
  on_accent: '#ffffff',
  display: SANS,
  body: SANS,
  radius: '6px',
});

/** The look of a map, as theme CSS. */
export const mapLookCss = (look: MapLook) => lookCss({ ...look, on_accent: look.onAccent });

/** The fonts every look may use, loaded by every screen so a new look shows at once. */
const FONTS = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&family=JetBrains+Mono:wght@500;700&display=swap">`;

/** A screen's body as a whole page, with every look's fonts and the page's ground and ink from the theme. */
export const screenPage = (body: string) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONTS}</head>` +
  `<body class="bg-page text-ink font-body antialiased">${body}</body></html>`;

/** What the person on a journey uses it on (`ProductFlow.device`); a journey without one is drawn for a phone. */
export type Device = 'phone' | 'computer';

/** Planned screens are drawn as a phone screen, then made smaller to fit. */
export const SCREEN_WIDTH = 390;

/** A computer journey's screens are drawn as a desktop window. */
export const DESKTOP_WIDTH = 1280;

/** The width a planned screen is drawn at, by the device of the journey it belongs to. */
export const screenWidthFor = (device?: Device | null) => (device === 'computer' ? DESKTOP_WIDTH : SCREEN_WIDTH);
