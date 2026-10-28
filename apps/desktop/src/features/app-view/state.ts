import { create } from 'zustand';

/**
 * What the left of a project's window shows (the 보드 · 문서 · 앱 · 코드 tabs): its map as the board, the same map
 * read as a document, its app running, or its code by screen.
 */
export type ProjectView = 'map' | 'doc' | 'app' | 'code';

/** The size the app is shown at: a phone's or a computer's. */
export type AppSize = 'phone' | 'computer';

interface AppViewState {
  /** Per project folder: what the left shows. A project not in it shows its map. */
  views: Record<string, ProjectView>;
  /** Per project folder: the screen card the app shows (its address), or null for the app's first page. */
  cards: Record<string, string | null>;
  /** Per project folder: the size picked by hand for the screen on view; null follows the screen's journey. */
  sizes: Record<string, AppSize | null>;
}

/**
 * Where each project's window stands between its map and its app (map-first 45, flow-spec 4.2-4.3). Kept outside the
 * page so the top bar's 지도 | 앱, the map's 앱에서 보기 and the conversation's "…화면을 보면서 말하는 중" all read one
 * place. Not remembered across restarts: a reopened project shows its map (flow-spec 6).
 */
export const useAppViewState = create<AppViewState>(() => ({ views: {}, cards: {}, sizes: {} }));

/** What the left of the project's window shows. */
export function useProjectView(cwd: string): ProjectView {
  return useAppViewState((state) => state.views[cwd] ?? 'map');
}

/** The screen card the project's app shows (null: the app's first page). */
export function useAppCard(cwd: string): string | null {
  return useAppViewState((state) => state.cards[cwd] ?? null);
}

/** The size picked by hand for the screen on view, or null to follow the screen's journey. */
export function useAppSize(cwd: string): AppSize | null {
  return useAppViewState((state) => state.sizes[cwd] ?? null);
}

/** Shows the project's map. The app's screen stays picked for coming back. */
export function showMap(cwd: string) {
  showView(cwd, 'map');
}

/** Shows one of the project's tabs other than its app (which `showApp` opens, at a screen or where it was). */
export function showView(cwd: string, view: Exclude<ProjectView, 'app'>) {
  useAppViewState.setState((state) => ({ views: { ...state.views, [cwd]: view } }));
}

/**
 * Shows the project's app; with a card, at that screen's address (a picked size gives way to the new screen's own).
 * Without one, it stays on the screen it showed last.
 */
export function showApp(cwd: string, cardId?: string | null) {
  useAppViewState.setState((state) => ({
    views: { ...state.views, [cwd]: 'app' },
    ...(cardId === undefined
      ? {}
      : { cards: { ...state.cards, [cwd]: cardId }, sizes: { ...state.sizes, [cwd]: null } }),
  }));
}

/**
 * Names the screen the app opened on by itself (its first page's card) as the one on view, when none was picked, so
 * words sent while looking at it name it too. Leaves a picked size alone.
 */
export function settleAppCard(cwd: string, cardId: string) {
  useAppViewState.setState((state) => (state.cards[cwd] ? state : { cards: { ...state.cards, [cwd]: cardId } }));
}

/** Picks the size the app is shown at, until another screen is picked. */
export function setAppSize(cwd: string, size: AppSize) {
  useAppViewState.setState((state) => ({ sizes: { ...state.sizes, [cwd]: size } }));
}

/**
 * The screen card I am looking at in the project's app while I talk (flow-spec 5.3): the card on view while the app is
 * shown, else null. Words sent from the conversation then name that screen.
 */
export function useLookingAt(cwd: string): string | null {
  return useAppViewState((state) => ((state.views[cwd] ?? 'map') === 'app' ? (state.cards[cwd] ?? null) : null));
}

/** The same, read once (for the moment words are sent, outside React). */
export function lookingAt(cwd: string): string | null {
  const state = useAppViewState.getState();
  return (state.views[cwd] ?? 'map') === 'app' ? (state.cards[cwd] ?? null) : null;
}
