import type { ProjectInfo, SessionInfo } from '@alpine/protocol';
import { Menu, Popover } from '@alpine/ui/primitives';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Archive, ChevronDown, Ellipsis, FolderPlus, SquarePen } from 'lucide-react';
import { useState } from 'react';

import { planPhase } from '@/features/product-map/planData';
import { ArchiveDialog } from '@/features/rail/ArchiveDialog';
import { DeleteProjectDialog } from '@/features/rail/DeleteProjectDialog';
import { messages as railMessages } from '@/features/rail/messages';
import { projectState } from '@/features/rail/projectState';
import { ProjectAddDialog } from '@/shared/components/project-add';
import { useMessages } from '@/shared/i18n';
import { useNavigation } from '@/shared/navigation';
import { revealInFinder } from '@/shared/platform';
import { useArchiveProject, useAsking, useProductMap, useProjects, useSessions } from '@/shared/server';

import { shellMessages } from './shellMessages';

/** The one word a project says in the menu (flow-spec, 레일이 하던 일의 새 자리). */
type Word = 'waiting' | 'asking' | 'building' | 'built' | null;

const row =
  'flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-body outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-interactive';

/**
 * The project's name with ⌄, where the rail's work went (flow-spec): the recent projects, each with its one word
 * (질문 대기, 만드는 중, 다 만들었어요, 확인을 기다려요) and its ⋯ (기억, Finder에서 열기, 보관, 삭제…), then 새 프로젝트,
 * 프로젝트 추가… and 보관함. An orange dot by the name says another project waits for me.
 */
export function ProjectMenu({ current }: { current: string | null }) {
  const t = useMessages(shellMessages);
  const r = useMessages(railMessages);
  const navigate = useNavigate();
  const projectsQuery = useProjects();
  const known = projectsQuery.data?.projects ?? [];
  const clones = projectsQuery.data?.clones ?? [];
  const sessions = useSessions().data ?? [];
  const asking = useAsking((state) => state.ids);
  const pinned = useNavigation((state) => state.pinnedProjects);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleting, setDeleting] = useState<ProjectInfo | null>(null);
  const archiveProject = useArchiveProject();
  const listed = known
    .filter((project) => !project.archived)
    .sort(
      (a, b) =>
        Number(pinned.includes(b.path)) - Number(pinned.includes(a.path)) || b.lastUsedAt.localeCompare(a.lastUsedAt),
    );
  const live = (path: string) => sessions.filter((s) => s.cwd === path && !s.archived);
  const needsMe = (path: string) => {
    const state = projectState(live(path), asking);
    return state === 'attention' || state === 'asking';
  };
  const othersWait = listed.some((project) => project.path !== current && needsMe(project.path));
  const shown = known.find((project) => project.path === current) ?? null;
  const clone = clones.find((each) => each.path === current);
  const name = shown?.name ?? clone?.name ?? (current ? current.split('/').pop() : t.newProjectTitle);
  const go = (path: string) => {
    setOpen(false);
    void navigate({ to: '/board', search: { project: path } });
  };
  // Leaving a project that went off the list: the next one's map, or 새 프로젝트 when none is left.
  const leave = (path: string) => {
    if (current !== path) return;
    const next = listed.find((project) => project.path !== path);
    if (next) go(next.path);
    else void navigate({ to: '/' });
  };
  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label={othersWait ? `${name} · ${t.projectMenu} · ${t.othersWait}` : `${name} · ${t.projectMenu}`}
          title={current ?? undefined}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-title font-medium hover:bg-hover data-popup-open:bg-hover"
        >
          <span className="truncate">{name}</span>
          <ChevronDown size={14} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-fg-faint" />
          {othersWait && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-attention" />}
        </Popover.Trigger>
        <Popover.Popup align="start" className="w-80 gap-1 p-1.5">
          <p className="px-2 pt-1 text-meta text-fg-muted">{t.recent}</p>
          <ul aria-label={t.recent} className="flex max-h-90 flex-col gap-0.5 overflow-y-auto">
            {clones
              .filter((each) => each.state === 'receiving')
              .map((each) => (
                <li key={each.id}>
                  <button
                    type="button"
                    className={row}
                    onClick={() => {
                      setOpen(false);
                      void navigate({ to: '/', search: { project: each.path } });
                    }}
                  >
                    <span className="min-w-0 grow truncate">{each.name}</span>
                    <span className="shrink-0 text-meta text-fg-faint">{t.receiving(each.percent)}</span>
                  </button>
                </li>
              ))}
            {listed.map((project) => (
              <ProjectRow
                key={project.path}
                project={project}
                sessions={live(project.path)}
                asking={asking}
                current={project.path === current}
                busy={live(project.path).some((s) => s.status === 'running' || s.status === 'waiting')}
                onGo={() => go(project.path)}
                onMemory={() => {
                  setOpen(false);
                  void navigate({ to: '/memory', search: { project: project.path } });
                }}
                onArchive={() => archiveProject.mutate(project.path, { onSuccess: () => leave(project.path) })}
                onDelete={() => {
                  setOpen(false);
                  setDeleting(project);
                }}
              />
            ))}
            {projectsQuery.isSuccess && listed.length === 0 && (
              <li className="px-2 py-1 text-meta text-fg-muted">{r.noProjects}</li>
            )}
          </ul>
          {archiveProject.error && (
            <p role="alert" className="px-2 text-meta text-danger">
              {archiveProject.error.message}
            </p>
          )}
          <div className="my-1 border-t border-line-subtle" />
          <button
            type="button"
            className={row}
            onClick={() => {
              setOpen(false);
              void navigate({ to: '/' });
            }}
          >
            <SquarePen size={15} strokeWidth={1.6} aria-hidden="true" className="text-fg-muted" />
            <span className="grow">{t.newProject}</span>
            <kbd className="text-meta text-fg-faint">⌘N</kbd>
          </button>
          <button
            type="button"
            className={row}
            onClick={() => {
              setOpen(false);
              setAdding(true);
            }}
          >
            <FolderPlus size={15} strokeWidth={1.6} aria-hidden="true" className="text-fg-muted" />
            {t.addProject}
          </button>
          <button
            type="button"
            className={row}
            onClick={() => {
              setOpen(false);
              setArchiveOpen(true);
            }}
          >
            <Archive size={15} strokeWidth={1.6} aria-hidden="true" className="text-fg-muted" />
            <span className="grow">{t.archive}</span>
            {known.some((project) => project.archived) && (
              <span className="text-meta text-fg-faint tabular-nums">
                {known.filter((project) => project.archived).length}
              </span>
            )}
          </button>
        </Popover.Popup>
      </Popover.Root>
      <ProjectAddDialog
        open={adding}
        onOpenChange={setAdding}
        onDone={(path) => void navigate({ to: '/', search: { project: path } })}
        onNew={() => void navigate({ to: '/' })}
      />
      <ArchiveDialog open={archiveOpen} onOpenChange={setArchiveOpen} onRestored={go} />
      <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} onDeleted={leave} />
    </>
  );
}

