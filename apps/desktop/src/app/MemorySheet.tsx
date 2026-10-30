import { Dialog } from '@alpine/ui/primitives';
import { X } from 'lucide-react';

import { Memory } from '@/features/memory/Memory';
import { messages as memoryMessages } from '@/features/memory/messages';
import { messages } from '@/features/settings/messages';
import { useMessages } from '@/shared/i18n';
import { closeMemory, useMemorySheet } from '@/shared/navigation';

/** A project's memory as a sheet over its board, like settings: closing it is going back to where I was. */
export function MemorySheet() {
  const t = useMessages(messages);
  const m = useMessages(memoryMessages);
  const project = useMemorySheet((state) => state.project);
  return (
    <Dialog.Root open={project !== null} onOpenChange={(open) => !open && closeMemory()}>
      <Dialog.Popup size="page" aria-label={m.title} className="relative">
        <div className="flex min-w-0 grow flex-col overflow-y-auto bg-canvas">
          <Memory project={project} />
        </div>
        <Dialog.Close
          aria-label={t.close}
          title={t.close}
          className="absolute top-3 right-3 inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-interactive"
        >
          <X size={18} strokeWidth={1.6} aria-hidden="true" />
        </Dialog.Close>
      </Dialog.Popup>
    </Dialog.Root>
  );
}
