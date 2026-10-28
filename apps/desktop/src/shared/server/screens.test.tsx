import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ServerProvider } from './context';
import { scriptedConnection } from './scripted';
import { useScreenCaptures } from './screens';

describe("the AI's look at a screen (dogfood 9)", () => {
  it('answers every capture request, saying why when there is no Mac window to open it in', async () => {
    const answered = vi.fn(() => ({}));
    let emit: ((notification: { method: string; params: unknown }) => void) | null = null;
    const connection = scriptedConnection({
      results: {
        'screens/captured': answered,
        // A request that hands the test the way the server speaks first.
        'session/list': (_params: unknown, context: { emit: typeof emit }) => {
          emit = context.emit;
          return { sessions: [] };
        },
      },
    });
    await connection.request('session/list', {});
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ServerProvider connection={connection}>{children}</ServerProvider>
      </QueryClientProvider>
    );
    renderHook(() => useScreenCaptures(), { wrapper });
    emit!({
      method: 'screens/capture',
      params: { id: 'c1', url: 'http://127.0.0.1:6100/', width: 390, height: 844 },
    });
    await waitFor(() =>
      expect(answered).toHaveBeenCalledWith(
        { id: 'c1', error: 'The screen can be seen only in the Alpine app.' },
        expect.anything(),
      ),
    );
  });
});