function ProjectRow({
  project,
  sessions,
  asking,
  current,
  busy,
  onGo,
  onMemory,
  onArchive,
  onDelete,
}: {
  project: ProjectInfo;
  sessions: SessionInfo[];
  asking: ReadonlySet<string>;
  current: boolean;
  busy: boolean;
  onGo: () => void;
  onMemory: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const t = useMessages(shellMessages);
  const r = useMessages(railMessages);
  const word = useProjectWord(project.path, sessions, asking);
  const words = {
    waiting: t.stateWaiting,
    asking: t.stateAsking,
    building: t.stateBuilding,
    built: t.stateBuilt,
  };
  return (
    <li className={clsx('group flex items-center gap-0.5 rounded-md', current && 'bg-selected')}>
      <button
        type="button"
        aria-current={current ? 'page' : undefined}
        title={project.path}
        onClick={onGo}
        className={clsx(row, 'hover:bg-transparent')}
      >
        <span className={clsx('min-w-0 grow truncate', current && 'font-medium')}>{project.name}</span>
        {word && (
          <span
            className={clsx(
              'flex shrink-0 items-center gap-1.5 text-meta whitespace-nowrap',
              word === 'waiting' || word === 'asking' ? 'text-attention' : 'text-fg-muted',
            )}
          >
            {(word === 'waiting' || word === 'asking') && (
              <span aria-hidden="true" className="size-1.5 rounded-full bg-attention" />
            )}
            {words[word]}
          </span>
        )}
      </button>
      <Menu.Root>
        <Menu.Trigger
          aria-label={t.projectActions(project.name)}
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-interactive"
        >
          <Ellipsis size={16} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Popup align="end">
          <Menu.Item onClick={onMemory}>{r.openMemory}</Menu.Item>
          <Menu.Item onClick={() => void revealInFinder(project.path)}>{r.revealInFinder}</Menu.Item>
          <Menu.Separator />
          <Menu.Item disabled={busy} title={busy ? r.busyArchive : undefined} onClick={onArchive}>
            {r.archive}
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item className="text-danger" disabled={busy} title={busy ? r.busyDelete : undefined} onClick={onDelete}>
            {r.delete}
          </Menu.Item>
        </Menu.Popup>
      </Menu.Root>
    </li>
  );
}

/**
 * A project's word: the AI waiting for my OK (or stopped on a failure) first, then a question, then a build (or any
 * work) going on, then a plan that is all built. Read from the same facts as the rail's row.
 */
function useProjectWord(path: string, sessions: SessionInfo[], asking: ReadonlySet<string>): Word {
  const board = useProductMap(path).data;
  const state = projectState(sessions, asking);
  if (state === 'attention') return 'waiting';
  if (state === 'asking') return 'asking';
  if (state === 'building' || state === 'running') return 'building';
  if (board?.planned && planPhase(board, false, false) === 'built') return 'built';
  return null;
}
