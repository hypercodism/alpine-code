import { inTauri } from './folders';

/**
 * Tells me something through the system's notifications, asking for permission the first time. Outside Tauri, and
 * when permission is refused, nothing happens.
 */
export async function notify(title: string, body: string): Promise<void> {
  if (!inTauri()) return;
  const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
  if (!(await isPermissionGranted()) && (await requestPermission()) !== 'granted') return;
  sendNotification({ title, body });
}

let shownBadge = 0;

/** The number on the app's Dock icon (none at 0); outside Tauri nothing happens. */
export async function setBadge(count: number): Promise<void> {
  if (!inTauri() || count === shownBadge) return;
  shownBadge = count;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setBadgeCount(count > 0 ? count : undefined);
  } catch {
    // An older system without badges: the notification still tells.
  }
}
