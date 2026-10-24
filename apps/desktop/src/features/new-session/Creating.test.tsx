import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';

import { Creating } from './Creating';

afterEach(cleanup);

const path = '/Users/someone/Developments/clients/2026/autumn/a-rather-long-folder-name/bakery-orders';

describe('making a project', () => {
  it('keeps each step on one line and cuts a long folder short, with the whole folder on hover', () => {
    render(
      <LocaleProvider locale="ko">
        <Creating
          online={false}
          template="blank"
          steps={['folder']}
          project={{ path, name: 'bakery-orders', branch: null, lastUsedAt: '', archived: false, lastAgent: null }}
          address={null}
          done={false}
          failure={null}
          onOpen={vi.fn()}
          onBack={vi.fn()}
          onRestart={vi.fn()}
        />
      </LocaleProvider>,
    );
    const label = screen.getByText('폴더 만들기');
    expect(label.className).toContain('whitespace-nowrap');
    expect(label.className).toContain('shrink-0');
    const folder = screen.getByText(path).closest('[title]')!;
    expect(folder.getAttribute('title')).toBe(path);
    expect(folder.className).toContain('truncate');
    expect(folder.className).toContain('min-w-0');
  });
});
