import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { classesOf, HtmlFrame, pageFor } from './HtmlFrame';

/**
 * A sketch is drawn in a frame that runs nothing: the app's security policy forbids scripts in a page written into a
 * frame, so Tailwind's CSS for its classes is made in the app and the page gets styles only (the browser build in the
 * page drew nothing in the real app).
 */
describe('a sketch in a frame', () => {
  it('reads the classes it uses', () => {
    expect(classesOf(`<div class="p-4 bg-accent"><p class='text-ink  font-display'>빵</p></div>`)).toEqual([
      'p-4',
      'bg-accent',
      'text-ink',
      'font-display',
    ]);
  });

  it('gets its CSS and the theme, and no script', () => {
    const page = pageFor('<main class="p-4">빵</main>', '.p-4{padding:1rem}', ':root{--accent:red}');
    expect(page).not.toMatch(/<script/i);
    expect(page).toContain('.p-4{padding:1rem}');
    expect(page).toContain(':root{--accent:red}');
  });

  it('draws the token utilities and Tailwind’s own, in a frame that runs nothing', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
        observe() {
          this.callback([{ contentRect: { width: 390 } }]);
        }
        disconnect() {}
      },
    );
    const { container } = render(
      <HtmlFrame html={'<main class="bg-accent text-on-accent rounded-card p-4">빵</main>'} title="빵" ratio={2} />,
    );
    const frame = await waitFor(() => {
      const found = container.querySelector('iframe');
      if (!found) throw new Error('no frame yet');
      return found;
    });
    expect(frame.getAttribute('sandbox')).toBe('');
    const page = frame.getAttribute('srcdoc') ?? '';
    expect(page).not.toMatch(/<script/i);
    expect(page).toContain('.bg-accent');
    expect(page).toContain('var(--accent)');
    expect(page).toContain('.p-4');
    vi.unstubAllGlobals();
  });
});
