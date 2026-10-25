import type { ToolCallItem } from '@alpine/protocol';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';

import { ToolCalls } from './ToolCalls';

afterEach(cleanup);

const COMMAND = 'cd /private/tmp/bakery && npm install && npm run build';

const call = (id: string, name: string, args: Record<string, unknown>, status: ToolCallItem['status']) =>
  ({
    id,
    kind: 'tool_call',
    name,
    args,
    status,
    result: '',
    images: 0,
    commandResult: null,
    fileChanges: null,
  }) as unknown as ToolCallItem;

describe('a call still running', () => {
  it('shows a plain line while its stretch is closed, with the command one level deeper', () => {
    render(
      <LocaleProvider locale="ko">
        <ToolCalls
          rows={[
            { call: call('r1', 'read', { path: 'src/app.tsx' }, 'done'), approval: null },
            { call: call('b1', 'bash', { command: COMMAND }, 'running'), approval: null },
          ]}
        />
      </LocaleProvider>,
    );
    const line = screen.getByRole('button', { name: /명령 실행 중/ });
    expect(screen.queryByTitle(COMMAND)).toBeNull();
    expect(line.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(line);
    expect(line.getAttribute('aria-expanded')).toBe('true');
    expect(within(line.closest('li')!).getByTitle(COMMAND)).toBeTruthy();
  });
});
