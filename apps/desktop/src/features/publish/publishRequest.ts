import { create } from 'zustand';

import { usePublishStatus } from '@/shared/server';

/**
 * 인터넷에 올리기 on the map's done line opens the top bar's 올리기 sheet, which holds the publish in progress; the
 * line only asks for it here, with the button pressed, which the sheet opens beside.
 */
export const usePublishRequest = create<{
  cwd: string | null;
  from: Element | null;
  ask: (cwd: string, from?: Element | null) => void;
  take: () => void;
}>((set) => ({
  cwd: null,
  from: null,
  ask: (cwd, from = null) => set({ cwd, from }),
  take: () => set({ cwd: null, from: null }),
}));

/**
 * Opens the 올리기 sheet of the project's top bar. After the press that asked for it is over: a sheet opened during
 * that press would take it for a press outside itself and close again.
 */
export const openPublish = (cwd: string, from?: Element | null) =>
  void setTimeout(() => usePublishRequest.getState().ask(cwd, from));

/**
 * Whether the project has something to put online (a web app in it), so 올리기 is offered for it; asked only while
 * Alpine Cloud is on. A person signed out or without Node.js still gets it: the sheet says what is missing.
 */
export function usePublishable(cwd: string, cloud: boolean): boolean {
  const found = usePublishStatus(cwd, cloud).data;
  return cloud && !!found && found.reason !== 'not_web' && found.reason !== 'no_description';
}
