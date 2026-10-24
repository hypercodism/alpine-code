import { useEffect } from 'react';

const CONTROL = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"]), [role="menuitem"]';
/** What a press acts on by its click (not a field, which a press only puts the caret in). */
const PRESSABLE = 'button, a[href], [role="menuitem"]';

/**
 * Where the keyboard focus can sit that is not the page's own: the app view's frame (its page has the focus), and the
 * terminal (xterm's hidden input).
 */
function holderOf(element: Element): Element | null {
  return element.tagName === 'IFRAME' ? element : element.closest('.xterm');
}

/**
 * A press anywhere else in the window acts on the first click after the focus was in the app's frame or the terminal.
 * In the real app the first click on ⋯, ← 대화 or a screen beside the app then did nothing and only the second worked.
 *
 * The app's frame is another origin (the project's dev server), so in the Mac app's WebKit the press that takes the
 * focus back from it is spent on that: letting go of the focus as the press begins (the first attempt) came too late.
 * So the frame lets go before the press, as soon as the pointer comes onto a control outside it: the window's own
 * page then holds the focus and the press is an ordinary one. Only a control does it, so typing into the app goes on
 * while the pointer is over the app, or rests anywhere else that is not a button. The terminal is part of the page and
 * keeps the focus until a press elsewhere begins (and, with Korean typed there, the syllable is finished then).
 *
 * And should the click still not come, the press is finished by hand: right after the focus left the frame or the
 * terminal, a press released on the button it began on (or whose beginning never arrived) that brings no click by the
 * time the release is handled clicks that button once. It never clicks twice: a click that did come is left alone.
 */
export function useFirstPress() {
  useEffect(() => {
    // The focus just left the frame or the terminal: the next press is watched for a click that does not come.
    let watched = false;
    let pressedOn: Element | null = null;
    let began = false;
    let clicked = false;
    const sink = document.createElement('span');
    sink.tabIndex = -1;
    sink.style.position = 'fixed';
    sink.style.outline = 'none';
    document.body.append(sink);

    const letGo = (target: EventTarget | null, takeFocus: boolean) => {
      const held = document.activeElement;
      if (!(held instanceof HTMLElement) || !(target instanceof Element)) return;
      const holder = holderOf(held);
      if (!holder || holder.contains(target)) return;
      // The control pressed takes the focus (WebKit gives none to a pressed button); elsewhere the focus just goes.
      const control = takeFocus ? target.closest<HTMLElement>(CONTROL) : null;
      if (control) control.focus({ preventScroll: true });
      if (document.activeElement === held) held.blur();
      // A frame may not let go by being blurred; the page's own spot that shows nothing takes the focus then.
      if (document.activeElement === held) sink.focus({ preventScroll: true });
      watched = true;
    };
    const over = (event: PointerEvent) => {
      if (document.activeElement?.tagName !== 'IFRAME') return;
      if (event.target instanceof Element && event.target.closest(CONTROL)) letGo(event.target, false);
    };
    const press = (event: PointerEvent) => {
      letGo(event.target, true);
      began = true;
      pressedOn = event.target instanceof Element ? event.target.closest(PRESSABLE) : null;
    };
    const release = (event: PointerEvent) => {
      const after = watched;
      const sawBeginning = began;
      const from = pressedOn;
      watched = false;
      began = false;
      pressedOn = null;
      if (!after || event.button > 0 || !(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>(PRESSABLE);
      if (!control || (sawBeginning && from !== control) || control.matches(':disabled')) return;
      // The browser clicks right after the release, in the same turn; a click by then means the press acted.
      clicked = false;
      setTimeout(() => {
        if (!clicked && control.isConnected) control.click();
      }, 0);
    };
    const click = () => {
      clicked = true;
    };
    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerdown', press, true);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerdown', press, true);
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('click', click, true);
      sink.remove();
    };
  }, []);
}
