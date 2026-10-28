import clsx from 'clsx';
import { Monitor, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';

import { useMessages } from '@/shared/i18n';

import { useBoardSize } from './boardDevice';
import type { TreeMap } from './flowTreeModel';
import { messages } from './messages';
import type { Device } from './planLook';

/**
 * 휴대폰 | 컴퓨터 over the board, for a product that is one web app: every screen on the board (and in the 문서, the
 * 흐름 재생 and the PDF) is drawn at the size picked, as the same app is seen on a phone or on a computer.
 */
export function BoardSizeSwitch({ map }: { map: TreeMap }) {
  const t = useMessages(messages);
  const board = useBoardSize(map);
  if (!board.shown) return null;
  const button = (device: Device, icon: ReactNode, label: string) => (
    <button
      type="button"
      aria-pressed={board.size === device}
      onClick={() => board.set(device)}
      className={clsx(
        'flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-meta',
        board.size === device ? 'bg-canvas-raised font-medium text-fg shadow-overlay' : 'text-fg-muted hover:text-fg',
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
  return (
    <div role="group" aria-label={t.boardSize} className="flex gap-0.5 rounded-lg bg-hover p-0.5">
      {button('phone', <Smartphone size={13} />, t.phoneSize)}
      {button('computer', <Monitor size={13} />, t.computerSize)}
    </div>
  );
}
