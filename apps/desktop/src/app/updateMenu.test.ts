import { afterEach, describe, expect, it, vi } from 'vitest';

import { menuMessages } from './messages';
import { checkByHand, type Latest } from './useAppMenu';

/** The menu's "업데이트 확인…" (#18): it says the work stops before restarting over it, and says when restarting failed. */

const dialog = vi.hoisted(() => ({ ask: vi.fn(async () => false), message: vi.fn(async () => {}) }));
vi.mock('@tauri-apps/plugin-dialog', () => dialog);
const update = vi.hoisted(() => ({
  check: vi.fn(async () => ({ kind: 'ready', version: '0.2.0' }) as const),
  restart: vi.fn(async () => {}),
}));
vi.mock('@/shared/platform', async (original) => ({
  ...(await original<typeof import('@/shared/platform')>()),
  checkForUpdate: update.check,
  restartToUpdate: update.restart,
}));

const t = menuMessages.ko;
const latest = (working: boolean) => () => ({ t, working }) as unknown as Latest;

afterEach(() => vi.clearAllMocks());

describe('checking for updates from the menu', () => {
  it('says the work stops while the AI works, and stays when I say later', async () => {
    await checkByHand(latest(true), '0.1.0');
    expect(dialog.ask).toHaveBeenCalledWith(
      t.workingBody,
      expect.objectContaining({ title: t.workingTitle, okLabel: t.restartAnyway }),
    );
    expect(update.restart).not.toHaveBeenCalled();
  });

  it('restarts when nothing works, and says so when it could not', async () => {
    dialog.ask.mockResolvedValueOnce(true);
    update.restart.mockRejectedValueOnce(new Error('install failed'));
    await checkByHand(latest(false), '0.1.0');
    expect(dialog.ask).toHaveBeenCalledWith(t.updateReadyBody, expect.objectContaining({ okLabel: t.restartNow }));
    expect(update.restart).toHaveBeenCalledOnce();
    expect(dialog.message).toHaveBeenCalledWith(t.restartFailed, expect.objectContaining({ kind: 'warning' }));
  });

  it('asks once however many times it is pressed while it checks and downloads (#50)', async () => {
    let found!: (result: { readonly kind: 'ready'; readonly version: '0.2.0' }) => void;
    update.check.mockImplementationOnce(() => new Promise((resolve) => (found = resolve)));
    const first = checkByHand(latest(false), '0.1.0');
    const again = checkByHand(latest(false), '0.1.0');
    found({ kind: 'ready', version: '0.2.0' });
    await Promise.all([first, again]);
    expect(update.check).toHaveBeenCalledOnce();
    expect(dialog.ask).toHaveBeenCalledOnce();
  });
});
