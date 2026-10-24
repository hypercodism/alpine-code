import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

/**
 * The tokens a page may draw with besides Tailwind's own, so one theme restyles every page at once: `bg-page`,
 * `bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-accent`, `text-on-accent`, `font-display`, `font-body`
 * and `rounded-card`. A theme sets the CSS variables behind them.
 */
const TOKENS = `@theme inline {
--color-page: var(--page); --color-surface: var(--surface); --color-ink: var(--ink); --color-muted: var(--muted);
--color-line: var(--line); --color-accent: var(--accent); --color-on-accent: var(--on-accent);
--font-display: var(--display); --font-body: var(--body); --radius-card: var(--radius); }`;

/**
 * Tailwind's compiler, made here in the app the first time a frame is drawn. The app's security policy allows no
 * script in a frame's page (a page written into a frame takes the app's policy), so the page gets the CSS for its
 * own classes and no script at all.
 */
let compiler: Promise<{ build(candidates: string[]): string }> | null = null;
function loadCompiler() {
  compiler ??= Promise.all([import('tailwindcss'), import('tailwindcss/index.css?raw')]).then(([tailwind, index]) =>
    tailwind.compile(`@import "tailwindcss";\n${TOKENS}`, {
      loadStylesheet: async (_id: string, base: string) => ({
        path: 'tailwindcss/index.css',
        base,
        content: (index as { default: string }).default,
      }),
    }),
  );
  return compiler;
}

/** The words of every class attribute: the candidates Tailwind draws CSS for (unknown ones are skipped). */
export function classesOf(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/class\s*=\s*(?:"([^"]*)"|'([^']*)')/gi))
    for (const word of (match[1] ?? match[2] ?? '').split(/\s+/)) if (word) found.add(word);
  return [...found];
}

/** The page's CSS: Tailwind for its classes and the token utilities. */
async function cssFor(html: string): Promise<string> {
  return (await loadCompiler()).build(classesOf(html));
}

/**
 * A page for a sandboxed frame: the HTML with its CSS and the theme first in its head, so its classes draw without a
 * network or a script. The HTML may be a whole document or only the body.
 */
export function pageFor(html: string, css: string, theme = ''): string {
  const head = `<style>${css.replaceAll('</style', '<\\/style')}</style><style>${theme}</style>`;
  const open = /<head[^>]*>/i.exec(html);
  if (open) return html.slice(0, open.index + open[0].length) + head + html.slice(open.index + open[0].length);
  return `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${html}</body></html>`;
}

/**
 * An HTML page in a sandboxed frame that cannot reach the app, drawn `pageWidth` wide and made smaller to fit its box.
 * `ratio` is the box's height over its width. A `theme` (CSS setting the token variables) can change at any time:
 * the page is drawn again with it. An `inert` page is a picture: it does not scroll or take clicks.
 */
export function HtmlFrame({
  html,
  title,
  pageWidth = 1280,
  ratio,
  theme = '',
  inert,
  className,
}: {
  html: string;
  title: string;
  pageWidth?: number;
  ratio: number;
  theme?: string;
  inert?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [built, setBuilt] = useState<{ html: string; css: string } | null>(null);

  useEffect(() => {
    let live = true;
    void cssFor(html).then((css) => live && setBuilt({ html, css }));
    return () => {
      live = false;
    };
  }, [html]);
  const page = built && built.html === html ? pageFor(html, built.css, theme) : null;

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = width / pageWidth;
  return (
    <div
      ref={box}
      className={clsx('relative w-full overflow-hidden', className)}
      style={{ aspectRatio: `1 / ${ratio}` }}
    >
      {page && width > 0 && (
        <iframe
          title={title}
          srcDoc={page}
          // Nothing in it runs: the page is HTML and CSS only.
          sandbox=""
          tabIndex={inert ? -1 : undefined}
          aria-hidden={inert || undefined}
          className={clsx('absolute top-0 left-0 origin-top-left border-0', inert && 'pointer-events-none')}
          style={{ width: pageWidth, height: (width * ratio) / scale, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}
