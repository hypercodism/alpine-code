import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';

import { inTauri } from '@/shared/platform';

/**
 * Opens 새 프로젝트, the one place a new product starts (map-first 39). ⌘N reaches it through the menu bar in the
 * app, and through this key listener in a plain browser.
 */
export function useNewSessionShortcut(): () => void {
  const navigate = useNavigate();
  const newSession = useCallback(() => void navigate({ to: '/' }), [navigate]);
  useEffect(() => {
    if (inTauri()) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        newSession();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [newSession]);
  return newSession;
}
