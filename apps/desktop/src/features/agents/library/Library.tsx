import type { AgentInfo } from '@alpine/protocol';
import { Button } from '@alpine/ui/primitives';
import { Plus } from 'lucide-react';

import { useMessages } from '@/shared/i18n';

import { libraryMessages } from './messages';
import { NewSkill } from './NewSkill';
import { SkillDetail } from './SkillDetail';
import { Skills } from './Skills';
import type { LibraryTab, LibraryView, SkillActions } from './types';

export type { LibraryTab, LibraryView, SkillActions };

/**
 * Board 에이전트 화면, the library side: the skills the agent being edited can use, to find, add, open and write
 * (MCP and subagents join them once they exist; until then they are not shown at all).
 * Opening one replaces the list in place. The library never saves the agent: it reports what changed
 * (`skillActions`), and the screen does the saving and the telling.
 */
export function Library({
  agent,
  agents,
  view,
  onViewChange,
  skillActions,
}: {
  agent: AgentInfo;
  agents: AgentInfo[];
  view: LibraryView;
  onViewChange: (view: LibraryView) => void;
  skillActions: SkillActions;
}) {
  const t = useMessages(libraryMessages);
  return (
    <aside
      aria-label={t.title}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto border-l border-line bg-canvas"
    >
      {view.kind === 'list' && <List agent={agent} onViewChange={onViewChange} skillActions={skillActions} />}
      {view.kind === 'skill' && (
        <SkillDetail
          key={view.name}
          agent={agent}
          agents={agents}
          name={view.name}
          onViewChange={onViewChange}
          actions={skillActions}
        />
      )}
      {view.kind === 'new-skill' && <NewSkill onViewChange={onViewChange} actions={skillActions} />}
    </aside>
  );
}

function List({
  agent,
  onViewChange,
  skillActions,
}: {
  agent: AgentInfo;
  onViewChange: (view: LibraryView) => void;
  skillActions: SkillActions;
}) {
  const t = useMessages(libraryMessages);
  return (
    <>
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <h2 className="grow text-title">{t.title}</h2>
        <Button title={t.writeSkillNote} onClick={() => onViewChange({ kind: 'new-skill' })}>
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          {t.writeSkill}
        </Button>
      </div>
      <Skills agent={agent} onViewChange={onViewChange} actions={skillActions} />
    </>
  );
}
