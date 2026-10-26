import type { SessionInfo } from '@alpine/protocol';
import { useState } from 'react';

import { latestTaskForce } from '@/shared/components/taskforce';
import { useProductMap, useSession, useSessions } from '@/shared/server';

import { planPhase } from './planData';

const working = (info?: SessionInfo | null) => info?.status === 'running' || info?.status === 'waiting';

/**
 * Where a project's map talks: its one conversation (`purpose: 'map'`), and while a planned product's build is
 * unfinished, the build's own conversation, which takes the map's one input (map-first 36, 37). The map and the page
 * that keeps the conversation beside it both follow this, so what the dock shows is where my words go.
 */
export function useMapTalk(cwd: string) {
  const board = useProductMap(cwd).data;
  const sessions = useSessions().data;
  const mapConversation = (sessions ?? []).find((s) => s.cwd === cwd && s.purpose === 'map' && !s.archived) ?? null;
  const planned = !!board?.planned;
  const buildSessionId = planned ? (board?.buildSession ?? null) : null;
  const buildConversation = useSession(buildSessionId);
  const buildInfo = (sessions ?? []).find((s) => s.id === buildSessionId) ?? buildConversation.data?.info ?? null;
  const buildWorking = working(buildInfo);
  const buildItems = buildConversation.data?.items;
  const buildTeam = buildItems ? latestTaskForce(buildItems) : null;
  // A fix asked of the map once the product was built is the map conversation's: while it works, or once it worked
  // after the build last did, the build is not "stopped" because the cards it touches are being made again.
  const taken =
    !!mapConversation &&
    !!buildInfo &&
    !buildWorking &&
    (working(mapConversation) || Date.parse(mapConversation.updatedAt) > Date.parse(buildInfo.updatedAt));
  const buildState = { working: buildWorking, team: buildTeam?.status ?? null, taken };
  // Before a build starts, the plan's own state does not matter here: the input goes to the map's conversation.
  const afterBuild = planned && board ? planPhase(board, false, false, buildState) : null;
  const building = afterBuild === 'building' || afterBuild === 'team' || afterBuild === 'stopped';
  return {
    mapConversation,
    buildSessionId,
    buildInfo,
    buildWorking,
    buildItems,
    buildTeam,
    /** How the build stands, for `planPhase`. */
    buildState,
    /** The build is unfinished: words go to it. */
    building,
    talkTo: building ? buildSessionId : (mapConversation?.id ?? null),
  };
}

/** Words for one of the map's conversations, kept until it can take them. */
export interface LaterWord {
  id: string;
  /** The conversation they go to; `null` for a request to the map, which is prepared when it is sent. */
  to: string | null;
  text: string;
  /** For a request to the map about one card (a change to it): the card. */
  node?: string;
  /** Sending failed for another reason than the conversation being at work. */
  failed?: boolean;
}

const LATER_KEY = 'alpine.product-map.later';

/**
 * What I said to the map while its AI was at work: a conversation takes words only between its turns, so they wait
 * here (and across visits to other pages) and go as soon as it is free.
 */
export function useLaterWords(cwd: string) {
  const key = `${LATER_KEY}:${cwd}`;
  const [words, setWords] = useState<LaterWord[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(saved) ? (saved as LaterWord[]) : [];
    } catch {
      return [];
    }
  });
  const change = (next: (current: LaterWord[]) => LaterWord[]) =>
    setWords((current) => {
      const changed = next(current);
      try {
        if (changed.length) localStorage.setItem(key, JSON.stringify(changed));
        else localStorage.removeItem(key);
      } catch {
        // Kept for this visit only.
      }
      return changed;
    });
  return {
    words,
    add: (to: string | null, text: string, node?: string) =>
      change((current) => [...current, { id: `${Date.now()}-${current.length}`, to, text, ...(node ? { node } : {}) }]),
    drop: (id: string) => change((current) => current.filter((word) => word.id !== id)),
    /** Marks words as failed (or to be sent again); `to` is where they failed, when they went somewhere else. */
    fail: (id: string, failed: boolean, to?: string) =>
      change((current) =>
        current.map((word) => (word.id === id ? { ...word, failed, ...(to !== undefined ? { to } : {}) } : word)),
      ),
  };
}
