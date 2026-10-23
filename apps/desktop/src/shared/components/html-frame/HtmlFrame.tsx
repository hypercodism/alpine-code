import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

/** Tailwind's browser build (about 280 KB), loaded the first time a frame is drawn. */
let tailwind: Promise<string> | null = null;
function loadTailwind() {
  tailwind ??= import('@tailwindcss/browser?raw').then((m: { default: string }) => m.default);
  return tailwind;
}

/**
 * The tokens a page may draw with besides Tailwind's own, so one theme restyles every page at once: `bg-page`,
 * `bg-surface`, `text-ink`, `text-muted`, `border-line`, `bg-accent`, `text-on-accent`, `font-display`, `font-body`
 * and `rounded-card`. A theme sets the CSS variables behind them.
 */
const TOKENS = `<style type="text/tailwindcss">@theme inline {
--color-page: var(--page); --color-surface: var(--surface); --color-ink: var(--ink); --color-muted: var(--muted);
--color-line: var(--line); --color-accent: var(--accent); --color-on-accent: var(--on-accent);
--font-display: var(--display); --font-body: var(--body); --radius-card: var(--radius); }</style>`;

/** Swaps the theme when the app posts a new one, so the page does not load again. */
const LISTEN = `<script>addEventListener('message', (e) => { if (e.data && e.data.type === 'theme')
document.getElementById('alpine-theme').textContent = e.data.css; });</script>`;

/**
 * A page for a sandboxed frame: the HTML with Tailwind's browser build, the theme tokens and the theme first in its
 * head, so its classes draw without a network. The HTML may be a whole document or only the body.
 */
export function pageFor(html: string, css: string, theme = ''): string {
  const script = `<script>${css.replaceAll('</script', '<\\/script')}</script>`;
  const head = `${script}${TOKENS}<style id="alpine-theme">${theme}</style>${LISTEN}`;
  const open = /<head[^>]*>/i.exec(html);
  if (open) return html.slice(0, open.index + open[0].length) + head + html.slice(open.index + open[0].length);
  return `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${html}</body></html>`;
}

/**
 * An HTML page in a sandboxed frame that cannot reach the app, drawn `pageWidth` wide and made smaller to fit its box.
 * `ratio` is the box's height over its width. A `theme` (CSS setting the token variables) can change at any time
 * without the page loading again. An `inert` page is a picture: it does not scroll or take clicks.
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
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState<string | null>(null);
  // The theme the page was first drawn with; later ones are posted to it.
  const first = useRef(theme);

  useEffect(() => {
    let live = true;
    void loadTailwind().then((css) => live && setPage(pageFor(html, css, first.current)));
    return () => {
      live = false;
    };
  }, [html]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'theme', css: theme }, '*');
  }, [theme]);

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
          ref={frame}
          title={title}
          srcDoc={page}
          sandbox="allow-scripts"
          tabIndex={inert ? -1 : undefined}
          aria-hidden={inert || undefined}
          onLoad={(event) => event.currentTarget.contentWindow?.postMessage({ type: 'theme', css: theme }, '*')}
          className={clsx('absolute top-0 left-0 origin-top-left border-0', inert && 'pointer-events-none')}
          style={{ width: pageWidth, height: (width * ratio) / scale, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}
