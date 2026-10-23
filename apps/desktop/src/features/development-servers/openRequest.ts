import { create } from 'zustand';

/**
 * 앱 열기 asked for a project's app (the map's done line): the 미리보기 tab opens it once it is on screen. Kept here,
 * not in the tab, because the tab may not be mounted yet when it is asked for.
 */
export const useOpenRequest = create<{ cwd: string | null; ask: (cwd: string) => void; take: () => void }>((set) => ({
  cwd: null,
  ask: (cwd) => set({ cwd }),
  take: () => set({ cwd: null }),
}));

/** Opens the project's app in the 미리보기 tab: its server if it has one, else one Alpine starts for it. */
export const openApp = (cwd: string) => useOpenRequest.getState().ask(cwd);
