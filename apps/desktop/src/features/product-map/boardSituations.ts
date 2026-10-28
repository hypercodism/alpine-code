import type { ScreenSituation, TreeCard } from './flowTreeModel';

/*
 * A screen's situations on the board (10-27): each one that belongs to this screen drawn under it, as large as it, as
 * a real screen of its own, and the ones every screen that loads something has (waiting, could not load, offline)
 * folded into a list of names, so the board shows what is particular to the product rather than the same spinner
 * five times.
 */

/** Waiting and connection, as the situations skill words them: the first load, slow, offline, the server fails. */
const COMMON_ID =
  /^(loading|load(ing)?-?(error|failed)|error|fetch-?(error|failed)|network(-error)?|offline|slow|timeout|timed-out|server-error)$/;
const COMMON_TITLE =
  /기다리는 동안|불러오는 (중|동안)|불러오지 못|연결이 끊|오프라인|느릴 때|시간이 (너무 )?오래|시간이 초과|서버가? .*(문제|오류|실패)|loading|could not load|couldn['’]t load|failed to load|offline|timed? out|slow/i;

/** A situation any screen that loads something has, rather than one of this product's own. */
export const isCommonSituation = (situation: ScreenSituation) =>
  COMMON_ID.test(situation.id) || COMMON_TITLE.test(situation.title);

/** What the board draws for a screen's situations: screens (its own, then proposals), and the common ones named. */
export function boardSituations(card: TreeCard): { framed: ScreenSituation[]; common: ScreenSituation[] } {
  const states = card.kind === 'screen' ? (card.states ?? []) : [];
  const framed = states.filter((one) => !isCommonSituation(one));
  return {
    framed: [...framed.filter((one) => one.handled !== false), ...framed.filter((one) => one.handled === false)],
    common: states.filter(isCommonSituation),
  };
}
