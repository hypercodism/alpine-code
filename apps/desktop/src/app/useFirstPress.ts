import { useEffect } from 'react';

const CONTROL = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"]), [role="menuitem"]';

/**
 * Where the keyboard focus can sit that is not the page's own: the app view's frame (its page has the focus), and the
 * terminal (xterm's hidden input).
 */
function holderOf(element: Element): Element | null {
  return element.tagName === 'IFRAME' ? element : element.closest('.xterm');
}

/**
 * A press anywhere else in the window acts on the first click after the focus was in the app's frame or the terminal.
 * In the real app the first click on ⋯ or ← 대화 then did nothing and only the second worked: the press went to taking
 * the focus back from the frame or the terminal (and, with Korean typed there, to finishing the syllable). The focus
 * is let go as the press begins, before anything under the pointer handles it.
 */
export function useFirstPress() {
  useEffect(() => {
    const press = (event: PointerEvent) => {
      const held = document.activeElement;
      if (!(held instanceof HTMLElement) || !(event.target instanceof Node)) return;
      const holder = holderOf(held);
      if (!holder || holder.contains(event.target)) return;
      // The control pressed takes the focus (WebKit gives none to a pressed button); elsewhere the focus just goes.
      const control = event.target instanceof Element ? event.target.closest<HTMLElement>(CONTROL) : null;
      if (control) control.focus({ preventScroll: true });
      if (document.activeElement === held) held.blur();
    };
    document.addEventListener('pointerdown', press, true);
    return () => document.removeEventListener('pointerdown', press, true);
  }, []);
}
