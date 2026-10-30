import { create } from 'zustand';

/** What the settings sheet shows: the agents (model, skills, tools), the model connection, or the rest. */
export type SettingsPlace = 'agents' | 'connection' | 'general';

/** What the 에이전트 page reads: which agent, 새 에이전트, or the library on 스킬. */
export type AgentsSearch = { agent?: string; create?: true; library?: 'skill' };

interface SheetState {
  /** The place shown, or null while the sheet is shut. */
  place: SettingsPlace | null;
  agent?: string;
  creating: boolean;
  library?: 'skill';
}

/** One sheet per window, over whatever is under it (the board stays where it was). */
export const useSettingsSheet = create<SheetState>()(() => ({ place: null, creating: false }));

/** Opens the sheet at `place`; for the agents, `search` is what the 에이전트 page reads (which one, 새 에이전트, 스킬). */
export function openSettings(place: SettingsPlace = 'agents', search: AgentsSearch = {}) {
  useSettingsSheet.setState({ place, agent: search.agent, creating: !!search.create, library: search.library });
}

export function closeSettings() {
  useSettingsSheet.setState({ place: null });
}

/** The project whose memory shows in its sheet, or null while it is shut. */
export const useMemorySheet = create<{ project: string | null }>()(() => ({ project: null }));

export function openMemory(project: string) {
  useMemorySheet.setState({ project });
}

export function closeMemory() {
  useMemorySheet.setState({ project: null });
}
