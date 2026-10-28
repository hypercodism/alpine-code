import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';

import { DeployLogs } from './DeployLogs';

afterEach(cleanup);

it('says what will show once the app is on the internet, and offers to put it there', () => {
  const publish = vi.fn();
  const commands = vi.fn();
  render(
    <LocaleProvider locale="ko">
      <DeployLogs published={false} onPublish={publish} onShowCommands={commands} onShowTerminal={vi.fn()} />
    </LocaleProvider>,
  );
  expect(screen.getByRole('heading', { name: '아직 인터넷에 올리지 않았어요' })).toBeTruthy();
  expect(screen.getByText('올리면 사람들이 앱을 쓰다가 난 오류가 여기 보여요.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '인터넷에 올리기' }));
  expect(publish).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: '명령' }));
  expect(commands).toHaveBeenCalledOnce();
});

it('has no 올리기 where Alpine Cloud cannot publish the project', () => {
  render(
    <LocaleProvider locale="ko">
      <DeployLogs published={false} onShowCommands={vi.fn()} onShowTerminal={vi.fn()} />
    </LocaleProvider>,
  );
  expect(screen.queryByRole('button', { name: '인터넷에 올리기' })).toBeNull();
});
