import { create } from 'zustand';

import { usePublishStatus } from '@/shared/server';

/**
 * 인터넷에 올리기 on the map's done line opens the top bar's 올리기 sheet, which holds the publish in progress; the
 * line only asks for it here.
 */
export const usePublishRequest = create<{ cwd: string | null; ask: (cwd: string) => void; take: () => void }>(
  (set) => ({
    cwd: null,
    ask: (cwd) => set({ cwd }),
    take: () => set({ cwd: null }),
  }),
);

/** Opens the 올리기 sheet of the project's top bar. */
export const openPublish = (cwd: string) => usePublishRequest.getState().ask(cwd);

/**
 * Whether the project has something to put online (a web app in it), so 올리기 is offered for it; asked only while
 * Alpine Cloud is on. A person signed out or without Node.js still gets it: the sheet says what is missing.
 */
export function usePublishable(cwd: string, cloud: boolean): boolean {
  const found = usePublishStatus(cwd, cloud).data;
  return cloud && !!found && found.reason !== 'not_web' && found.reason !== 'no_description';
}
