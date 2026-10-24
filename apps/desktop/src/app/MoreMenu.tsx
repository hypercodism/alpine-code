import { Menu } from '@alpine/ui/primitives';
import { useNavigate } from '@tanstack/react-router';
import { Bot, Brain, ChevronRight, Ellipsis, History, Settings, Wrench, type LucideIcon } from 'lucide-react';

import { useMessages } from '@/shared/i18n';
import { useNavigation } from '@/shared/navigation';

import { shellMessages } from './shellMessages';

/** A developer tool the ⋯ menu opens beside the map, in the conversation's place. */
export interface DevTool {
  id: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * The ⋯ at the window's top right (flow-spec): 설정 (⌘,), 에이전트, 기억, 지난 대화 and 개발 도구 ▸ (터미널, 바뀐 파일,
 * 파일, 데이터, AI가 실행한 명령). Without a project (새 프로젝트) there is no memory and no tool to open.
 */
export function MoreMenu({
  project,
  tools = [],
  onTool,
}: {
  project: string | null;
  tools?: DevTool[];
  onTool?: (id: string) => void;
}) {
  const t = useMessages(shellMessages);
  const navigate = useNavigate();
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t.more}
        title={t.more}
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-faint outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-interactive data-popup-open:bg-hover"
      >
        <Ellipsis size={16} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Popup align="end">
        <Menu.Item onClick={() => void navigate({ to: '/settings' })}>
          <Settings size={15} strokeWidth={1.6} aria-hidden="true" />
          <span className="grow">{t.settings}</span>
          <kbd className="text-meta font-normal text-fg-faint">⌘,</kbd>
        </Menu.Item>
        <Menu.Item onClick={() => void navigate({ to: '/agents' })}>
          <Bot size={15} strokeWidth={1.6} aria-hidden="true" />
          {t.agents}
        </Menu.Item>
        {project && (
          <Menu.Item onClick={() => void navigate({ to: '/memory', search: { project } })}>
            <Brain size={15} strokeWidth={1.6} aria-hidden="true" />
            {t.memory}
          </Menu.Item>
        )}
        <Menu.Item onClick={() => useNavigation.getState().setSearchOpen(true)}>
          <History size={15} strokeWidth={1.6} aria-hidden="true" />
          {t.pastConversations}
        </Menu.Item>
        {tools.length > 0 && onTool && (
          <>
            <Menu.Separator />
            <Menu.SubmenuRoot>
              <Menu.SubmenuTrigger>
                <Wrench size={15} strokeWidth={1.6} aria-hidden="true" />
                <span className="grow">{t.devTools}</span>
                <ChevronRight size={14} strokeWidth={1.6} aria-hidden="true" className="text-fg-faint" />
              </Menu.SubmenuTrigger>
              <Menu.Popup side="left" align="start">
                {tools.map((tool) => (
                  <Menu.Item key={tool.id} onClick={() => onTool(tool.id)}>
                    {tool.icon && <tool.icon size={15} strokeWidth={1.6} aria-hidden="true" />}
                    {tool.label}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.SubmenuRoot>
          </>
        )}
      </Menu.Popup>
    </Menu.Root>
  );
}
