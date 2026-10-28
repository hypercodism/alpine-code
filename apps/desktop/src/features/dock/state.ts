import { useCallback, useSyncExternalStore } from 'react';

// Same key as the old work result panel, so a remembered "open" carries over.
const STORAGE_KEY = 'alpine.work-result.open';

const listeners = new Set<() => void>();
let open: boolean | null = null;
/** The page (its scope, e.g. `session:<id>`) that is enlarged, or null. Scoped so another page is never hidden by it. */
let expanded: string | null = null;
/** The dock tab picked last (by me or by `showDockTab`), or null for the first. One dock per window, so one choice. */
let tab: string | null = null;

function readOpen(): boolean {
  if (open === null) {
    try {
      // Open until I close it: the map's conversation and its input live there (map-first 43).
      open = localStorage.getItem(STORAGE_KEY) !== 'false';
    } catch {
      open = true;
    }
  }
  return open;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

/**
 * Whether the right dock is open: open until I close it, then remembered across sessions and restarts. The state is
 * shared, so the top bar's button and the dock beside the page always agree.
 */
export function useDockOpen(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, readOpen);
  const set = useCallback((next: boolean) => {
    open = next;
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Not remembered, but it still opens and closes.
    }
    // Closing the dock also ends "크게 보기", so the next opening is the normal width.
    if (!next) expanded = null;
    emit();
  }, []);
  return [value, set];
}

/**
 * Whether the dock takes the whole width ("크게 보기") on the page with this scope. Not remembered: a window starts with
 * the normal width, and a different session or project never inherits it (see `resetExpanded`).
 */
export function useDockExpanded(scope: string): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => expanded === scope);
  const set = useCallback(
    (next: boolean) => {
      expanded = next ? scope : null;
      emit();
    },
    [scope],
  );
  return [value, set];
}

/** Ends "크게 보기" when the page is no longer the one it was set on, so going back to it shows the normal width. */
export function resetExpanded(scope: string) {
  if (expanded !== null && expanded !== scope) {
    expanded = null;
    emit();
  }
}

/** Ends "크게 보기" when its own page unmounts or leaves its scope, so a detour through another page resets it. */
export function endExpanded(scope: string) {
  if (expanded === scope) {
    expanded = null;
    emit();
  }
}

/** The dock's selected tab id (null: the first tab). Shared, so a page can ask the dock to show one of its tabs. */
export function useDockTab(): [string | null, (id: string) => void] {
  const value = useSyncExternalStore(subscribe, () => tab);
  const set = useCallback((id: string) => {
    tab = id;
    emit();
  }, []);
  return [value, set];
}

/** Where a project window's icon rail stands (2c): the place picked, and whether its panel is folded away. */
export interface RailState {
  place: string;
  folded: boolean;
}

const RAIL_KEY = 'alpine.rail';
const FIRST_PLACE: RailState = { place: 'summary', folded: false };
/** Each project's rail, remembered across restarts. */
let rails: Record<string, RailState> | null = null;
/** The project whose window shows the rail now, so `showDockTab` opens a place there. */
let railProject: string | null = null;

function readRails(): Record<string, RailState> {
  if (rails === null) {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(RAIL_KEY) ?? '{}');
      rails = saved && typeof saved === 'object' ? (saved as Record<string, RailState>) : {};
    } catch {
      rails = {};
    }
  }
  return rails;
}

function writeRail(cwd: string, next: RailState) {
  rails = { ...readRails(), [cwd]: next };
  try {
    localStorage.setItem(RAIL_KEY, JSON.stringify(rails));
  } catch {
    // Not remembered, but the rail still follows.
  }
  emit();
}

/** Forgets every project's rail (tests start from a fresh one, as after clearing storage). */
export function forgetRails() {
  rails = null;
  emit();
}

/** The project's rail: the place last picked (대화 at first) and whether its panel is folded. */
export function useRail(cwd: string): RailState {
  return useSyncExternalStore(subscribe, () => readRails()[cwd] ?? FIRST_PLACE);
}

/** Picks a place on the rail; the place already open folds its panel away, and any place opens it again. */
export function pickRailPlace(cwd: string, place: string) {
  const now = readRails()[cwd] ?? FIRST_PLACE;
  writeRail(cwd, { place, folded: now.place === place && !now.folded });
}

/** The project window showing the rail, while it shows (null when it goes). */
export function setRailProject(cwd: string | null) {
  railProject = cwd;
}

/** Opens the dock on one tab, e.g. the conversation of a session the map just started. */
export function showDockTab(id: string) {
  if (railProject) writeRail(railProject, { place: id, folded: false });
  tab = id;
  open = true;
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Not remembered, but it still opens.
  }
  emit();
}
