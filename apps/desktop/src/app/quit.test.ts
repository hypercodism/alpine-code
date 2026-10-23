import { afterEach, describe, expect, it, vi } from 'vitest';

import { quitMessages } from './quitMessages';
import { quitAsking, type Latest } from './useAppMenu';

/**
 * Closing the window quits the app (#1): the red button (while the AI works the shell hands it here), 윈도우 닫기 (⌘W)
 * and 끝내기 (⌘Q) all come to `quitAsking`, which asks first while the AI works and quits once I say so.
 */

const dialog = vi.hoisted(() => ({ ask: vi.fn(async () => false), message: vi.fn(async () => {}) }));
vi.mock('@tauri-apps/plugin-dialog', () => dialog);
const core = vi.hoisted(() => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/api/core', () => core);

const q = quitMessages.ko;
const latest = (working: boolean) => () => ({ q, working }) as unknown as Latest;

afterEach(() => vi.clearAllMocks());

describe('quitting the app', () => {
  it('asks while the AI works, and keeps it working when I say so', async () => {
    await quitAsking(latest(true));
    expect(dialog.ask).toHaveBeenCalledWith(q.body, expect.objectContaining({ title: q.title, okLabel: q.quitAnyway }));
    expect(core.invoke).not.toHaveBeenCalled();
  });

  it('quits once I say stop and quit', async () => {
    dialog.ask.mockResolvedValueOnce(true);
    await quitAsking(latest(true));
    expect(core.invoke).toHaveBeenCalledWith('quit');
  });

  it('quits at once when nothing works', async () => {
    await quitAsking(latest(false));
    expect(dialog.ask).not.toHaveBeenCalled();
    expect(core.invoke).toHaveBeenCalledWith('quit');
  });
});
