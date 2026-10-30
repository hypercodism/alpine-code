import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { FirstRun } from '@/features/first-run/FirstRun';
import { useForgetFinished } from '@/features/new-session/newProjectStore';
import { NavigationController } from '@/features/rail/NavigationController';
import { useCloneUpdates, useScreenCaptures } from '@/shared/server';

import { DroppedSkillsDialog } from '../DroppedSkills';
import { EngineStopped } from '../EngineStopped';
import { MemorySheet } from '../MemorySheet';
import { SettingsSheet } from '../SettingsSheet';
import { useAppMenu } from '../useAppMenu';
import { useFirstPress } from '../useFirstPress';
import { useFolderOpening } from '../useFolderOpening';
import { useMapNotifications } from '../useMapNotifications';
import { useNewSessionShortcut } from '../useNewSessionShortcut';
import { WaitingElsewhere } from '../WaitingElsewhere';

/**
 * The window: one project's board or 새 프로젝트, each filling it and drawing its own bar (flow-spec, 화면의 뼈대).
 * Settings and a project's memory are sheets over it, so there is no other page to go to and come back from.
 */
export const Route = createRootRoute({
  component: Root,
});

function Root() {
  const [dropped, closeDropped, openFolder] = useFolderOpening();
  useMapNotifications();
  useFirstPress();
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
  useAppMenu({ newSession, openFolder });
  return (
    <div className="flex h-screen flex-col overflow-clip bg-canvas-sunken">
      <EngineStopped />
      <div key={page} className="motion-page flex min-h-0 min-w-0 grow overflow-clip">
        {!waiting && <Outlet />}
      </div>
      {/* Kept in one place whatever the page, so going between them never starts them over (opening the app
          goes back to the last map only once). */}
      <NavigationController onRestored={restored} />
      <WaitingElsewhere />
      <FirstRun auto={onNewSession && !restoring} />
      <DroppedSkillsDialog outcome={dropped} onClose={closeDropped} />
      <SettingsSheet />
      <MemorySheet />
    </div>
  );
}
