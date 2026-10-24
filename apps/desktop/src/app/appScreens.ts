import type { FlowGetResult } from '@alpine/protocol';
import { useMemo } from 'react';

import type { AppPerson } from '@/features/app-view/AppView';
import { hasScreenArea, isJourneyLink, UNPLACED } from '@/features/product-map/flowTreeModel';
import { toTreeMap } from '@/features/product-map/flowTreeData';
import { flowTreeMessages } from '@/features/product-map/flowTreeMessages';
import { useMapTalk } from '@/features/product-map/mapTalk';
import { planPhase } from '@/features/product-map/planData';
import { useMessages } from '@/shared/i18n';
import { useProductMap } from '@/shared/server';

const NOTHING_WORKING: ReadonlySet<string> = new Set();

/**
 * The map's screens as the app view lists them: by person, then journey, only the steps that show a screen. A screen
 * in several journeys is listed in each, as on the map.
 */
export function appPeople(board: FlowGetResult, product: string, unnamed: string, unnamedRole: string): AppPerson[] {
  const tree = toTreeMap(board, NOTHING_WORKING, product, {
    unnamed: { ko: unnamed, en: unnamed },
    unnamedRole: { ko: unnamedRole, en: unnamedRole },
  });
  return tree.people
    .map((person) => ({
      id: person.id,
      name: person.name.ko,
      tone: person.tone,
      journeys: person.journeys
        .filter((journey) => journey.id !== UNPLACED)
        .map((journey) => ({
          id: journey.id,
          title: journey.title.ko,
          device: journey.device ?? null,
          screens: journey.steps
            .filter((step) => !isJourneyLink(step))
            .map((step) => tree.cards[step])
            .filter((card) => !!card && hasScreenArea(card))
            .map((card) => ({
              id: card!.id,
              title: card!.title,
              path: card!.path ?? null,
              real: card!.screen?.kind === 'shot',
              howToTry: card!.howToTry ?? '',
              promises: card!.promises.map((promise) => ({
                id: promise.id,
                text: promise.then,
                status:
                  promise.status === 'passed'
                    ? ('passed' as const)
                    : promise.status === 'failed'
                      ? ('failed' as const)
                      : ('other' as const),
                note: promise.note,
              })),
            })),
        }))
        .filter((journey) => journey.screens.length > 0),
    }))
    .filter((person) => person.journeys.length > 0);
}

/** The project's screens for the app view, from its map. */
export function useAppPeople(cwd: string, product: string): AppPerson[] {
  const tree = useMessages(flowTreeMessages);
  const board = useProductMap(cwd).data;
  return useMemo(
    () => (board ? appPeople(board, product, tree.unnamed, tree.unnamedRole) : []),
    [board, product, tree.unnamed, tree.unnamedRole],
  );
}

/**
 * Whether the project has an app to look at beside its map (flow-spec 4.1, 7): a plan once it is built, or a map drawn
 * from code that has a screen on it. Before that, the top bar has no 지도 | 앱.
 */
export function useHasApp(cwd: string): boolean {
  const board = useProductMap(cwd).data;
  const { buildWorking, buildTeam } = useMapTalk(cwd);
  if (!board) return false;
  if (board.planned)
    return planPhase(board, false, false, { working: buildWorking, team: buildTeam?.status ?? null }) === 'built';
  return (board.document?.nodes ?? []).some((node) => node.kind === 'screen' || !!board.previews?.[node.id]);
}
