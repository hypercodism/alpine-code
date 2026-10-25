import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

import { inTauri, onPathsDropped, useOpenFolder } from '@/shared/platform';
import { ServerError, useOpenProject } from '@/shared/server';

import { useSkillDrop, type DropOutcome } from './DroppedSkills';

/**
 * ⌘O anywhere opens Finder (through the menu bar in the app, a key listener in a plain browser); a folder dropped on
 * the window becomes a project, and a skill dropped on it (a `.zip`, a `.skill` or a folder with a SKILL.md) is added;
 * any other file is not taken, and the drop says so. Returns what the drop came to, for `DroppedSkillsDialog`, and the
 * Finder opener for the menu bar.
 */
export function useFolderOpening(): [DropOutcome | null, () => void, () => void] {
  const navigate = useNavigate();
  const show = useCallback((path: string) => void navigate({ to: '/', search: { project: path } }), [navigate]);
  const openFolder = useOpenFolder(show);
  const { mutateAsync: openProject } = useOpenProject();
  const [dropped, setDropped] = useState<DropOutcome | null>(null);
  // A dropped file that is not a skill is refused by the server (not a folder): the drop says so. Any other failure
  // is not about what was dropped, and is passed on.
  const openAsProject = useCallback(
    (path: string) =>
      openProject(path).then(
        ({ project }) => {
          show(project.path);
          return true;
        },
        (reason: unknown) => {
          if (reason instanceof ServerError && reason.data?.reason === 'not_a_folder') return false;
          throw reason;
        },
      ),
    [openProject, show],
  );
  const takeSkills = useSkillDrop(openAsProject);

  useEffect(() => {
    if (inTauri()) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openFolder();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openFolder]);

  useEffect(() => onPathsDropped((paths) => void takeSkills(paths).then(setDropped)), [takeSkills]);
  return [dropped, () => setDropped(null), () => void openFolder()];
}
