import { useNavigate, useRouter } from '@tanstack/react-router';
import { getName, getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Menu, Submenu } from '@tauri-apps/api/menu';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { useEffect, useRef } from 'react';

import { useLocale, useMessages } from '@/shared/i18n';
import { useNavigation } from '@/shared/navigation';
import { checkForUpdate, inTauri, restartToUpdate } from '@/shared/platform';

import appIcon from '../../src-tauri/icons/128x128@2x.png';
import { menuMessages } from './messages';
import { quitMessages } from './quitMessages';
import { useWorkRunning } from './useWorkRunning';

interface Actions {
  newSession: () => void;
  openFolder: () => void;
  toggleRail: () => void;
}

/**
 * The macOS menu bar, in the app's language. It is built here rather than in Rust so its items can navigate and
 * follow the language setting; its shortcuts (⌘N, ⌘O, ⌘,) reach the app through it. Closing the window quits the app,
 * so 윈도우 닫기, 끝내기 and the window's close button all ask first while the AI works. Does nothing outside Tauri.
 */
export function useAppMenu(railOpen: boolean, actions: Actions) {
  const { locale } = useLocale();
  const t = useMessages(menuMessages);
  const q = useMessages(quitMessages);
  const navigate = useNavigate();
  const router = useRouter();
  const working = useWorkRunning();
  // The menu is rebuilt only when its text changes; its items call whatever the latest actions are.
  const latest = useRef({ ...actions, navigate, router, t, q, working });
  useEffect(() => {
    latest.current = { ...actions, navigate, router, t, q, working };
  });

  // The close button is the shell's: it asks here only while the AI works (src-tauri/src/quit.rs).
  useEffect(() => {
    if (inTauri()) void invoke('quit_guard', { working }).catch(() => {});
  }, [working]);
  useEffect(() => {
    if (!inTauri()) return;
    const unlisten = listen('quit-requested', () => void quitAsking(() => latest.current));
    return () => void unlisten.then((stop) => stop());
  }, []);

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
  q: (typeof quitMessages)['ko'];
  /** The AI is at work, so restarting or quitting would stop it. */
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
          { text: t.quit(name), accelerator: 'CmdOrCtrl+Q', action: () => void quitAsking(get) },
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
          // The only window: closing it is quitting.
          { text: t.closeWindow, accelerator: 'CmdOrCtrl+W', action: () => void quitAsking(get) },
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

/** Quits the app; while the AI works, only once the person says so. */
export async function quitAsking(get: () => Latest) {
  const { q, working } = get();
  if (working) {
    const yes = await ask(q.body, {
      title: q.title,
      kind: 'warning',
      okLabel: q.quitAnyway,
      cancelLabel: q.keepWorking,
    });
    if (!yes) return;
  }
  await invoke('quit');
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
export function checkByHand(get: () => Latest, version: string) {
  // Pressed again while it checks, downloads or asks: the same check, so its answer is asked once (#50).
  byHand ??= checkAndAsk(get, version).finally(() => (byHand = null));
  return byHand;
}
let byHand: Promise<void> | null = null;

async function checkAndAsk(get: () => Latest, version: string) {
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
