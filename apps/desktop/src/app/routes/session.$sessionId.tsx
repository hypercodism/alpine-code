import { createFileRoute, Navigate } from '@tanstack/react-router';

import { useSessions } from '@/shared/server';

/**
 * A conversation's address, from wherever its link came (search, Ctrl+Tab, the agents, a notification): every
 * conversation is talked to beside its project's board, so this only goes there. The map's current one is the board
 * itself; any other opens in the place beside it. One that is gone leaves for 새 프로젝트.
 */
export const Route = createFileRoute('/session/$sessionId')({
  component: SessionRoute,
});

function SessionRoute() {
  const { sessionId } = Route.useParams();
  const sessions = useSessions();
  if (!sessions.data && !sessions.isError) return null;
  const info = sessions.data?.find((session) => session.id === sessionId);
  if (!info) return <Navigate to="/" replace />;
  return (
    <Navigate
      to="/board"
      search={
        info.purpose === 'map' && !info.archived ? { project: info.cwd } : { project: info.cwd, session: sessionId }
      }
      replace
    />
  );
}
