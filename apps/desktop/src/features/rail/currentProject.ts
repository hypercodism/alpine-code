import { useMatch, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useNavigation } from '@/shared/navigation';
import { useProjects } from '@/shared/server';

/**
 * The project the window is in: the one in the address (`?project=` on the board and on a project being received),
 * else the one shown last, else the most recently used one. A clone on its way counts as a project. `null` when there
 * is none, and on 새 프로젝트, which is in no project: what is made there goes to a new folder.
 */
export function useCurrentProject(): string | null {
  const remembered = useNavigation((s) => s.lastProject);
  const remember = useNavigation((s) => s.rememberProject);
  const projects = useProjects().data;
  const start = useMatch({ from: '/', shouldThrow: false });
  const addressed = useSearch({ strict: false, select: (search: { project?: string }) => search.project });
  const known = new Set([
    ...(projects?.projects.filter((p) => !p.archived).map((p) => p.path) ?? []),
    ...(projects?.clones.map((c) => c.path) ?? []),
  ]);
  const routed = addressed && known.has(addressed) ? addressed : null;

  useEffect(() => {
    if (routed && routed !== remembered) remember(routed);
  }, [routed, remembered, remember]);

  if (routed) return routed;
  if (start) return null;
  if (remembered && known.has(remembered)) return remembered;
  return projects?.projects.find((p) => !p.archived)?.path ?? null;
}
