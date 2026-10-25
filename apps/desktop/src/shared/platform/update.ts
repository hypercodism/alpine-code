import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { create } from 'zustand';

import { inTauri } from './folders';

/**
 * The version downloaded and waiting to be installed, or `null`. A released app downloads a newer version quietly at
 * launch and installs it when it quits; this lets the window offer to restart into it sooner.
 */
export function useUpdateReady(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!inTauri()) return;
    let live = true;
    // Asked as well as listened for: the download can finish before this window starts listening.
    void invoke<string | null>('update_ready').then((ready) => live && ready && setVersion(ready));
    const unlisten = listen<string>('update-ready', (event) => setVersion(event.payload));
    return () => {
      live = false;
      void unlisten.then((stop) => stop());
    };
  }, []);
  return version;
}

export type UpdateCheck = { kind: 'ready'; version: string } | { kind: 'newest' } | { kind: 'failed' };

/**
 * A check by hand under way, for the window to show at once (it can take as long as a download): `checking` until a
 * newer version is found, then `downloading` (the shell says so with `update-downloading`); `null` when none runs.
 */
export const useUpdateCheck = create<{ phase: 'checking' | 'downloading' | null }>(() => ({ phase: null }));

let checking: Promise<UpdateCheck> | null = null;

/**
 * Checks for a newer version now and downloads it; `ready` also sends `update-ready`. A check asked for while one runs
 * is the same check.
 */
export function checkForUpdate(): Promise<UpdateCheck> {
  checking ??= check().finally(() => {
    checking = null;
    useUpdateCheck.setState({ phase: null });
  });
  return checking;
}

async function check(): Promise<UpdateCheck> {
  useUpdateCheck.setState({ phase: 'checking' });
  const unlisten = inTauri()
    ? listen('update-downloading', () => useUpdateCheck.setState({ phase: 'downloading' }))
    : null;
  try {
    const version = await invoke<string | null>('update_check');
    return version ? { kind: 'ready', version } : { kind: 'newest' };
  } catch {
    return { kind: 'failed' };
  } finally {
    void unlisten?.then((stop) => stop());
  }
}

/** Installs the waiting version and restarts into it. */
export async function restartToUpdate(): Promise<void> {
  await invoke('update_restart');
}

/**
 * Starts the app again, with a new server: for when the server stopped. A version waiting to be installed goes in on
 * the way, as on any restart. A plain browser loads the page again.
 */
export async function restartApp(): Promise<void> {
  if (!inTauri()) return window.location.reload();
  await invoke('update_restart');
}
