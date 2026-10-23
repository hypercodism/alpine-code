import { useNavigate, useRouter } from '@tanstack/react-router';
import { getName, getVersion } from '@tauri-apps/api/app';
import { Menu, Submenu } from '@tauri-apps/api/menu';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { useEffect, useRef } from 'react';

import { useLocale, useMessages } from '@/shared/i18n';
import { useNavigation } from '@/shared/navigation';
import { checkForUpdate, inTauri, restartToUpdate } from '@/shared/platform';

import appIcon from '../../src-tauri/icons/128x128@2x.png';
import { menuMessages } from './messages';
import { useWorkRunning } from './useWorkRunning';

interface Actions {
  newSession: () => void;
  openFolder: () => void;
  toggleRail: () => void;
}

/**
 * The macOS menu bar, in the app's language. It is built here rather than in Rust so its items can navigate and
 * follow the language setting; its shortcuts (⌘N, ⌘O, ⌘,) reach the app through it. Does nothing outside Tauri.
 */
export function useAppMenu(railOpen: boolean, actions: Actions) {
  const { locale } = useLocale();
  const t = useMessages(menuMessages);
  const navigate = useNavigate();
  const router = useRouter();
  const working = useWorkRunning();
  // The menu is rebuilt only when its text changes; its items call whatever the latest actions are.
  const latest = useRef({ ...actions, navigate, router, t, working });
  useEffect(() => {
    latest.current = { ...actions, navigate, router, t, working };
  });

  useEffect(() => {
    if (!inTauri()) return;
    let current = true;
    void buildMenu(railOpen, () => latest.current).then(async (menu) => {
      if (!current) return void menu.close();
      const previous = await menu.setAsAppMenu();
      await previous?.close();
    });
    return () => {
      current = false;
    };
  }, [railOpen, locale]);
}

export type Latest = Actions & {
  navigate: ReturnType<typeof useNavigate>;
  router: ReturnType<typeof useRouter>;
  t: (typeof menuMessages)['ko'];
  /** The AI is at work, so restarting would stop it. */
  working: boolean;
};

async function buildMenu(railOpen: boolean, get: () => Latest): Promise<Menu> {
  const { t } = get();
  const [name, version, icon] = await Promise.all([getName(), getVersion(), iconBytes()]);
  const windowMenu = await Submenu.new({
    text: t.window,
    items: [
      { item: 'Minimize', text: t.minimize },
      { item: 'Maximize', text: t.zoom },
      { item: 'Separator' },
      { item: 'BringAllToFront', text: t.bringAllToFront },
    ],
  });
  const menu = await Menu.new({
    items: [
      {
        text: name,
        items: [
          { item: { About: { name, version, icon } }, text: t.about(name) },
          { text: t.checkUpdate, action: () => void checkByHand(get, version) },
          { item: 'Separator' },
          {
            text: t.settings,
            accelerator: 'CmdOrCtrl+,',
            action: () => void get().navigate({ to: '/settings' }),
          },
          { item: 'Separator' },
          { item: 'Services', text: t.services },
          { item: 'Separator' },
          { item: 'Hide', text: t.hide(name) },
          { item: 'HideOthers', text: t.hideOthers },
          { item: 'ShowAll', text: t.showAll },
          { item: 'Separator' },
          { item: 'Quit', text: t.quit(name) },
        ],
      },
      {
        text: t.file,
        items: [
          { text: t.newSession, accelerator: 'CmdOrCtrl+N', action: () => get().newSession() },
          {
            text: t.searchConversations,
            accelerator: 'CmdOrCtrl+K',
            action: () => useNavigation.getState().setSearchOpen(true),
          },
          { text: t.addProject, accelerator: 'CmdOrCtrl+O', action: () => get().openFolder() },
          { item: 'Separator' },
          { item: 'CloseWindow', text: t.closeWindow },
        ],
      },
      {
        text: t.edit,
        items: [
          { item: 'Undo', text: t.undo },
          { item: 'Redo', text: t.redo },
          { item: 'Separator' },
          { item: 'Cut', text: t.cut },
          { item: 'Copy', text: t.copy },
          { item: 'Paste', text: t.paste },
          { item: 'SelectAll', text: t.selectAll },
        ],
      },
      {
        text: t.view,
        items: [
          {
            text: railOpen ? t.hideSidebar : t.showSidebar,
            accelerator: 'CmdOrCtrl+B',
            action: () => get().toggleRail(),
          },
          { item: 'Separator' },
          { text: t.back, accelerator: 'CmdOrCtrl+[', action: () => get().router.history.back() },
          { text: t.forward, accelerator: 'CmdOrCtrl+]', action: () => get().router.history.forward() },
          { item: 'Separator' },
          { item: 'Fullscreen', text: t.fullscreen },
        ],
      },
      windowMenu,
    ],
  });
  await windowMenu.setAsWindowsMenuForNSApp();
  return menu;
}

/** The app icon for the About window: a development run has no app bundle, so macOS would show a folder. */
async function iconBytes(): Promise<Uint8Array | undefined> {
  try {
    return new Uint8Array(await (await fetch(appIcon)).arrayBuffer());
  } catch {
    return undefined;
  }
}

/**
 * "Check for Updates…": says what it found, and offers to restart when a newer version is ready; while the AI works,
 * the offer says the work stops. A restart that fails says so.
 */
export async function checkByHand(get: () => Latest, version: string) {
  const { t } = get();
  const found = await checkForUpdate();
  if (found.kind === 'ready') {
    const working = get().working;
    const now = await ask(working ? t.workingBody : t.updateReadyBody, {
      title: working ? t.workingTitle : t.updateReadyTitle(found.version),
      okLabel: working ? t.restartAnyway : t.restartNow,
      cancelLabel: t.later,
    });
    if (now)
      await restartToUpdate().catch(() =>
        message(t.restartFailed, { title: t.updateReadyTitle(found.version), kind: 'warning' }),
      );
  } else if (found.kind === 'newest') {
    await message(t.newestBody(version), { title: t.newestTitle });
  } else {
    await message(t.failedBody, { title: t.failedTitle, kind: 'warning' });
  }
}
