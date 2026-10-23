import { useMatch, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useNavigation } from '@/shared/navigation';
import { useProjects, useSessions } from '@/shared/server';

/**
 * The project the window is in, whose sessions and pages the rail shows: the open session's, else the one in the
 * address (`?project=` on a project being received, the map and the memory), else the one shown last, else the most
 * recently used one. A clone on its way counts as a project. `null` when there is none, and on 새 프로젝트, which is in
 * no project: what is made there goes to a new folder.
 */
export function useCurrentProject(): string | null {
  const remembered = useNavigation((s) => s.lastProject);
  const remember = useNavigation((s) => s.rememberProject);
  const projects = useProjects().data;
  const sessions = useSessions().data;
  const session = useMatch({ from: '/session/$sessionId', shouldThrow: false });
  const start = useMatch({ from: '/', shouldThrow: false });
  const addressed = useSearch({ strict: false, select: (search: { project?: string }) => search.project });
  const known = new Set([
    ...(projects?.projects.filter((p) => !p.archived).map((p) => p.path) ?? []),
    ...(projects?.clones.map((c) => c.path) ?? []),
  ]);
  const fromRoute = session ? sessions?.find((s) => s.id === session.params.sessionId)?.cwd : addressed;
  const routed = fromRoute && known.has(fromRoute) ? fromRoute : null;

  useEffect(() => {
    if (routed && routed !== remembered) remember(routed);
  }, [routed, remembered, remember]);

  if (routed) return routed;
  if (start) return null;
  if (remembered && known.has(remembered)) return remembered;
  return projects?.projects.find((p) => !p.archived)?.path ?? null;
}
