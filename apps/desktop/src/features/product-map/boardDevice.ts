import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { deviceOf } from './filmstripModel';
import { isJourneyLink, type Journey, type TreeMap } from './flowTreeModel';
import type { Device } from './planLook';

/**
 * What each journey's person uses: the journey's own device, else told from the shape of its screens' pictures once
 * they load. The board says it beside each person; the screens' frames follow `useBoardDevice`.
 */
export function useJourneyDevice(map: TreeMap): (journey: Journey) => Device {
  const wide = useWideScreens(map);
  return useCallback((journey: Journey) => deviceOf(journey, map, wide), [map, wide]);
}

/**
 * Whether the product is one app its people all use (a responsive web product seen on a phone and on a computer), or
 * several apps (a customer's phone app beside an owner's desk screens). It is one unless people on phones and people on
 * computers share no screen at all. One app is drawn at one size, the board's; its usual size is the device most of
 * its screens are walked on.
 */
export function boardFrames(map: TreeMap, uses: (journey: Journey) => Device): { oneApp: boolean; usual: Device } {
  const on = { phone: new Set<string>(), computer: new Set<string>() };
  const homes = new Map<string, Device>();
  for (const person of map.people)
    for (const journey of person.journeys)
      for (const id of journey.steps) {
        if (isJourneyLink(id) || map.cards[id]?.kind !== 'screen') continue;
        on[uses(journey)].add(id);
        if (!homes.has(id)) homes.set(id, uses(journey));
      }
  const shared = [...on.phone].some((id) => on.computer.has(id));
  const oneApp = !on.phone.size || !on.computer.size || shared;
  const computers = [...homes.values()].filter((device) => device === 'computer').length;
  return { oneApp, usual: computers * 2 > homes.size ? 'computer' : 'phone' };
}

/** The size picked on the board for a product that is one app (null: its usual one), for everything that draws it. */
export const BoardSize = createContext<{ size: Device | null; set: (size: Device) => void } | null>(null);

/**
 * The frame each journey's screens wear: for one app the board's one size, the same everywhere (the board, its 흐름
 * 재생, the 문서 and its PDF); for several apps, each journey's own device.
 */
export function useBoardDevice(map: TreeMap): (journey: Journey) => Device {
  const uses = useJourneyDevice(map);
  const picked = useContext(BoardSize)?.size ?? null;
  const frames = useMemo(() => boardFrames(map, uses), [map, uses]);
  return useCallback(
    (journey: Journey) => (frames.oneApp ? (picked ?? frames.usual) : uses(journey)),
    [frames, picked, uses],
  );
}

/**
 * The board's size switch: shown for one web app (its screens have addresses, so they draw at any width), with the
 * size now on view.
 */
export function useBoardSize(map: TreeMap): { shown: boolean; size: Device; set: (size: Device) => void } {
  const uses = useJourneyDevice(map);
  const board = useContext(BoardSize);
  const frames = useMemo(() => boardFrames(map, uses), [map, uses]);
  const web = Object.values(map.cards).some((card) => card.kind === 'screen' && !!card.path);
  return { shown: frames.oneApp && web && !!board, size: board?.size ?? frames.usual, set: board?.set ?? (() => {}) };
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
