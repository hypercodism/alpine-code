import type { FlowGetResult } from '@alpine/protocol';
import { useMemo, useState, type ReactNode } from 'react';

import { useMessages } from '@/shared/i18n';
import type { Item } from '@/shared/server';

import type { TreeMap } from './flowTreeModel';
import { buildActivity, mapLook, pendingQuestion, planPhase, toPlan } from './planData';
import { PlanMap } from './PlanMap';
import { planMessages } from './planMessages';

/**
 * A map that began as the plan of a new product, shown as the plan: the real map files and the map's conversation
 * in place of the prototype's script. Everything I answer goes to that conversation as my own words; the AI changes
 * the map files and asks the next thing.
 */
export function PlannedMap({
  board,
  tree,
  items,
  working,
  onSay,
  onBuild,
  onOpenApp,
  headerEnd,
}: {
  board: FlowGetResult;
  tree: TreeMap;
  /** The map conversation's items, for the question it is waiting on. */
  items: Item[];
  /** The map's conversation is running. */
  working: boolean;
  /** Sends my words to the map's conversation. */
  onSay: (text: string) => void;
  onBuild: () => void;
  onOpenApp: () => void;
  headerEnd?: ReactNode;
}) {
  const t = useMessages(planMessages);
  const plan = useMemo(() => toPlan(board, tree), [board, tree]);
  const pending = useMemo(() => (working ? null : pendingQuestion(items)), [items, working]);
  const question = pending?.question ?? null;
  const phase = planPhase(plan, board, working, !!question);
  const [preview, setPreview] = useState<{ question: string; option: number } | null>(null);
  const previewing = question && preview?.question === question.id ? preview.option : 0;
  const [reviewing, setReviewing] = useState<string | null>(null);
  // Looking at a look option restyles every screen on the map at once; until then the map wears its own look.
  const shown = question?.options[previewing]?.look ?? (board.look ? mapLook(board.look) : null);
  const reviewed = reviewing ? plan.cards[reviewing]?.decided : undefined;
  const activity =
    phase === 'building'
      ? (buildActivity(items, board, {
          onCard: t.activityOnCard,
          editing: t.activityEditing,
          running: t.activityRunning,
          reading: t.activityReading,
          thinking: t.activityThinking,
        }) ?? { text: t.activityThinking, touching: [] })
      : null;

  return (
    <PlanMap
      plan={plan}
      phase={phase}
      question={question}
      left={board.undecided?.length ?? 0}
      look={shown}
      preview={previewing}
      thinking={working && phase === 'asking'}
      activity={activity}
      reviewing={reviewing}
      sample={pending?.sample || Object.values(plan.cards).find((card) => card.sketch)?.sketch || ''}
      onAnswer={(option) => {
        const label = question?.options[option]?.label;
        if (label) onSay(label);
      }}
      onAnswerInWords={onSay}
      onPreview={(option) => question && setPreview({ question: question.id, option })}
      onDecideRest={() => onSay(t.decideRestMessage)}
      onBuild={onBuild}
      onReview={setReviewing}
      onDecide={(option) => {
        const card = reviewing ? plan.cards[reviewing] : undefined;
        const label = reviewed?.question.options[option]?.label;
        if (card && reviewed && label) onSay(t.changeDecisionMessage(card.title, reviewed.question.text, label));
        setReviewing(null);
      }}
      onOpenApp={onOpenApp}
      headerEnd={headerEnd}
    />
  );
}
