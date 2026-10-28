import { defineMessages } from '@/shared/i18n';

/** Closing the window quits the app; while the AI works, it asks first. */
export const quitMessages = defineMessages({
  ko: {
    title: 'AI가 일하는 중이에요',
    body: '앱을 끄면 하던 일이 멈춰요. 다시 열면 보드에서 이어서 할 수 있어요.',
    quitAnyway: '멈추고 끄기',
    keepWorking: '계속 일하게 두기',
  },
  en: {
    title: 'The AI is working',
    body: 'Quitting stops its work. When you open the app again, you can go on from the map.',
    quitAnyway: 'Stop and quit',
    keepWorking: 'Keep it working',
  },
});
