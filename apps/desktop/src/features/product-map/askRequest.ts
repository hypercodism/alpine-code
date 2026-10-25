import { create } from 'zustand';

/**
 * Words for a project's map from elsewhere (the 미리보기 asking the AI to fix an app that would not open): the map
 * takes them as the person's own once it is on screen. Kept here, not in the map, because it may not be mounted yet.
 */
export const useMapRequest = create<{
  request: { cwd: string; text: string } | null;
  ask: (cwd: string, text: string) => void;
  take: () => void;
}>((set) => ({
  request: null,
  ask: (cwd, text) => set({ request: { cwd, text } }),
  take: () => set({ request: null }),
}));

/** Gives the project's map these words, as if typed into its input. */
export const askMapFor = (cwd: string, text: string) => useMapRequest.getState().ask(cwd, text);
