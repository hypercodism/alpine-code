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

/** A look picked in answer to the look question, and the map's own look when it was picked (`''`: none). */
export interface PickedLook {
  css: string;
  before: string;
}

/**
 * The look the map's screens wear: the one being tried on the look question; else, once one was picked, that one until
 * the AI writes the map's own look after the answer (so the screens do not fall back to grey lines in between); else the
 * map's own. `undefined` is the grey lines.
 */
export function wornLook(trying: string | undefined, picked: PickedLook | null, mapLook: string | undefined) {
  if (trying) return trying;
  if (picked && picked.before === (mapLook ?? '')) return picked.css;
  return mapLook;
}

/**
 * The fonts every look may use (the planning skill lists them), loaded by every screen so a new look shows at once.
 * A browser downloads a face only when a screen uses it.
 */
const FONTS = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css">
<link rel="stylesheet" href="https://hangeul.pstatic.net/hangeul_static/css/maru-buri.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&family=JetBrains+Mono:wght@500;700&family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=Hahmlet:wght@400..800&family=IBM+Plex+Sans+KR:wght@400;600;700&family=Nanum+Myeongjo:wght@400;700;800&family=Do+Hyeon&family=Jua&display=swap">`;

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
