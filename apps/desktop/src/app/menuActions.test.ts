import { describe, expect, it, vi } from 'vitest';

import { menuMessages } from './messages';
import { quitMessages } from './quitMessages';
import { buildMenu, type Latest } from './useAppMenu';

/**
 * Tauri forgets an item's action as soon as nothing holds the item, so an item written inline in Menu.new never
 * answers: 설정, 새 프로젝트, 끝내기 (⌘Q) and 윈도우 닫기 (⌘W) did nothing in the app. Every item with an action is made
 * with MenuItem.new and handed back to be held while its menu is in use.
 */

const made = vi.hoisted(() => ({ inline: [] as unknown[], items: [] as { text: string }[] }));
vi.mock('@tauri-apps/api/menu', () => ({
  Menu: { new: vi.fn(async (options: { items: unknown[] }) => (made.inline.push(...options.items), { options })) },
  Submenu: { new: vi.fn(async () => ({ setAsWindowsMenuForNSApp: async () => {} })) },
  MenuItem: {
    new: vi.fn(async (options: { text: string }) => {
      const item = { text: options.text };
      made.items.push(item);
      return item;
    }),
  },
}));
vi.mock('@tauri-apps/api/app', () => ({ getName: async () => 'AlpineCode', getVersion: async () => '0.1.7' }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }));

/** Every item written inline anywhere in the menu, submenus included. */
function inlineItems(items: unknown[]): Record<string, unknown>[] {
  return items.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    return [record, ...(Array.isArray(record.items) ? inlineItems(record.items) : [])];
  });
}

describe('the menu bar', () => {
  it('makes every item with an action as an item of its own and hands them back to be held', async () => {
    const t = menuMessages.ko;
    const get = () => ({ t, q: quitMessages.ko, working: false }) as unknown as Latest;
    const { items } = await buildMenu(false, get);

    expect(inlineItems(made.inline).filter((item) => 'action' in item)).toEqual([]);
    expect(items.map((item) => (item as unknown as { text: string }).text)).toEqual(
      expect.arrayContaining([t.settings, t.quit('AlpineCode'), t.newSession, t.closeWindow, t.addProject]),
    );
  });
});
