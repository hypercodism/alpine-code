import type { ProjectDiffFile } from '@alpine/protocol';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';

import { useMessages } from '@/shared/i18n';
import { useServer } from '@/shared/server';

import { messages } from './messages';

/** What `git diff HEAD` shows for the project, plus new files git does not track yet; asked again every few seconds. */
export function useProjectDiff(cwd: string, enabled = true) {
  const server = useServer();
  return useQuery({
    queryKey: ['project-diff', cwd],
    queryFn: () => server.request('projects/diff', { path: cwd }),
    enabled: enabled && !!cwd,
    refetchInterval: 4000,
    retry: false,
  });
}

/** The changed files as `git status` would list them, each with its added and deleted line counts. */
export function GitChangesList({
  cwd,
  selected,
  onSelect,
}: {
  cwd: string;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useMessages(messages);
  const diff = useProjectDiff(cwd);
  if (diff.isPending) return <p className="px-3 py-2 text-meta text-fg-muted">{t.folderLoading}</p>;
  if (diff.error) return <p className="px-3 py-2 text-meta text-danger">{diff.error.message}</p>;
  if (!diff.data.git) return <p className="px-3 py-2 text-meta text-fg-muted">{t.noGit}</p>;
  if (!diff.data.files.length) return <p className="px-3 py-2 text-meta text-fg-muted">{t.noChanges}</p>;
  return (
    <ul aria-label={t.changes} className="flex flex-col py-1">
      {diff.data.files.map((file) => (
        <li key={file.path}>
          <button
            type="button"
            aria-pressed={selected === file.path}
            title={file.path}
            onClick={() => onSelect(file.path)}
            className={clsx(
              'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-meta',
              selected === file.path ? 'bg-selected text-fg' : 'text-fg hover:bg-hover',
            )}
          >
            <span
              aria-hidden="true"
              className={clsx('w-3 shrink-0 text-center font-semibold', STATUS_COLOR[file.status])}
            >
              {STATUS_LETTER[file.status]}
            </span>
            <span className="min-w-0 grow truncate">{file.path}</span>
            <span className="shrink-0 tabular-nums">
              {file.added > 0 && <span className="text-avatar-1-ink">+{file.added}</span>}
              {file.deleted > 0 && <span className="ml-1 text-danger">−{file.deleted}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One file's part of `git diff`, coloured the way a terminal shows it. */
export function GitDiffView({ cwd, path }: { cwd: string; path: string | null }) {
  const t = useMessages(messages);
  const diff = useProjectDiff(cwd);
  const file: ProjectDiffFile | undefined = diff.data?.files.find((each) => each.path === path);
  if (!file) return <p className="text-body text-fg-muted">{t.pickChange}</p>;
  return (
    <section aria-label={file.path} className="flex min-h-0 grow flex-col gap-2">
      <p className="flex shrink-0 items-center gap-2 border-b border-line-subtle pb-2">
        <span className="min-w-0 truncate font-mono text-body font-medium">{file.path}</span>
        <span className="shrink-0 text-meta text-fg-muted">{t.status(file.status)}</span>
      </p>
      {file.binary ? (
        <p className="text-body text-fg-muted">{t.binaryChange}</p>
      ) : !file.patch ? (
        <p className="text-body text-fg-muted">{t.tooBig}</p>
      ) : (
        <pre className="min-h-0 grow overflow-auto rounded-md border border-line-subtle bg-canvas py-1 font-mono text-meta">
          {file.patch.split('\n').map((line, index) => (
            <div key={index} className={clsx('min-w-fit px-3', lineStyle(line))}>
              {line || ' '}
            </div>
          ))}
        </pre>
      )}
    </section>
  );
}

const STATUS_LETTER: Record<ProjectDiffFile['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
};

const STATUS_COLOR: Record<ProjectDiffFile['status'], string> = {
  modified: 'text-attention',
  added: 'text-avatar-1-ink',
  deleted: 'text-danger',
  renamed: 'text-interactive',
  untracked: 'text-avatar-1-ink',
};

function lineStyle(line: string): string {
  if (/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/.test(line))
    return 'font-semibold text-fg-muted';
  if (line.startsWith('@@')) return 'text-interactive';
  if (line.startsWith('+')) return 'bg-diff-added text-fg';
  if (line.startsWith('-')) return 'bg-diff-removed text-fg';
  return 'text-fg';
}
