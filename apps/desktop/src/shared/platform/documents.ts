import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

import { inTauri } from './folders';

/*
 * Documents taken out of the app (`export.rs`): a place picked to save one, Markdown and PDF written there, a PDF sent
 * through the Mac's share menu, and a picture of a screen of the running app for the PDF's pages.
 */

/** Asks where to save `name` (Finder's save sheet); `null` when cancelled or outside the app. */
export async function pickSavePath(name: string, extension: 'md' | 'pdf', kind: string): Promise<string | null> {
  if (!inTauri()) return null;
  const picked = await save({
    defaultPath: `${name}.${extension}`,
    filters: [{ name: kind, extensions: [extension] }],
  });
  return picked ?? null;
}

export async function saveText(path: string, text: string): Promise<void> {
  await invoke('save_text', { path, text });
}

/** Prints a page of HTML to a PDF at `path`, or to a file of its own for sending; answers where it is. */
export async function savePdf(html: string, path: string | null, name: string): Promise<string> {
  return invoke<string>('save_pdf', { html, path, name });
}

/** Opens the Mac's share menu for a file, under `element` (the button pressed). */
export async function shareFile(path: string, element: Element): Promise<void> {
  const box = element.getBoundingClientRect();
  await invoke('share_file', { path, x: box.x, y: box.y, width: box.width, height: box.height });
}

/** A picture of one screen of the running app, as a data address, or `null` when it could not be taken. */
export async function screenPicture(url: string, width: number, height: number): Promise<string | null> {
  if (!inTauri()) return null;
  const capture = await invoke<{ image: string | null }>('capture_screen', { url, width, height, whole: false });
  return capture.image ? `data:image/png;base64,${capture.image}` : null;
}
