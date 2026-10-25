import { describe, expect, it, vi } from 'vitest';

import { checkForUpdate, useUpdateCheck } from './update';

const shell = vi.hoisted(() => ({ answer: null as ((version: string | null) => void) | null, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: shell.invoke.mockImplementation(() => new Promise<string | null>((resolve) => (shell.answer = resolve))),
}));

describe('checking for updates by hand (#50)', () => {
  it('says it checks at once, and a second ask while it runs is the same check', async () => {
    const first = checkForUpdate();
    const second = checkForUpdate();
    expect(useUpdateCheck.getState().phase).toBe('checking');
    expect(shell.invoke).toHaveBeenCalledOnce();
    shell.answer!('0.2.0');
    expect(await first).toEqual({ kind: 'ready', version: '0.2.0' });
    expect(await second).toEqual({ kind: 'ready', version: '0.2.0' });
    expect(useUpdateCheck.getState().phase).toBeNull();
  });
});
