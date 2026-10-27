import { useCallback, useEffect, useMemo, useState } from 'react';

import { deviceOf } from './filmstripModel';
import type { Journey, TreeMap } from './flowTreeModel';
import type { Device } from './planLook';

/**
 * What each journey is used on, as the board draws it: the journey's own device, else told from the shape of its
 * screens' pictures once they load. The board, its 흐름 재생 and the 문서 read it alike, so a screen wears one frame.
 */
export function useBoardDevice(map: TreeMap): (journey: Journey) => Device {
  const wide = useWideScreens(map);
  return useCallback((journey: Journey) => deviceOf(journey, map, wide), [map, wide]);
}

/** Whether each picture (capture or sketch) is wider than tall, once it has loaded; unknown until then. */
function useWideScreens(map: TreeMap) {
  const [shapes, setShapes] = useState<Record<string, boolean>>({});
  const sources = useMemo(
    () =>
      [
        ...new Set(
          map.people
            .flatMap((person) => person.journeys)
            .filter((journey) => !journey.device)
            .flatMap((journey) => journey.steps)
            .map((id) => map.cards[id]?.screen)
            .filter((screen) => !!screen && screen.kind !== 'planned')
            .map((screen) => screen!.src),
        ),
      ].join('\n'),
    [map],
  );
  useEffect(() => {
    let live = true;
    for (const src of sources.split('\n').filter(Boolean)) {
      const image = new Image();
      image.onload = () =>
        live &&
        image.naturalWidth > 0 &&
        setShapes((current) =>
          src in current ? current : { ...current, [src]: image.naturalWidth > image.naturalHeight },
        );
      image.src = src;
    }
    return () => {
      live = false;
    };
  }, [sources]);
  return (src: string): boolean | undefined => shapes[src];
}
