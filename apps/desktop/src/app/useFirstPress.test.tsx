import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFirstPress } from './useFirstPress';

afterEach(cleanup);

function Window({ onBack }: { onBack: () => void }) {
  useFirstPress();
  return (
    <div>
      <button type="button" onClick={onBack}>
        ← 대화
      </button>
      <iframe title="앱" />
      <div className="xterm">
        <textarea aria-label="터미널" />
      </div>
    </div>
  );
}

describe('the first press after the focus was in the app or the terminal', () => {
  it('lets the frame or the terminal go as the press begins, and the press acts', () => {
    const onBack = vi.fn();
    render(<Window onBack={onBack} />);
    const back = screen.getByRole('button', { name: '← 대화' });
    for (const holder of [screen.getByTitle('앱'), screen.getByRole('textbox', { name: '터미널' })]) {
      holder.focus();
      expect(document.activeElement).toBe(holder);
      fireEvent.pointerDown(back);
      expect(document.activeElement).not.toBe(holder);
      fireEvent.click(back);
    }
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('leaves a press inside the terminal alone', () => {
    render(<Window onBack={vi.fn()} />);
    const terminal = screen.getByRole('textbox', { name: '터미널' });
    terminal.focus();
    fireEvent.pointerDown(terminal);
    expect(document.activeElement).toBe(terminal);
  });
});
