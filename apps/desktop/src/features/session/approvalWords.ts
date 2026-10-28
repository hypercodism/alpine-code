import { defineMessages } from '@/shared/i18n';

/**
 * The core says why a call asks, and what "항상 허용" would remember, in its own fixed English sentences
 * (`permissions.py`). The card says them in the person's words; a sentence it does not know (a memory guard's own
 * words) stays as it is.
 */
export const approvalWordMessages = defineMessages({
  ko: {
    outside: (paths: string) => `프로젝트 폴더 밖을 건드려요: ${paths}`,
    outsideOnly: '프로젝트 폴더 밖의 파일이에요',
    unresolved: (paths: string) => `실행해 봐야 정해지는 경로를 써요: ${paths}`,
    secrets: (files: string) => `비밀번호 같은 비밀이 있을 수 있는 파일을 읽어요: ${files}`,
    secretFile: (file: string) => `${file}에는 비밀번호 같은 비밀이 있을 수 있어요`,
    redirect: '명령으로 파일에 바로 써요',
    installs: (free: string) =>
      `필요한 부품을 인터넷에서 내려받아요. 수백 MB가 될 수 있어요 · 남은 공간 ${free.replace('unknown', '알 수 없음')}`,
    allowProjectEdits: '이 프로젝트 파일 수정은 모두 허용',
    allowCommands: '이런 명령은 항상 허용',
    allowFolder: '이 폴더는 항상 허용',
    allowFile: '이 파일은 항상 허용',
    allowTool: '항상 허용',
    commandsLike: (rules: string) => `항상 허용하면 다음에 묻지 않아요: ${rules}로 시작하는 명령`,
  },
  en: {
    outside: (paths: string) => `Touches paths outside the project folder: ${paths}`,
    outsideOnly: 'A file outside the project folder',
    unresolved: (paths: string) => `Uses paths known only when it runs: ${paths}`,
    secrets: (files: string) => `Reads files that may hold secrets: ${files}`,
    secretFile: (file: string) => `${file} may hold secrets`,
    redirect: 'Writes files straight from the command',
    installs: (free: string) => `Downloads packages from the internet; this can take hundreds of MB · ${free} free`,
    allowProjectEdits: 'Allow every change to this project’s files',
    allowCommands: 'Always allow commands like this',
    allowFolder: 'Always allow this folder',
    allowFile: 'Always allow this file',
    allowTool: 'Always allow',
    commandsLike: (rules: string) => `Always allowing skips the question next time for commands starting with ${rules}`,
  },
});

type Words = (typeof approvalWordMessages)['ko'];

/** Why a call asks, one sentence per reason the core joined with "; ". */
export function reasonWords(reason: string, t: Words): string {
  return reason
    .split('; ')
    .map((part) => {
      let match: RegExpExecArray | null;
      if ((match = /^touches paths outside the working directory: (.+)$/.exec(part))) return t.outside(match[1]!);
      if (part === 'outside the working directory') return t.outsideOnly;
      if ((match = /^uses paths only known when it runs: (.+)$/.exec(part))) return t.unresolved(match[1]!);
      if ((match = /^reads files that may contain secrets: (.+)$/.exec(part))) return t.secrets(match[1]!);
      if ((match = /^(.+) may contain secrets$/.exec(part))) return t.secretFile(match[1]!);
      if (part === 'writes files through redirection') return t.redirect;
      if ((match = /^installs packages from the internet \(free space: (.+)\)$/.exec(part)))
        return t.installs(match[1]!);
      return part;
    })
    .join(' · ');
}

/** What "항상 허용" says on its button, and the line under it when the button alone does not say what it covers. */
export function rememberWords(remember: string, t: Words): { button: string; detail: string | null } {
  if (remember.startsWith('editing files in ') && !remember.includes('with edit access'))
    return { button: t.allowProjectEdits, detail: null };
  const commands = /^bash commands starting with (.+?)(?:, with edit access to .+)?(?:, reading .+)?$/.exec(remember);
  if (commands) return { button: t.allowCommands, detail: t.commandsLike(commands[1]!) };
  if (/^(reading|editing) files in /.test(remember)) return { button: t.allowFolder, detail: null };
  if (remember.startsWith('reading ')) return { button: t.allowFile, detail: null };
  return { button: t.allowTool, detail: null };
}
