import { Dialog } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { Bot, PlugZap, SlidersHorizontal, X, type LucideIcon } from 'lucide-react';

import { Agents } from '@/features/agents/Agents';
import { useMessages } from '@/shared/i18n';
import { ConnectionTab } from '@/features/settings/Connection';
import { messages } from '@/features/settings/messages';
import { General } from '@/features/settings/Settings';
import { closeSettings, openSettings, useSettingsSheet, type SettingsPlace } from '@/shared/navigation';

const PLACES: { id: SettingsPlace; icon: LucideIcon }[] = [
  { id: 'agents', icon: Bot },
  { id: 'connection', icon: PlugZap },
  { id: 'general', icon: SlidersHorizontal },
];

/**
 * Settings as a sheet over the window, so the board stays under it and closing it (Esc, 닫기, the scrim) is going back:
 * its places on the left (에이전트 first, since giving the AI skills and tools is what it is opened for most), the
 * place on the right.
 */
export function SettingsSheet() {
  const t = useMessages(messages);
  const { place, agent, creating, library } = useSettingsSheet();
  return (
    <Dialog.Root open={place !== null} onOpenChange={(open) => !open && closeSettings()}>
      <Dialog.Popup size="page">
        <nav
          aria-label={t.title}
          className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-line bg-canvas-sunken p-3"
        >
          <Dialog.Title className="px-2 pt-1 pb-3 text-title font-semibold">{t.title}</Dialog.Title>
          {PLACES.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={place === id ? 'page' : undefined}
              onClick={() => openSettings(id)}
              className={clsx(
                'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-interactive',
                place === id ? 'bg-selected font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
              )}
            >
              <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
              {t[id]}
            </button>
          ))}
          <span className="grow" />
          <Dialog.Close className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-body text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-interactive">
            <X size={16} strokeWidth={1.6} aria-hidden="true" />
            {t.close}
          </Dialog.Close>
          <p className="px-2 text-meta text-fg-faint">{t.closeHint}</p>
        </nav>
        <div className="flex min-w-0 grow flex-col overflow-y-auto bg-canvas">
          {place === 'agents' && (
            <Agents
              agentId={agent}
              creating={creating}
              library={library}
              onChange={(search) => openSettings('agents', search)}
            />
          )}
          {place === 'connection' && (
            <div className="flex flex-col gap-6 px-6 pt-5 pb-8">
              <h2 className="text-title">{t.connection}</h2>
              <ConnectionTab onAlpineAccount={() => openSettings('general')} />
            </div>
          )}
          {place === 'general' && (
            <div className="flex flex-col gap-6 px-6 pt-5 pb-8">
              <h2 className="text-title">{t.general}</h2>
              <General onReviewModel={() => openSettings('connection')} />
            </div>
          )}
        </div>
      </Dialog.Popup>
    </Dialog.Root>
  );
}
