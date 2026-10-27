import type { FlowGetResult, FlowNode } from '@alpine/protocol';
import { useCallback, useRef, type ReactNode } from 'react';

import { useMessages } from '@/shared/i18n';
import { useEditFlow, useServer, useSetActor, useSetFlow } from '@/shared/server';

import clsx from 'clsx';

import { Filmstrip } from './Filmstrip';
import type { StepParts } from './FlowTree';
import { flowTreeMessages } from './flowTreeMessages';
import { BlankAppNotice, LiveAppProvider, useBoardApp } from './liveScreens';
import { MapDocument } from './MapDocument';
import { usePacedMap } from './pacedMap';
import type { TreeMap } from './flowTreeModel';

export type JourneyStart = (
  action: 'verify' | 'change' | 'extend' | 'reshape',
  target: { node?: FlowNode | null; flowId?: string | null; nodeIds?: string[]; request?: string },
) => Promise<boolean>;

/**
 * The project's real map as a filmstrip of its screens, the running app's own where a screen has an address. Reading comes from `flow/get`; what the person asks for goes the
 * way the map already sends it: checks, fixes and new journeys start an AI session (`flow/prepare`), promises are
 * added or removed with `flow/edit`, and the person's own calls on a card are written with `flow/set`.
 */
export function JourneyMap({
  cwd,
  map: written,
  board,
  seenAt,
  start,
  onSession,
  drawing = false,
  lit = null,
  reveal = null,
  stepParts,
  promiseExtras,
  look,
  touching,
  asked,
  onPlan,
  waitNote,
  planned = false,
  making = null,
  view = 'board',
  onShowOnBoard,
}: {
  cwd: string;
  /** `board` read person first (`toTreeMap`). */
  map: TreeMap;
  board: FlowGetResult;
  seenAt?: string | null;
  start: JourneyStart;
  onSession: (id: string) => void;
  /** The AI is drawing the map: keep it all in view as cards land. */
  drawing?: boolean;
  /** Cards the page lights (search, a status); the rest quiets down. */
  lit?: Set<string> | null;
  /** A card the page asks to show. */
  reveal?: { cardId: string; seq: number } | null;
  stepParts?: (cardId: string) => StepParts;
  promiseExtras?: (cardId: string, promiseId: string) => ReactNode;
  /** A planned product: the look its screens wear, the cards the AI works on now, the card a question is about. */
  look?: string;
  touching?: ReadonlySet<string>;
  asked?: string | null;
  /**
   * A plan not built yet: there is no code to check or find steps in, so nothing is checked and new journeys, steps
   * and people are words to the plan's conversation.
   */
  onPlan?: (words: string) => void;
  /** Why asks from the open details cannot start now. */
  waitNote?: string | null;
  /** A product that began as a plan. */
  planned?: boolean;
  /** The card the build works on now. */
  making?: string | null;
  /** The board, or the same map read as a document (the 문서 tab), over the board kept as it was. */
  view?: 'board' | 'doc';
  /** A screen pressed in the document: the board shows it. */
  onShowOnBoard?: (cardId: string) => void;
}) {
  const t = useMessages(flowTreeMessages);
  const edit = useEditFlow();
  const decide = useSetFlow();
  const setActor = useSetActor();
  const server = useServer();
  const readSource = useCallback(
    (path: string) => server.request('files/read', { cwd, path, startLine: 1, limit: 400 }),
    [server, cwd],
  );
  const removed = useRef<{ cardId: string; text: string } | null>(null);
  const readOnly = !!board.readOnly;
  // While the AI draws, journeys and steps join one after another in reading order, not in the bursts they are written.
  const map = usePacedMap(written, drawing);
  const nodeOf = (id: string) => board.document?.nodes?.find((node) => node.id === id) ?? null;
  // Screens with an address are real code: the map shows the running app, so it asks for it as soon as there are any.
  const app = useBoardApp(
    cwd,
    Object.values(written.cards).some((card) => card.kind === 'screen' && !!card.path),
  );

  return (
    <LiveAppProvider value={app?.boardUrl ?? null}>
      <div className="relative flex min-h-0 min-w-0 grow flex-col">
        {view === 'doc' && (
          <div className="absolute inset-0 z-10 flex">
            <MapDocument
              map={map}
              undecided={board.undecided ?? []}
              look={look}
              onShowOnBoard={(cardId) => onShowOnBoard?.(cardId)}
            />
          </div>
        )}
        <div
          className={clsx('flex min-h-0 min-w-0 grow flex-col', view === 'doc' && 'invisible')}
          aria-hidden={view === 'doc'}
          inert={view === 'doc'}
        >
          <BlankAppNotice app={app} />
          <Filmstrip
            map={map}
            undecided={board.undecided ?? []}
            planned={planned}
            making={making}
            drawing={drawing}
            lit={lit}
            reveal={reveal}
            stepParts={stepParts}
            promiseExtras={promiseExtras}
            look={look}
            touching={touching}
            asked={asked}
            seenAt={seenAt ?? undefined}
            readSource={readSource}
            planning={!!onPlan}
            waitNote={waitNote}
            onCheck={
              onPlan
                ? undefined
                : (targets) => void start('verify', { nodeIds: [...new Set(targets.map((target) => target.cardId))] })
            }
            onFix={(targets) => {
              const cardId = targets[0]?.cardId;
              const card = cardId ? map.cards[cardId] : undefined;
              if (!card) return;
              const broken = targets
                .filter((target) => target.cardId === cardId)
                .map((target) => card.promises.find((promise) => promise.id === target.promiseId)?.then)
                .filter(Boolean)
                .join(' / ');
              void start('change', { node: nodeOf(card.id), request: t.fixRequest(card.title, broken) });
            }}
            onAddPromise={(cardId, when, then) =>
              !readOnly &&
              edit.mutate({
                cwd,
                nodeId: cardId,
                field: 'promise',
                conditionId: null,
                // Either part may be left empty; only both together read "when, then".
                value: when.trim() && then.trim() ? `${when.trim()}, ${then.trim()}` : when.trim() || then.trim(),
              })
            }
            onRemovePromise={({ cardId, promiseId }) => {
              if (readOnly) return;
              const text = map.cards[cardId]?.promises.find((promise) => promise.id === promiseId)?.then ?? '';
              removed.current = { cardId, text };
              edit.mutate({ cwd, nodeId: cardId, field: 'promise', conditionId: promiseId, value: '' });
            }}
            onUndoRemove={() => {
              const last = removed.current;
              removed.current = null;
              if (last?.text)
                edit.mutate({ cwd, nodeId: last.cardId, field: 'promise', conditionId: null, value: last.text });
            }}
            onAddJourney={(_, title, goal) =>
              onPlan
                ? onPlan(t.planJourneyRequest(title, goal))
                : void start('extend', { request: t.addJourneyRequest(title, goal) })
            }
            onFindSteps={(journeyId) => {
              const journey = map.people.flatMap((person) => person.journeys).find((item) => item.id === journeyId);
              const title = journey?.title.ko ?? journeyId;
              if (onPlan) onPlan(t.planStepsRequest(title));
              else void start('extend', { flowId: journeyId, request: t.findStepsRequest(title) });
            }}
            onAddPerson={(name) =>
              onPlan ? onPlan(t.planPersonRequest(name)) : void start('reshape', { request: t.addPersonRequest(name) })
            }
            // A map from a newer Alpine is read only: no decisions to write (the decision chips are not shown).
            onDecide={
              readOnly ? undefined : (cardId, field, value) => decide.mutate({ cwd, nodeId: cardId, field, value })
            }
            onOpenSession={onSession}
            onSituation={(cardId, situationId, act) => {
              const card = map.cards[cardId];
              const situation = card?.states?.find((one) => one.id === situationId);
              if (!card || !situation || readOnly) return;
              if (act === 'drop') {
                edit.mutate({ cwd, nodeId: cardId, field: 'state', conditionId: situationId, value: '' });
                return;
              }
              const request =
                act === 'make'
                  ? t.makeSituationRequest(card.title, situation.title, situation.why ?? '')
                  : t.fixSituationRequest(card.title, situation.title);
              if (onPlan) onPlan(request);
              else void start('change', { node: nodeOf(cardId), request });
            }}
            onSetActor={(flowIds, actor) =>
              flowIds.length && setActor.mutate({ cwd, flowIds: flowIds as [string, ...string[]], actor })
            }
          />
        </div>
      </div>
    </LiveAppProvider>
  );
}
