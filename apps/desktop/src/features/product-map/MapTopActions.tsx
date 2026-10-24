import { Button } from '@alpine/ui/primitives';
import { Square } from 'lucide-react';

import { useMessages } from '@/shared/i18n';

import { useMapActions } from './mapActions';
import { planMessages } from './planMessages';

/**
 * The right of the top bar over a map: while a plan is decided, what is left to decide and 이대로 만들기 (quiet until
 * nothing is left); while the AI works, how far the build is and 멈추기; nothing once built. It acts through the map on
 * screen, so it shows nothing when no map of this project is open.
 */
export function MapTopActions({ cwd }: { cwd: string }) {
  const t = useMessages(planMessages);
  const map = useMapActions(cwd);
  if (!map) return null;
  if (map.working)
    return (
      <span className="flex shrink-0 items-center gap-3">
        {map.phase === 'building' && map.cards > 0 && (
          <span className="text-meta whitespace-nowrap text-fg-muted tabular-nums">
            {t.progress(map.built, map.cards)}
          </span>
        )}
        <Button onClick={map.stop}>
          <Square size={11} aria-hidden className="fill-current" />
          {t.stop}
        </Button>
      </span>
    );
  if (map.phase !== 'asking' && map.phase !== 'ready') return null;
  const ready = map.phase === 'ready' && map.left === 0;
  return (
    <span className="flex shrink-0 items-center gap-3">
      {map.left > 0 && (
        <span className="flex items-center gap-1.5 text-meta whitespace-nowrap text-attention">
          <span aria-hidden className="size-1.75 rounded-full bg-attention" />
          {t.left(map.left)}
        </span>
      )}
      <Button
        variant={ready ? 'primary' : 'secondary'}
        disabled={!ready || map.busy}
        title={ready ? undefined : t.buildLater}
        onClick={map.build}
      >
        {t.build}
      </Button>
    </span>
  );
}
