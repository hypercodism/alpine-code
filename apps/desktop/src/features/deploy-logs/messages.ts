import { defineMessages } from '@/shared/i18n';

export const messages = defineMessages({
  ko: {
    title: '로그',
    notPublished: '아직 인터넷에 올리지 않았어요',
    published: '올린 앱의 로그는 아직 볼 수 없어요',
    what: '올리면 사람들이 앱을 쓰다가 난 오류가 여기 보여요.',
    whatPublished: '사람들이 앱을 쓰다가 난 오류를 모으는 곳이 아직 연결되지 않았어요.',
    publish: '인터넷에 올리기',
    elsewhereBefore: '만드는 중의 출력은 ',
    commands: '명령',
    elsewhereMiddle: '에, 내가 친 명령은 ',
    terminal: '터미널',
    elsewhereAfter: '에 있어요.',
  },
  en: {
    title: 'Logs',
    notPublished: 'Not on the internet yet',
    published: 'Logs of the published app are not available yet',
    what: 'Once it is published, errors people hit while using the app show here.',
    whatPublished: 'Nothing collects the errors people hit while using the app yet.',
    publish: 'Publish to the internet',
    elsewhereBefore: 'Output while building is in ',
    commands: 'Commands',
    elsewhereMiddle: '; commands I typed are in ',
    terminal: 'Terminal',
    elsewhereAfter: '.',
  },
});
