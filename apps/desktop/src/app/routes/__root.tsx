import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { FirstRun } from '@/features/first-run/FirstRun';
import { useForgetFinished } from '@/features/new-session/newProjectStore';
import { Rail } from '@/features/rail/Rail';
import { NavigationController } from '@/features/rail/NavigationController';
import { useCloneUpdates, useScreenCaptures } from '@/shared/server';

import { DroppedSkillsDialog } from '../DroppedSkills';
import { EngineStopped } from '../EngineStopped';
import { TopBar } from '../TopBar';
import { useAppMenu } from '../useAppMenu';
import { useFirstPress } from '../useFirstPress';
import { useFolderOpening } from '../useFolderOpening';
import { useMapNotifications } from '../useMapNotifications';
import { useNewSessionShortcut } from '../useNewSessionShortcut';
import { WaitingElsewhere } from '../WaitingElsewhere';

const RAIL_KEY = 'alpine.rail.open';

/** Whether the rail shows, remembered across restarts. */
function useRailOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const toggle = useCallback(() => {
    setOpen((value) => {
      try {
        localStorage.setItem(RAIL_KEY, String(!value));
      } catch {
        // Not remembered, but it still hides and shows.
      }
      return !value;
    });
  }, []);
  return [open, toggle];
}

/**
 * The window. On the map and 새 프로젝트, the page fills it and draws its own bar (no rail). Elsewhere (a conversation,
 * settings, agents, the memory): a top bar across the top, and under it the rail (where) beside a floating card
 * holding the rest: the centre (what happened) and, for a session, the right dock on its right.
 */
export const Route = createRootRoute({
  component: Root,
});

function Root() {
  const [dropped, closeDropped, openFolder] = useFolderOpening();
  useMapNotifications();
  useFirstPress();
  const [railOpen, toggleRail] = useRailOpen();
  const page = useRouterState({ select: (state) => state.location.pathname + (state.location.search.project ?? '') });
  const onNewSession = useRouterState({ select: (state) => state.location.pathname === '/' });
  // Opening the app on 새 프로젝트 may be on the way to the last project's map: until that is settled nothing is
  // drawn there, so neither 새 프로젝트 nor the connect window flashes up first.
  const [restoring, setRestoring] = useState(true);
  const restored = useCallback(() => setRestoring(false), []);
  // What is drawn, not where the address already is: on the way out, 새 프로젝트 is still what would be drawn.
  const drawingNewSession = useRouterState({ select: (state) => state.matches.at(-1)?.routeId === '/' });
  const waiting = restoring && drawingNewSession;
  useCloneUpdates();
  useScreenCaptures();
  useForgetFinished(onNewSession);
  const newSession = useNewSessionShortcut();
  useAppMenu(railOpen, { newSession, openFolder, toggleRail });
  // The map and 새 프로젝트 have no rail: the project's name ⌄ and ⋯ do its work, and the page draws its own bar
  // (flow-spec, 화면의 뼈대).
  const framed = useRouterState({
    select: (state) => {
      const id = state.matches.at(-1)?.routeId;
      return id === '/board' || id === '/';
    },
  });
  const content = (
    <div key={page} className="motion-page flex min-h-0 min-w-0 grow overflow-clip">
      {!waiting && <Outlet />}
    </div>
  );
  return (
    <div className="flex h-screen flex-col overflow-clip bg-canvas-sunken">
      {!framed && <TopBar railOpen={railOpen} onToggleRail={toggleRail} />}
      <EngineStopped />
      {framed ? (
        content
      ) : (
        <div className="flex min-h-0 grow">
          <Rail open={railOpen} />
          <div className="mr-2 mb-2 flex min-w-0 grow overflow-clip rounded-xl border border-line bg-canvas">
            {content}
          </div>
        </div>
      )}
      {/* Kept in one place whatever the page, so going between them never starts them over (opening the app
          goes back to the last map only once). */}
      <NavigationController onRestored={restored} />
      <WaitingElsewhere />
      <FirstRun auto={onNewSession && !restoring} />
      <DroppedSkillsDialog outcome={dropped} onClose={closeDropped} />
    </div>
  );
}
