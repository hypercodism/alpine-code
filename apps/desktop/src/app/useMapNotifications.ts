import type { SessionInfo } from '@alpine/protocol';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { useMessages } from '@/shared/i18n';
import { notify, setBadge } from '@/shared/platform';
import { useAsking, useProjects, useSessions, waitsForMe } from '@/shared/server';

import { messages } from './messages';

const atWork = (status: SessionInfo['status'] | undefined) => status === 'running' || status === 'waiting';

/** How a session stands for telling me: waiting for my OK (its own call or its TF's agents'), else its status. */
const standing = (info: SessionInfo): SessionInfo['status'] => (waitsForMe(info) ? 'waiting' : info.status);

/**
 * No one needs to watch the map while the AI works on it (map-first decision 18): the system says when a project's
 * map conversation or a build of its plan needs me or is over. Waiting for my yes, or for my answer to a question it
 * asked, is said whenever that map is not in front (the window in the back, or another screen); finishing or
 * stopping, while the window is in the back. When the window was in the back and the map asked for me, the app
 * coming forward after that (a click on the notification brings it) opens that map; told while I work in the window,
 * nothing moves me.
 */
export function useMapNotifications() {
  const t = useMessages(messages);
  const sessions = useSessions().data;
  const projects = useProjects().data?.projects;
  const asking = useAsking((state) => state.ids);
  const navigate = useNavigate();
  const onMap = useRouterState({
    select: (state) => (state.location.pathname === '/board' ? (state.location.search.project ?? null) : null),
  });
  const before = useRef<Map<string, SessionInfo['status']>>(new Map());
  const told = useRef<string | null>(null);

  useEffect(() => {
    const now = new Map<string, SessionInfo['status']>();
    for (const session of sessions ?? []) {
      if (!session.purpose || session.archived) continue; // the map conversation, or a build of its plan
      const status = standing(session);
      now.set(session.id, status);
      const was = before.current.get(session.id);
      if (was === undefined || was === status) continue;
      const away = !document.hasFocus();
      const hidden = away || onMap !== session.cwd;
      const ended = atWork(was) && !atWork(status);
      // Waiting for my yes, or for my answer to a question it asked.
      const needsMe = status === 'waiting' ? t.mapNeedsYes : ended && asking.has(session.id) && t.mapAsks;
      const body = needsMe ? hidden && needsMe : ended && away && (status === 'failed' ? t.mapStopped : t.mapWorkDone);
      if (!body) continue;
      const project = projects?.find((p) => p.path === session.cwd)?.name ?? session.cwd.split('/').pop() ?? '';
      if (needsMe && away) told.current = session.cwd;
      void notify(project, body);
    }
    before.current = now;
    // The Dock says how many conversations wait for my OK, so it is seen from any other app.
    void setBadge((sessions ?? []).filter((session) => !session.archived && waitsForMe(session)).length);
  }, [sessions, projects, asking, onMap, t]);

  // Seen once I am on that map; until then, the app coming forward goes there.
  useEffect(() => {
    if (onMap !== null && onMap === told.current) told.current = null;
  }, [onMap]);
  useEffect(() => {
    const onFocus = () => {
      const project = told.current;
      if (!project) return;
      told.current = null;
      void navigate({ to: '/board', search: { project } });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [navigate]);
}
