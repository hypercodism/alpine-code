import { Menu } from '@alpine/ui/primitives';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFirstPress } from './useFirstPress';

afterEach(cleanup);

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

function Window({ onBack, onScreen = vi.fn() }: { onBack: () => void; onScreen?: () => void }) {
  useFirstPress();
  return (
    <div>
      <button type="button" onClick={onBack}>
        ← 대화
      </button>
      <iframe title="앱" />
      <p>지금 보는 화면</p>
      <aside>
        <button type="button" onClick={onScreen}>
          예약 목록
        </button>
      </aside>
      {/* eslint-disable-next-line better-tailwindcss/no-unknown-classes -- xterm's own class, which the hook looks for */}
      <div className="xterm">
        <textarea aria-label="터미널" />
      </div>
    </div>
  );
}

function WithMenu() {
  useFirstPress();
  return (
    <div>
      <iframe title="앱" />
      <Menu.Root>
        <Menu.Trigger aria-label="더 보기">⋯</Menu.Trigger>
        <Menu.Popup>
          <Menu.Item>설정</Menu.Item>
        </Menu.Popup>
      </Menu.Root>
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

  it('takes the focus back from the app as soon as the pointer comes onto a control beside it', () => {
    render(<Window onBack={vi.fn()} />);
    const frame = screen.getByTitle('앱');
    frame.focus();
    // Resting on words beside the app, typing into it goes on.
    fireEvent.pointerOver(screen.getByText('지금 보는 화면'));
    expect(document.activeElement).toBe(frame);
    fireEvent.pointerOver(screen.getByRole('button', { name: '예약 목록' }));
    expect(document.activeElement).not.toBe(frame);
  });

  it('keeps the terminal typing while the pointer passes over a control', () => {
    render(<Window onBack={vi.fn()} />);
    const terminal = screen.getByRole('textbox', { name: '터미널' });
    terminal.focus();
    fireEvent.pointerOver(screen.getByRole('button', { name: '← 대화' }));
    expect(document.activeElement).toBe(terminal);
  });

  it('finishes a press that brings no click, once', async () => {
    const onScreen = vi.fn();
    render(<Window onBack={vi.fn()} onScreen={onScreen} />);
    const item = screen.getByRole('button', { name: '예약 목록' });
    screen.getByTitle('앱').focus();
    fireEvent.pointerDown(item);
    fireEvent.pointerUp(item);
    await turn();
    expect(onScreen).toHaveBeenCalledTimes(1);

    // Its beginning never arrived: the release still acts.
    screen.getByTitle('앱').focus();
    fireEvent.pointerOver(item);
    fireEvent.pointerUp(item);
    await turn();
    expect(onScreen).toHaveBeenCalledTimes(2);
  });

  it('never clicks twice when the click comes', async () => {
    const onBack = vi.fn();
    render(<Window onBack={onBack} />);
    const back = screen.getByRole('button', { name: '← 대화' });
    screen.getByTitle('앱').focus();
    fireEvent.pointerDown(back);
    fireEvent.pointerUp(back);
    fireEvent.click(back);
    await turn();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('leaves alone a press that began elsewhere, and a press when the focus was the page’s own', async () => {
    const onBack = vi.fn();
    render(<Window onBack={onBack} />);
    const back = screen.getByRole('button', { name: '← 대화' });
    screen.getByTitle('앱').focus();
    fireEvent.pointerDown(screen.getByText('지금 보는 화면'));
    fireEvent.pointerUp(back);
    await turn();
    fireEvent.pointerDown(back);
    fireEvent.pointerUp(back);
    await turn();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('opens ⋯ once when its press is finished by hand', async () => {
    render(<WithMenu />);
    const more = screen.getByRole('button', { name: '더 보기' });
    // Only the release arrives: the click made by hand opens the menu.
    screen.getByTitle('앱').focus();
    fireEvent.pointerOver(more);
    fireEvent.pointerUp(more);
    await turn();
    expect(await screen.findByRole('menuitem', { name: '설정' })).toBeTruthy();
  });

  it('leaves ⋯ open when its press opened it and only the click did not come', async () => {
    render(<WithMenu />);
    const more = screen.getByRole('button', { name: '더 보기' });
    screen.getByTitle('앱').focus();
    fireEvent.pointerOver(more);
    fireEvent.pointerDown(more, { pointerType: 'mouse' });
    fireEvent.mouseDown(more);
    fireEvent.pointerUp(more, { pointerType: 'mouse' });
    fireEvent.mouseUp(more);
    await turn();
    await turn();
    expect(screen.getByRole('menuitem', { name: '설정' })).toBeTruthy();
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });
});
