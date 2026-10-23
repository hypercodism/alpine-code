import { defineMessages } from '@/shared/i18n';

export const messages = defineMessages({
  ko: {
    importFrom: (apps: string | null) => `${apps ?? '다른 앱'}에서 하던 대화`,
    importLink: (apps: string | null, count: string) => `${apps ?? '다른 앱'}에서 하던 대화 ${count}개 이어 하기`,
    importApps: (apps: string[]) => apps.join('·'),
    importing: '가져오는 중…',
    importFailed: (message: string) => `대화를 가져오지 못했어요 · ${message}`,
    close: '닫기',
  },
  en: {
    importFrom: (apps: string | null) => `Conversations from ${apps ?? 'other apps'}`,
    importLink: (apps: string | null, count: string) => `Continue ${count} conversations from ${apps ?? 'other apps'}`,
    importApps: (apps: string[]) => apps.join(' and '),
    importing: 'Bringing it over…',
    importFailed: (message: string) => `Couldn't bring the conversation over · ${message}`,
    close: 'Close',
  },
});
