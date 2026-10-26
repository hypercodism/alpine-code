import { describe, expect, it } from 'vitest';

import { approvalWordMessages, reasonWords, rememberWords } from './approvalWords';

const t = approvalWordMessages.ko;

describe('an approval card in the person’s words (dogfood 5, 22, 26)', () => {
  it('says why a call asks in Korean, every reason the core joined', () => {
    expect(
      reasonWords('touches paths outside the working directory: ~/Developments/x; writes files through redirection', t),
    ).toBe('프로젝트 폴더 밖을 건드려요: ~/Developments/x · 명령으로 파일에 바로 써요');
    expect(reasonWords('installs packages from the internet (free space: 1.7 GB)', t)).toBe(
      '필요한 부품을 인터넷에서 내려받아요. 수백 MB가 될 수 있어요 · 남은 공간 1.7 GB',
    );
    expect(reasonWords('.env may contain secrets', t)).toBe('.env에는 비밀번호 같은 비밀이 있을 수 있어요');
    // A memory guard's own words stay as they are.
    expect(reasonWords('배포는 꼭 물어봐 주세요', t)).toBe('배포는 꼭 물어봐 주세요');
  });

  it('names what 항상 허용 covers on its button', () => {
    expect(rememberWords('editing files in ~/AlpineCode/basecamp', t)).toEqual({
      button: '이 프로젝트 파일 수정은 모두 허용',
      detail: null,
    });
    expect(rememberWords('bash commands starting with `npm run dev`, `git log`', t)).toEqual({
      button: '이런 명령은 항상 허용',
      detail: '항상 허용하면 다음에 묻지 않아요: `npm run dev`, `git log`로 시작하는 명령',
    });
    expect(rememberWords('reading files in ~/Downloads', t).button).toBe('이 폴더는 항상 허용');
  });
});
