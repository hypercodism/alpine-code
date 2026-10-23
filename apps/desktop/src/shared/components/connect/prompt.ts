import { create } from 'zustand';

import { useConnections } from '@/shared/server';

interface ConnectPrompt {
  /** 'Later' was chosen; the first-run sheet stays closed until someone asks again. */
  dismissed: boolean;
  /**
   * Something asked for a model with nothing connected (sending, the 모델 연결 chip): the sheet opens on whatever
   * screen that was, not only on 새 프로젝트, until a model is connected or 'Later' is chosen.
   */
  asked: boolean;
  dismiss: () => void;
  /** Opens the sheet again, here, as sending with nothing connected does. */
  ask: () => void;
  /** A model is connected: nothing asks any more. */
  answered: () => void;
}

export const useConnectPrompt = create<ConnectPrompt>((set) => ({
  dismissed: false,
  asked: false,
  dismiss: () => set({ dismissed: true, asked: false }),
  ask: () => set({ dismissed: false, asked: true }),
  answered: () => set({ asked: false }),
}));

/**
 * Nothing connected and no default model, so whatever asks for a model opens the connect sheet instead. Only when the
 * list says so: a list that could not be read leaves it to the server, whose answer says why.
 */
export function useNoModel() {
  const data = useConnections().data;
  return !!data && data.connections.length === 0 && data.defaultModel === null;
}
