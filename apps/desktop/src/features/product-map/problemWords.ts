import type { MapProblem } from '@alpine/protocol';

import { defineMessages } from '@/shared/i18n';

/**
 * The server says what is wrong with a map file in fixed English sentences (`map_files.py`); the map says them in the
 * person's words, one line per file (a file with several problems is one file), and keeps the English as 기술 정보.
 */
export const problemWordMessages = defineMessages({
  ko: {
    notJson: 'JSON 형식이 맞지 않아요',
    missingCard: (id: string) => `없는 카드 '${id}'를 가리켜요`,
    missingFlow: (id: string) => `없는 흐름 '${id}'를 불러요`,
    callsItself: '흐름이 자기 자신을 불러요',
    edgeOutside: '흐름 밖의 화면을 잇는 화살표가 있어요',
    fileName: '파일 이름이 카드나 흐름의 id와 달라요',
    badCheck: '약속에 없는 확인 기록이 있거나 같은 약속을 두 번 확인했어요',
    duplicateCondition: '같은 id의 약속이 두 개예요',
    duplicateState: '같은 id의 상황이 두 개예요',
    unknownState: '없는 상황을 가리키는 약속이 있어요',
    required: (field: string) => `꼭 있어야 하는 '${field}'가 없어요`,
    invalidField: (field: string) => `'${field}' 값이 맞지 않아요`,
    unknown: '읽을 수 없는 내용이 있어요',
    partial: '틀린 부분만 빼고 보여 주고 있어요',
  },
  en: {
    notJson: 'It is not valid JSON',
    missingCard: (id: string) => `Points at a card '${id}' that does not exist`,
    missingFlow: (id: string) => `Calls a flow '${id}' that does not exist`,
    callsItself: 'The flow calls itself',
    edgeOutside: 'An arrow joins a screen outside this flow',
    fileName: 'The file name differs from the card or flow id',
    badCheck: 'A check points at no promise of the card, or one promise is checked twice',
    duplicateCondition: 'Two promises share an id',
    duplicateState: 'Two situations share an id',
    unknownState: 'A promise points at a situation the card does not have',
    required: (field: string) => `'${field}' is required`,
    invalidField: (field: string) => `'${field}' is not valid`,
    unknown: 'Something in it cannot be read',
    partial: 'Shown without the parts that are wrong',
  },
});

type Words = (typeof problemWordMessages)['ko'];

/** One problem's sentence in the person's words. */
export function problemWords(message: string, t: Words): string {
  const parts = message.split('; ');
  return [
    ...new Set(
      parts.map((part) => {
        let match: RegExpExecArray | null;
        if ((match = /^The card '(.+)' does not exist$/.exec(part))) return t.missingCard(match[1]!);
        if ((match = /^The flow '(.+)' does not exist$/.exec(part))) return t.missingFlow(match[1]!);
        if (part === 'A flow cannot call itself') return t.callsItself;
        if (/points outside this flow$/.test(part)) return t.edgeOutside;
        if (/^The file name must be the (card|flow) id/.test(part)) return t.fileName;
        if (/Unknown or duplicate condition check/.test(part)) return t.badCheck;
        if (/Duplicate condition id/.test(part)) return t.duplicateCondition;
        if (/Duplicate state id/.test(part)) return t.duplicateState;
        if (/A condition names a state/.test(part)) return t.unknownState;
        if ((match = /^([\w.]+): Field required$/.exec(part))) return t.required(match[1]!);
        if ((match = /^([\w.]+): /.exec(part))) return t.invalidField(match[1]!);
        if (/JSON|Expecting|line \d+ column \d+/.test(part)) return t.notJson;
        return t.unknown;
      }),
    ),
  ].join(' · ');
}

/** The map's problems one per file, the files that could not be read at all first. */
export function problemFiles(
  problems: readonly MapProblem[],
): { file: string; partial: boolean; messages: string[] }[] {
  const byFile = new Map<string, { file: string; partial: boolean; messages: string[] }>();
  for (const problem of problems) {
    const entry = byFile.get(problem.file) ?? { file: problem.file, partial: true, messages: [] };
    entry.partial &&= !!problem.partial;
    entry.messages.push(problem.message);
    byFile.set(problem.file, entry);
  }
  return [...byFile.values()].sort((a, b) => Number(a.partial) - Number(b.partial));
}
