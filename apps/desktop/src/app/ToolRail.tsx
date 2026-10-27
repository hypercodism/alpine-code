import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useMessages } from '@/shared/i18n';

import { MoreMenu } from './MoreMenu';
import { railItem } from './railItem';
import { shellMessages } from './shellMessages';

/** One place on the rail: what it opens beside the board, and what it says while folded (a count, a red dot). */
export interface RailPlace {
  id: string;
  label: string;
  icon: LucideIcon;
  /** How many are running, as a number on the icon. */
  badge?: number;
  /** Something is wrong there (the 로그's red dot). */
  alert?: boolean;
  /** A place that is coming: drawn dashed, not pressable. */
  later?: boolean;
}

/**
 * The icon rail on the window's right edge (2c): 대화 · 명령 · 터미널 · 로그 · 데이터, 브라우저 to come, and 더 보기 at
 * the bottom (the old ⋯). It picks the place beside the board; the place already open folds its panel away, and
 * the rail stays with its counts and dots.
 */
export function ToolRail({
  project,
  places,
  current,
  folded,
  onPick,
}: {
  project: string;
  places: RailPlace[];
  current: string;
  folded: boolean;
  onPick: (id: string) => void;
}) {
  const t = useMessages(shellMessages);
  return (
    <nav
      aria-label={t.places}
      data-tauri-drag-region
      className="flex w-15 shrink-0 flex-col items-center gap-1 border-l border-line bg-canvas-sunken pt-12 pb-3.5"
    >
      {places.map((place) => (
        <RailItem
          key={place.id}
          label={place.label}
          on={place.id === current && !folded}
          later={place.later}
          onClick={place.later ? undefined : () => onPick(place.id)}
          mark={
            place.badge ? (
              <span className="absolute top-0.5 right-1.5 h-4 min-w-4 rounded-full bg-interactive px-1 text-center text-meta leading-4 font-semibold text-on-fill tabular-nums">
                {place.badge}
              </span>
            ) : place.alert ? (
              <span className="absolute top-1 right-3 size-2 rounded-full bg-danger ring-2 ring-canvas-sunken" />
            ) : null
          }
        >
          <place.icon size={19} strokeWidth={1.7} aria-hidden="true" />
        </RailItem>
      ))}
      <span data-tauri-drag-region className="grow self-stretch" />
      <MoreMenu project={project} inRail />
    </nav>
  );
}

function RailItem({
  label,
  on,
  later,
  onClick,
  mark,
  children,
}: {
  label: string;
  on: boolean;
  later?: boolean;
  onClick?: () => void;
  mark: ReactNode;
  children: ReactNode;
}) {
  const t = useMessages(shellMessages);
  return (
    <button
      type="button"
      aria-pressed={later ? undefined : on}
      disabled={later}
      title={later ? t.later(label) : label}
      onClick={onClick}
      className={clsx(
        railItem(on),
        later
          ? 'cursor-default border border-dashed border-line text-fg-faint'
          : 'cursor-pointer hover:bg-hover hover:text-fg',
      )}
    >
      {children}
      <span>{label}</span>
      {mark && <span aria-hidden="true">{mark}</span>}
    </button>
  );
}
