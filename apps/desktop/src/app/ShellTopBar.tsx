import clsx from 'clsx';
import type { ReactNode } from 'react';

import { showApp, showView, useProjectView } from '@/features/app-view/state';
import { MapStatusWord } from '@/features/product-map/MapStatus';
import { MapTopActions } from '@/features/product-map/MapTopActions';
import { useCurrentProject } from '@/features/rail/currentProject';
import { useMessages } from '@/shared/i18n';

import { MoreMenu } from './MoreMenu';
import { ProjectMenu } from './ProjectMenu';
import { shellMessages } from './shellMessages';
import { UpdateButton } from './TopBar';

/**
 * What the map's top bar shows on its right: where the map stands and its one main button. One function, so the map's
 * own `MapTopActions({ cwd })` (state word + 정할 것 / 이대로 만들기 / 멈추기) takes this place in one line.
 */
export function renderMapActions(cwd: string): ReactNode {
  return <MapTopActions cwd={cwd} />;
}

/**
 * The bar over the map (flow-spec, 화면의 뼈대): room for the traffic lights, the project's name ⌄ (the project menu),
 * the tabs 보드 · 문서 · 앱 · 코드 in the middle (앱 once there is an app to look at), and the map's actions on the
 * right. The bar and its empty parts drag the window; the buttons never do.
 */
export function MapTopBar({ cwd, hasApp, end }: { cwd: string; hasApp: boolean; end?: ReactNode }) {
  return (
    <div data-tauri-drag-region className="relative flex h-12 shrink-0 items-center gap-3 pr-6 pl-20">
      <ProjectMenu current={cwd} />
      {/* Where the map stands, beside its name (the main button is on the right). */}
      <MapStatusWord cwd={cwd} />
      <span data-tauri-drag-region className="grow self-stretch" />
      <ViewSwitch cwd={cwd} hasApp={hasApp} />
      <div className="flex shrink-0 items-center gap-3">
        {renderMapActions(cwd)}
        {end}
      </div>
    </div>
  );
}

/** 보드 · 문서 · 앱 · 코드: four ways to look at the same project, on the left of its window. */
function ViewSwitch({ cwd, hasApp }: { cwd: string; hasApp: boolean }) {
  const t = useMessages(shellMessages);
  const shown = useProjectView(cwd);
  // Without an app to look at, its tab is not there; a view left on it shows the board.
  const view = shown === 'app' && !hasApp ? 'map' : shown;
  const item = (on: boolean) =>
    clsx(
      'flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-4 text-body',
      on ? 'bg-canvas-raised font-medium text-fg shadow-overlay' : 'text-fg-muted hover:text-fg',
    );
  const tab = (id: 'map' | 'doc' | 'code') => (
    <button type="button" aria-pressed={view === id} onClick={() => showView(cwd, id)} className={item(view === id)}>
      {t[id]}
    </button>
  );
  return (
    <div
      role="group"
      aria-label={t.viewSwitch}
      className="absolute top-2 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-lg bg-hover p-0.5"
    >
      {tab('map')}
      {tab('doc')}
      {hasApp && (
        <button
          type="button"
          aria-pressed={view === 'app'}
          onClick={() => showApp(cwd)}
          className={item(view === 'app')}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-interactive" />
          {t.app}
        </button>
      )}
      {tab('code')}
    </div>
  );
}

/**
 * The bar over 새 프로젝트, which is in no project: the project menu (to go back to one), and on the right the update
 * button and ⋯. A project being received names itself, and so does one the map could not find (`project`).
 */
export function StartTopBar({ project }: { project?: string }) {
  const current = useCurrentProject();
  return (
    <div data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-3 pr-3.5 pl-20">
      <ProjectMenu current={project ?? current} />
      <span data-tauri-drag-region className="grow self-stretch" />
      <UpdateButton />
      <MoreMenu project={null} />
    </div>
  );
}
