import { Menu } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { Bot, Brain, Code, Ellipsis, FileText, History, Settings } from 'lucide-react';

import { showView } from '@/features/app-view/state';
import { useMapMenu } from '@/features/product-map/mapActions';
import { useMessages } from '@/shared/i18n';
import { openMemory, openSettings, useNavigation } from '@/shared/navigation';

import { shellMessages } from './shellMessages';
import { railItem } from './railItem';

/**
 * ⋯ 더 보기: in a project first the same project read two other ways (문서로 보기, 코드 보기), then 설정 (⌘,),
 * 에이전트, 기억, 지난 대화. Without a project (새 프로젝트) there is no memory; it sits at the
 * top right there. In a project it is the rail's last item (`inRail`), and the map's own items (바뀐 것, 지도 다시
 * 그리기, 매일 확인, 범위, 지도 지우기) are its "보드" part, so there is one ⋯; a dot on it says the map's history has
 * something new. The developer tools it once held are on the rail and in the 코드 tab.
 */
export function MoreMenu({ project, inRail = false }: { project: string | null; inRail?: boolean }) {
  const t = useMessages(shellMessages);
  const map = useMapMenu(project);
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t.more}
        title={t.more}
        className={
          inRail
            ? clsx(railItem(false), 'cursor-pointer hover:bg-hover hover:text-fg data-popup-open:bg-hover')
            : 'relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-faint outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-interactive data-popup-open:bg-hover'
        }
      >
        <Ellipsis size={inRail ? 19 : 16} aria-hidden="true" />
        {inRail && <span aria-hidden="true">{t.more}</span>}
        {map?.dot && (
          <span
            aria-hidden
            className={clsx(
              'absolute size-1.5 rounded-full bg-interactive',
              inRail ? 'top-1 right-3' : 'top-0.5 right-0.5',
            )}
          />
        )}
      </Menu.Trigger>
      <Menu.Popup {...(inRail ? { side: 'left' as const, align: 'end' as const } : { align: 'end' as const })}>
        {project && (
          <>
            <Menu.Item onClick={() => showView(project, 'doc')}>
              <FileText size={15} strokeWidth={1.6} aria-hidden="true" />
              {t.showDoc}
            </Menu.Item>
            <Menu.Item onClick={() => showView(project, 'code')}>
              <Code size={15} strokeWidth={1.6} aria-hidden="true" />
              {t.showCode}
            </Menu.Item>
            <Menu.Separator />
          </>
        )}
        <Menu.Item onClick={() => openSettings('general')}>
          <Settings size={15} strokeWidth={1.6} aria-hidden="true" />
          <span className="grow">{t.settings}</span>
          <kbd className="text-meta font-normal text-fg-faint">⌘,</kbd>
        </Menu.Item>
        <Menu.Item onClick={() => openSettings('agents')}>
          <Bot size={15} strokeWidth={1.6} aria-hidden="true" />
          {t.agents}
        </Menu.Item>
        {project && (
          <Menu.Item onClick={() => openMemory(project)}>
            <Brain size={15} strokeWidth={1.6} aria-hidden="true" />
            {t.memory}
          </Menu.Item>
        )}
        <Menu.Item onClick={() => useNavigation.getState().setSearchOpen(true)}>
          <History size={15} strokeWidth={1.6} aria-hidden="true" />
          {t.pastConversations}
        </Menu.Item>
        {map && (
          <>
            <Menu.Separator />
            <Menu.Group>
              <Menu.GroupLabel>{t.mapGroup}</Menu.GroupLabel>
              {map.items}
            </Menu.Group>
          </>
        )}
      </Menu.Popup>
    </Menu.Root>
  );
}
