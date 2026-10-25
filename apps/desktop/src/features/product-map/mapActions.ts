import type { ReactNode } from 'react';
import { create } from 'zustand';

import type { PlanPhase } from './planData';

/** What a project's map can be asked to do from outside it (the top bar), and how it stands for that. */
export interface MapActions {
  /** Where a plan stands; `null` for a map that is not a plan. */
  phase: PlanPhase | null;
  /** Product decisions still open on a plan. */
  left: number;
  /** The map's cards, and how many are built. */
  cards: number;
  built: number;
  /** The map's AI works now: drawing, asking, building, or a request. */
  working: boolean;
  /** What the build does now while no card is being built ("데이터와 구조를 만드는 중"); `null` otherwise. */
  activity: string | null;
  /** Something is being started; another press would start it twice. */
  busy: boolean;
  /** Starts building the plan as it stands ("이대로 만들기"). */
  build: () => void;
  /** Stops what the map's AI does now. */
  stop: () => void;
}

/**
 * The open maps' actions, by project folder. The map registers its own while it is on screen, so the top bar starts a
 * build or stops work exactly as the map would, without being handed anything.
 */
export const useMapActionStore = create<{
  maps: Record<string, MapActions>;
  register: (cwd: string, actions: MapActions | null) => void;
}>((set) => ({
  maps: {},
  register: (cwd, actions) =>
    set(({ maps }) => {
      const next = { ...maps };
      if (actions) next[cwd] = actions;
      else delete next[cwd];
      return { maps: next };
    }),
}));

/** The actions of the map of this project while it is on screen, else `null`. */
export const useMapActions = (cwd: string) => useMapActionStore((state) => state.maps[cwd] ?? null);

/** The map's menu as the window's ⋯ shows it: its items, and whether something new waits in them (the history). */
export interface MapMenuEntry {
  items: ReactNode;
  dot: boolean;
}

/**
 * The open maps' menus, by project folder: on the map's page the map has no ⋯ of its own, and its items are the "지도"
 * part of the window's ⋯ (MoreMenu). The map registers them while it is on screen.
 */
export const useMapMenuStore = create<{
  menus: Record<string, MapMenuEntry>;
  register: (cwd: string, entry: MapMenuEntry | null) => void;
}>((set) => ({
  menus: {},
  register: (cwd, entry) =>
    set(({ menus }) => {
      const next = { ...menus };
      if (entry) next[cwd] = entry;
      else delete next[cwd];
      return { menus: next };
    }),
}));

/** The menu of the map of this project while it is on screen and gives its menu to the window, else `null`. */
export const useMapMenu = (cwd: string | null) => useMapMenuStore((state) => (cwd ? (state.menus[cwd] ?? null) : null));
