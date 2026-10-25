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
