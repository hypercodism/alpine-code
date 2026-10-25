import { useNavigate } from '@tanstack/react-router';
import { Database, Diff, Folder, Globe, LayoutList, ListChecks, SquareTerminal } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { DataPanel } from '@/features/data/DataPanel';
import { DevelopmentServers } from '@/features/development-servers';
import { DockLayout, type DockTab } from '@/features/dock/Dock';
import { showDockTab, useDockOpen } from '@/features/dock/state';
import { MiniMap } from '@/features/product-map/MiniMap';
import { Restore } from '@/features/publish/Restore';
import { FileViewer } from '@/features/file-viewer';
import { ProcessControl } from '@/features/process-control';
import { Terminal } from '@/features/terminal';
import { UpgradeSheet } from '@/shared/components/cloud';
import { FileNavigationProvider } from '@/shared/files';
import { useMessages } from '@/shared/i18n';
import { useCloudEnabled, useDataSources } from '@/shared/server';

import { messages } from './messages';

/** The dock tab ids pages and features ask for with `showDockTab`. */
export const SUMMARY_TAB = 'summary';
export const CHANGES_TAB = 'work-result';

/**
 * App-level composition keeps file links and the running project's tools on the same workspace. The dock is one row
 * of tabs: 요약 (what the page hands in; 대화 on the map), then 터미널, 바뀐 파일, 앱 미리보기, 파일, and under ⋮ the
 * rarer places (데이터, AI가 실행한 명령). The places used most show their names; the others are icons. Away from the
 * map, the project's map stays small above them.
 */
export function WorkspaceDock({
  cwd,
  sessionId,
  scope,
  summary,
  summaryLabel,
  changes,
  showMap = true,
  onAskFix,
  children,
}: {
  cwd: string;
  sessionId?: string;
  scope: string;
  /** What 요약 shows on this page. */
  summary: ReactNode;
  /** The first tab's name where it is not a summary (on the map it is the map's conversation: 대화). */
  summaryLabel?: string;
  /** The 변경 사항 tab (the work result), which stays mounted. */
  changes: DockTab;
  /** False on the map itself, where a small copy of it would only repeat the page. */
  showMap?: boolean;
  /** Where the 미리보기 sends what went wrong when the app would not open, for the AI to fix (the map's page). */
  onAskFix?: (text: string) => void;
  children: ReactNode;
}) {
  const t = useMessages(messages);
  const navigate = useNavigate();
  const [dockOpen] = useDockOpen();
  const [terminal, changed, source, ...rare] = useProjectTools({ cwd, sessionId, changes, enabled: dockOpen });
  return (
    <FileNavigationProvider
      key={cwd}
      cwd={cwd}
      onOpen={() => showDockTab('source')}
      onReturnToChanges={() => showDockTab(CHANGES_TAB)}
    >
      <DockLayout
        scope={scope}
        top={
          showMap ? (
            <MiniMap cwd={cwd} onOpen={() => void navigate({ to: '/board', search: { project: cwd } })} />
          ) : undefined
        }
        tabs={[
          {
            id: SUMMARY_TAB,
            label: summaryLabel ?? t.summary,
            icon: LayoutList,
            named: true,
            divider: true,
            bare: true,
            content: summary,
          },
          terminal!,
          changed!,
          {
            id: 'servers',
            label: t.preview,
            icon: Globe,
            named: true,
            bare: true,
            content: <DevelopmentServers key={cwd} cwd={cwd} sessionId={sessionId} onAskFix={onAskFix} />,
          },
          { ...source!, named: true },
          ...rare.map((tool) => ({ ...tool, more: true })),
        ]}
      >
        {children}
      </DockLayout>
    </FileNavigationProvider>
  );
}

/**
 * A project's developer tools, in the dock's order: 터미널, 바뀐 파일 (the work result), 파일, then the rarer 데이터 (only
 * with Alpine Cloud and a data source) and AI가 실행한 명령. The session page shows them as dock tabs; the map opens
 * them one at a time in the conversation's place. `enabled` asks for the data sources only while they can be shown.
 */
export function useProjectTools({
  cwd,
  sessionId,
  changes,
  enabled = true,
}: {
  cwd: string;
  sessionId?: string;
  changes: DockTab;
  enabled?: boolean;
}): DockTab[] {
  const t = useMessages(messages);
  const client = useQueryClient();
  // The 데이터 place is Alpine Cloud's: without it the place is not there and the sources are not even asked for.
  const cloud = useCloudEnabled();
  const hasData = useDataSources(cwd, enabled && cloud).data?.sources.some((source) => source.available) ?? false;
  return [
    {
      id: 'terminal',
      label: t.terminal,
      icon: SquareTerminal,
      bare: true,
      content: (
        <Terminal key={cwd} cwd={cwd} sessionId={sessionId} onOpenDevelopmentServer={() => showDockTab('servers')} />
      ),
    },
    { ...changes, icon: Diff },
    { id: 'source', label: t.source, icon: Folder, content: <FileViewer /> },
    ...(hasData
      ? [{ id: 'data', label: t.data, icon: Database, bare: true, content: <DataPlace key={cwd} cwd={cwd} /> }]
      : []),
    {
      id: 'processes',
      label: t.processes,
      icon: ListChecks,
      bare: true,
      content: (
        <ProcessControl
          key={`${cwd}:${sessionId ?? ''}`}
          cwd={cwd}
          sessionId={sessionId}
          onInspectProcess={(processId) => {
            client.setQueryData(['terminal-selection', cwd], processId);
            showDockTab('terminal');
          }}
        />
      ),
    },
  ];
}

/**
 * The 데이터 place: the data, and from the live data its restore points (the same view as in the 올리기 sheet), so the
 * points its read-only note promises are one press away; Pro's longer window opens the plans.
 */
function DataPlace({ cwd }: { cwd: string }) {
  const t = useMessages(messages);
  const [view, setView] = useState<'data' | 'restore' | 'upgrade'>('data');
  if (view === 'data') return <DataPanel cwd={cwd} onRestorePoints={() => setView('restore')} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      {view === 'restore' ? (
        <Restore
          cwd={cwd}
          back={t.data}
          onBack={() => setView('data')}
          onClose={() => setView('data')}
          onUpgrade={() => setView('upgrade')}
        />
      ) : (
        <UpgradeSheet onBack={() => setView('restore')} onDone={() => setView('restore')} />
      )}
    </div>
  );
}
