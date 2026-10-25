import { defineMessages } from '@/shared/i18n';

import { towards } from './filmstripModel';

export const filmMessages = defineMessages({
  ko: {
    label: '화면 필름스트립',
    phone: '휴대폰',
    computer: '컴퓨터',
    personCounts: (journeys: number, screens: number) => `흐름 ${journeys}개 · 화면 ${screens}개`,
    journeyPlanned: (screens: number, promises: number) => `화면 ${screens}개 · 약속 ${promises}개`,
    journeyChecked: (screens: number, promises: number, checked: number) =>
      `화면 ${screens}개 · 약속 ${promises}개 중 ${checked}개 확인`,
    more: (n: number) => `화면 ${n}개 더`,
    next: '다음',
    noScreen: '화면 없음',
    throughJourney: '다른 흐름',
    stateSketch: '그림',
    stateMaking: '만드는 중',
    stateReal: '실제 화면',
    justReal: '방금 실제 화면으로',
    toFix: (n: number) => `고칠 곳 ${n}개`,
    checking: '확인 중',
    backTo: (title: string) => `← ${towards(title)}`,
    aiPicked: 'AI가 정함',
    change: '바꾸기',
    open: (title: string) => `${title} 열기`,
    firstScreens: '한 줄을 보고 첫 화면들을 그리는 중이에요',
    openInApp: '앱에서 보기',
  },
  en: {
    label: 'Screen filmstrip',
    phone: 'Phone',
    computer: 'Computer',
    personCounts: (journeys: number, screens: number) =>
      `${journeys} ${journeys === 1 ? 'flow' : 'flows'} · ${screens} ${screens === 1 ? 'screen' : 'screens'}`,
    journeyPlanned: (screens: number, promises: number) =>
      `${screens} ${screens === 1 ? 'screen' : 'screens'} · ${promises} ${promises === 1 ? 'promise' : 'promises'}`,
    journeyChecked: (screens: number, promises: number, checked: number) =>
      `${screens} ${screens === 1 ? 'screen' : 'screens'} · ${checked} of ${promises} promises checked`,
    more: (n: number) => `${n} more ${n === 1 ? 'screen' : 'screens'}`,
    next: 'Next',
    noScreen: 'No screen',
    throughJourney: 'Another flow',
    stateSketch: 'Sketch',
    stateMaking: 'Building',
    stateReal: 'Real screen',
    justReal: 'Just became real',
    toFix: (n: number) => `${n} to fix`,
    checking: 'checking',
    backTo: (title: string) => `← Back to ${title}`,
    aiPicked: 'AI decided',
    change: 'Change',
    open: (title: string) => `Open ${title}`,
    firstScreens: 'Drawing the first screens from your words',
    openInApp: 'See it in the app',
  },
});
