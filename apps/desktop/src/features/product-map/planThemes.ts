/**
 * Looks a planned map's sketches can wear. A sketch draws only with the theme tokens (`bg-page`, `text-ink`,
 * `bg-accent`, `font-display`, `rounded-card`...; see `HtmlFrame`), so a look is a handful of CSS variables and picking
 * one restyles every sketch at once, without drawing them again. Until a look is picked the sketches are grey lines.
 */
export interface PlanLook {
  id: string;
  css: string;
}

const look = (vars: Record<string, string>) =>
  `:root{${Object.entries(vars)
    .map(([name, value]) => `--${name}:${value}`)
    .join(';')}}`;

const SANS = `'Pretendard Variable', Pretendard, system-ui, sans-serif`;

export const WIREFRAME: PlanLook = {
  id: 'wireframe',
  css: look({
    page: '#ffffff',
    surface: '#f1f4f7',
    ink: '#5d6975',
    muted: '#9aa5b0',
    line: '#e1e7ed',
    accent: '#c3ccd5',
    'on-accent': '#ffffff',
    display: SANS,
    body: SANS,
    radius: '6px',
  }),
};

export const QUIET: PlanLook = {
  id: 'quiet',
  css: look({
    page: '#ffffff',
    surface: '#f5f5f5',
    ink: '#171717',
    muted: '#737373',
    line: '#e5e5e5',
    accent: '#171717',
    'on-accent': '#ffffff',
    display: `'Noto Serif KR', serif`,
    body: SANS,
    radius: '10px',
  }),
};

export const MAGAZINE: PlanLook = {
  id: 'magazine',
  css: look({
    page: '#f5f5f4',
    surface: '#ffffff',
    ink: '#1c1917',
    muted: '#78716c',
    line: '#e7e5e4',
    accent: '#ea580c',
    'on-accent': '#ffffff',
    display: SANS,
    body: SANS,
    radius: '14px',
  }),
};

export const TERMINAL: PlanLook = {
  id: 'terminal',
  css: look({
    page: '#09090b',
    surface: '#18181b',
    ink: '#f4f4f5',
    muted: '#a1a1aa',
    line: '#27272a',
    accent: '#34d399',
    'on-accent': '#052e16',
    display: `'JetBrains Mono', monospace`,
    body: SANS,
    radius: '4px',
  }),
};

/** The fonts every look may use, loaded by every sketch so a new look shows at once. */
export const SKETCH_FONTS = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&family=JetBrains+Mono:wght@500;700&display=swap">`;
