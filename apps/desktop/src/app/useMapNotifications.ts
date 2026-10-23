import { useEffect, useRef } from 'react';

import { useMessages } from '@/shared/i18n';
import { notify } from '@/shared/platform';
import { useProjects, useSessions } from '@/shared/server';

import { messages } from './messages';

/**
 * No one needs to watch the map while the AI works on it (map-first decision 18): when a project's map conversation
 * or a build of its plan finishes its work while the window is in the background, the system says so.
 */
export function useMapNotifications() {
  const t = useMessages(messages);
  const sessions = useSessions().data;
  const projects = useProjects().data?.projects;
  const working = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set<string>();
    for (const session of sessions ?? []) {
      if (!session.purpose) continue; // the map conversation, or a build of its plan
      if (session.status === 'running' || session.status === 'waiting') now.add(session.id);
      else if (working.current.has(session.id) && !document.hasFocus()) {
        const project = projects?.find((p) => p.path === session.cwd)?.name ?? session.cwd.split('/').pop() ?? '';
        void notify(project, t.mapWorkDone);
      }
    }
    working.current = now;
  }, [sessions, projects, t.mapWorkDone]);
}
