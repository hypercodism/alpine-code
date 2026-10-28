import clsx from 'clsx';
import { useState } from 'react';

import { FileViewer } from '@/features/file-viewer';
import { GitChangesList, GitDiffView, useProjectDiff } from '@/features/file-viewer/GitChanges';
import { messages } from '@/features/file-viewer/messages';
import { useFileNavigation } from '@/shared/files';
import { useMessages } from '@/shared/i18n';

/**
 * The 코드 tab (2f A): on the left 파일 (the project's folders, as an editor's explorer shows them) or 바뀐 파일 (what
 * `git diff` shows), and on the right the file or the diff picked there. It uses the window's file navigation, so a
 * file opened from the conversation shows here under 파일.
 */
export function ProjectCode({ cwd }: { cwd: string }) {
  const t = useMessages(messages);
  const navigation = useFileNavigation();
  const [mode, setMode] = useState<'files' | 'changes'>('files');
  const [change, setChange] = useState<string | null>(null);
  const changed = useProjectDiff(cwd).data?.files.length ?? 0;
  // A file opened from anywhere (a link in the conversation, the tree) is a file, not a change.
  const opened = navigation?.location ?? null;
  const [seen, setSeen] = useState(opened);
  if (opened !== seen) {
    setSeen(opened);
    if (opened) setMode('files');
  }
  const item = (on: boolean) =>
    clsx(
      'flex h-6 cursor-pointer items-center rounded-md px-3 text-meta whitespace-nowrap',
      on ? 'bg-canvas-raised font-medium text-fg shadow-overlay' : 'text-fg-muted hover:text-fg',
    );
  return (
    <div className="flex min-h-0 min-w-0 grow bg-canvas">
      <div className="flex w-72 shrink-0 flex-col border-r border-line">
        <div role="group" aria-label={t.title} className="m-3 mb-2 flex gap-0.5 self-start rounded-lg bg-hover p-0.5">
          <button
            type="button"
            aria-pressed={mode === 'files'}
            onClick={() => setMode('files')}
            className={item(mode === 'files')}
          >
            {t.files}
          </button>
          <button
            type="button"
            aria-pressed={mode === 'changes'}
            onClick={() => setMode('changes')}
            className={item(mode === 'changes')}
          >
            {changed ? t.changesCount(changed) : t.changes}
          </button>
        </div>
        <div className={clsx('min-h-0 grow flex-col overflow-y-auto px-2 pb-3', mode === 'files' ? 'flex' : 'hidden')}>
          <FileViewer part="browser" />
        </div>
        {mode === 'changes' && (
          <div className="min-h-0 grow overflow-y-auto px-1 pb-3">
            <GitChangesList cwd={cwd} selected={change} onSelect={setChange} />
          </div>
        )}
      </div>
      <div className="flex min-h-0 min-w-0 grow flex-col px-6 py-5">
        {mode === 'files' ? <FileViewer part="file" /> : <GitDiffView cwd={cwd} path={change} />}
      </div>
    </div>
  );
}
