import { describe, expect, it } from 'vitest';

import config from '../../src-tauri/tauri.conf.json';

describe('the window (dogfood 12)', () => {
  it('takes the first click while it is in the back, so 허용 or 보내기 works on one press from another app', () => {
    const main = config.app.windows.find((window) => window.label === 'main');
    expect(main?.acceptFirstMouse).toBe(true);
  });
});
