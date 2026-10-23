import type { JudgedNew, ProjectInfo } from '@alpine/protocol';
import { useEffect } from 'react';
import { createStore, type StoreApi } from 'zustand';

import { useNavigation } from '@/shared/navigation';
import { useServer, type CreateStep, type ServerConnection, type TemplateId } from '@/shared/server';

/**
 * After sending: the agent picking a setup for the idea, then the setups with its pick chosen, then the project being
 * made. `judged` is the pick; `null` when the agent gave none (or could not be asked), so the usual setup is chosen
 * and nobody recommends it. `unavailable`: there are no setups to show, because they could not be fetched.
 */
export type Stage =
  | { name: 'judging'; text: string }
  | { name: 'choosing'; text: string; judged: JudgedNew | null; template: TemplateId }
  | { name: 'unavailable'; text: string; error: unknown }
  | CreatingStage;

export type ChoosingStage = Extract<Stage, { name: 'choosing' }>;

export interface CreatingStage {
  name: 'creating';
  text: string;
  judged: JudgedNew | null;
  template: TemplateId;
  /** The steps the server has announced, and the project they are about. */
  steps: CreateStep[];
  project: ProjectInfo | null;
  /** The web address the server made, once it says so. */
  address: string | null;
  outcome: { status: 'working' } | { status: 'done' } | { status: 'failed'; error: unknown };
  /** The done screen has been shown: once it is left, it is done with (`useForgetFinished`). */
  seen?: boolean;
}

interface NewProjectState {
  stage: Stage | null;
  /** Where it is made: an empty folder the person picked, `null` for a new one in the clone folder. */
  folder: string | null;
  /** Which send or create is the latest: a slower answer to an earlier one is ignored. */
  turn: number;
}

// One per server: what is being made belongs to the app's connection, not to the screen, so leaving 새 프로젝트 and
// coming back finds it where it was, and a making that ends meanwhile is still told.
const stores = new WeakMap<ServerConnection, StoreApi<NewProjectState>>();

export function useNewProjectStore(): StoreApi<NewProjectState> {
  const server = useServer();
  let store = stores.get(server);
  if (!store) {
    store = createStore<NewProjectState>(() => ({ stage: null, folder: null, turn: 0 }));
    stores.set(server, store);
  }
  return store;
}

/**
 * A finished making is told once: when 새 프로젝트 is left after its done screen was shown, or its project was opened
 * another way (the rail), it is forgotten, so 새 프로젝트 starts empty again rather than showing an old project.
 */
export function useForgetFinished(onNewProject: boolean) {
  const store = useNewProjectStore();
  const lastProject = useNavigation((s) => s.lastProject);
  useEffect(() => {
    if (onNewProject) return;
    const { stage } = store.getState();
    if (stage?.name !== 'creating' || stage.outcome.status !== 'done') return;
    if (stage.seen || (stage.project && stage.project.path === lastProject))
      store.setState((state) => ({ stage: null, folder: null, turn: state.turn + 1 }));
  }, [onNewProject, lastProject, store]);
}
