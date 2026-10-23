import { Menu } from '@alpine/ui/primitives';
import { Check, ChevronDown, Folder, FolderPlus } from 'lucide-react';

import { chipClass } from '@/shared/components/composer';
import { useMessages } from '@/shared/i18n';
import { pickFolder, tildePath, useHomeDir } from '@/shared/platform';
import { useSettings } from '@/shared/server';

import { messages } from './messages';

/**
 * Where a new project is made, first in the input bar: a new folder in the clone folder (the usual), or an empty
 * folder the person made and picks here. `folder` is that folder, `null` for a new one.
 */
export function WhereChip({
  folder,
  disabled = false,
  onChange,
}: {
  folder: string | null;
  disabled?: boolean;
  onChange: (folder: string | null) => void;
}) {
  const t = useMessages(messages);
  const home = useHomeDir();
  const cloneFolder = useSettings().data?.cloneFolder ?? null;
  const label = folder ? (folder.split('/').filter(Boolean).at(-1) ?? folder) : t.whereNew;
  return (
    <Menu.Root>
      <Menu.Trigger disabled={disabled} className={chipClass} aria-label={t.whereLabel(label)}>
        <span aria-hidden="true" className="flex size-5.5 shrink-0 items-center justify-center">
          {folder ? <Folder size={16} strokeWidth={1.5} /> : <FolderPlus size={16} strokeWidth={1.5} />}
        </span>
        <span className="max-w-48 truncate text-fg">{label}</span>
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Popup side="top" align="start" className="w-80">
        <Menu.Item onClick={() => onChange(null)}>
          <FolderPlus size={16} strokeWidth={1.5} className="shrink-0 text-fg-muted" aria-hidden="true" />
          <span className="flex min-w-0 grow flex-col">
            <span>{t.whereNew}</span>
            {cloneFolder && (
              <span className="truncate text-meta text-fg-muted">{t.whereNewIn(tildePath(cloneFolder, home))}</span>
            )}
          </span>
          {!folder && <Check size={14} aria-hidden="true" className="shrink-0" />}
        </Menu.Item>
        {folder && (
          <Menu.Item onClick={() => onChange(folder)}>
            <Folder size={16} strokeWidth={1.5} className="shrink-0 text-fg-muted" aria-hidden="true" />
            <span className="min-w-0 grow truncate">{tildePath(folder, home)}</span>
            <Check size={14} aria-hidden="true" className="shrink-0" />
          </Menu.Item>
        )}
        <Menu.Separator />
        <Menu.Item
          onClick={() => {
            void pickFolder(t.wherePickTitle).then((picked) => picked && onChange(picked));
          }}
        >
          {t.wherePick}
        </Menu.Item>
      </Menu.Popup>
    </Menu.Root>
  );
}
