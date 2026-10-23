import { create } from 'zustand';

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
