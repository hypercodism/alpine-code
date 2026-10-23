import { useCallback, useEffect, useRef, useState } from 'react';

import {
  drawnSoFar,
  planOrder,
  withCard,
  type Plan,
  type PlanActivity,
  type PlanBuildStep,
  type PlanPhase,
  type PlanQuestion,
} from './planModel';
import type { PlanLook } from './planThemes';

/**
 * A planned map that plays by itself, for the stories, as the AI would make it go: the first guess drawn card by
 * card, then one question at a time (a moment of "changing the map" between them), then built in the AI's own order
 * once the person says so. In the app the agent does all of this; the screen only shows what it gets.
 */

export type ScriptStart = 'drawing' | 'ready' | 'building' | 'built' | { question: number };

export interface PlanScriptState {
  phase: PlanPhase;
  plan: Plan;
  /** The question being asked, while asking. */
  question: PlanQuestion | null;
  /** How many questions are still open, this one included. */
  left: number;
  /** The look the sketches wear; while the look is being asked, the option being looked at. */
  look: PlanLook | null;
  /** Which option of the look question is being looked at. */
  preview: number;
  /** Between an answer and the next question. */
  thinking: boolean;
  /** What the AI is doing while building. */
  activity: PlanActivity | null;
  /** The card whose question, answered by the AI while building, the person opened. */
  reviewing: string | null;
}

const DRAW_MS = 260;
const THINK_MS = 650;
const AI_PICKED = 'AI가 정함';

/** The plan with `question` answered by `option`; when the AI answered it, the card says so. */
function answered(plan: Plan, question: PlanQuestion, option: number, byAi = false): Plan {
  const picked = question.options[option];
  let next = picked?.apply ? picked.apply(plan) : plan;
  if (byAi && question.about)
    next = withCard(next, question.about, (c) => ({ ...c, note: c.note ? `${c.note} · ${AI_PICKED}` : AI_PICKED }));
  return next;
}

const recommended = (question: PlanQuestion) =>
  Math.max(
    0,
    question.options.findIndex((o) => o.recommended),
  );
const lookOf = (question: PlanQuestion | undefined, option: number) => question?.options[option]?.look ?? null;

/** A step whose work is only on cards the map no longer has (the person chose to leave them out) does not happen. */
const happens = (plan: Plan, step: PlanBuildStep) =>
  !step.activity?.touching.length || step.activity.touching.some((id) => plan.cards[id]);

/** The map as it is once every step of building happened. */
const built = (plan: Plan, steps: PlanBuildStep[]): Plan =>
  steps.reduce((p, step) => (happens(p, step) && step.change ? step.change(p) : p), plan);

function initial(draft: Plan, questions: PlanQuestion[], steps: PlanBuildStep[], start: ScriptStart): PlanScriptState {
  const upTo = start === 'drawing' ? 0 : typeof start === 'object' ? start.question : questions.length;
  let plan = draft;
  let look: PlanLook | null = null;
  for (const question of questions.slice(0, upTo)) {
    plan = answered(plan, question, recommended(question));
    look = lookOf(question, recommended(question)) ?? look;
  }
  const question = typeof start === 'object' ? (questions[start.question] ?? null) : null;
  const preview = question ? recommended(question) : 0;
  return {
    phase: start === 'drawing' ? 'drawing' : typeof start === 'object' ? 'asking' : start === 'ready' ? 'ready' : start,
    plan: start === 'built' ? built(plan, steps) : plan,
    question,
    left: questions.length - upTo,
    look: lookOf(question ?? undefined, preview) ?? look,
    preview,
    thinking: false,
    activity: null,
    reviewing: null,
  };
}

export function usePlanScript(
  draft: Plan,
  questions: PlanQuestion[],
  steps: PlanBuildStep[],
  start: ScriptStart = 'drawing',
) {
  const [state, setState] = useState(() => initial(draft, questions, steps, start));
  const [drawn, setDrawn] = useState(start === 'drawing' ? 0 : Infinity);
  const asked = useRef(typeof start === 'object' ? start.question : start === 'drawing' ? -1 : questions.length);
  const timers = useRef<number[]>([]);
  const later = useCallback((ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  }, []);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  /** Asks the question after `index`, or says everything is decided. */
  const askNext = useCallback(
    (index: number) => {
      setState((s) => ({ ...s, thinking: true }));
      later(THINK_MS, () => {
        asked.current = index + 1;
        const question = questions[index + 1] ?? null;
        setState((s) => {
          const preview = question ? recommended(question) : 0;
          return {
            ...s,
            thinking: false,
            question,
            phase: question ? 'asking' : 'ready',
            left: questions.length - index - 1,
            preview,
            look: lookOf(question ?? undefined, preview) ?? s.look,
          };
        });
      });
    },
    [later, questions],
  );

  // The first guess, a card at a time, then the first question.
  const total = planOrder(draft).length;
  useEffect(() => {
    if (state.phase !== 'drawing') return;
    if (drawn < total) {
      later(DRAW_MS, () => setDrawn((n) => n + 1));
      return;
    }
    later(DRAW_MS, () => askNext(-1));
  }, [state.phase, drawn, total, later, askNext]);

  const answer = (option: number) => {
    const question = state.question;
    if (!question || state.thinking) return;
    setState((s) => ({
      ...s,
      plan: answered(s.plan, question, option),
      look: lookOf(question, option) ?? s.look,
    }));
    askNext(asked.current);
  };

  /** Answers in my own words: the AI takes it as its pick and notes what I said on the card. */
  const answerInWords = (words: string) => {
    const question = state.question;
    if (!question || state.thinking) return;
    setState((s) => {
      let plan = answered(s.plan, question, recommended(question));
      if (question.about) plan = withCard(plan, question.about, (c) => ({ ...c, note: `“${words}”` }));
      return { ...s, plan };
    });
    askNext(asked.current);
  };

  const lookAt = (option: number) =>
    setState((s) => (s.question ? { ...s, preview: option, look: lookOf(s.question, option) ?? s.look } : s));

  /** The AI answers every open question with its own pick, and the cards say so. */
  const decideRest = () => {
    setState((s) => {
      let plan = s.plan;
      let look = s.look;
      for (const question of questions.slice(Math.max(0, asked.current))) {
        plan = answered(plan, question, recommended(question), true);
        look = lookOf(question, recommended(question)) ?? look;
      }
      return { ...s, plan, look, question: null, left: 0, phase: 'ready' };
    });
    asked.current = questions.length;
  };

  /** Building: the AI's steps one after another, each saying what it does and changing the map only on facts. */
  const build = () => {
    setState((s) => ({ ...s, phase: 'building' }));
    let at = 0;
    steps.forEach((step, i) => {
      at += step.wait;
      later(at, () =>
        setState((s) => {
          if (!happens(s.plan, step)) return s;
          const last = i === steps.length - 1;
          return {
            ...s,
            plan: step.change ? step.change(s.plan) : s.plan,
            activity: step.activity,
            phase: last ? 'built' : s.phase,
          };
        }),
      );
    });
  };

  /** Opens a question the AI answered while building; nothing stops meanwhile. */
  const review = (cardId: string | null) => setState((s) => ({ ...s, reviewing: cardId }));

  /** The person's own pick for a question the AI answered while building. */
  const decide = (option: number) =>
    setState((s) => {
      const cardId = s.reviewing;
      const decided = cardId ? s.plan.cards[cardId]?.decided : undefined;
      const picked = decided?.question.options[option];
      if (!cardId || !decided || !picked) return s;
      const plan = withCard(picked.apply ? picked.apply(s.plan) : s.plan, cardId, (c) => ({
        ...c,
        decided: undefined,
        note: picked.label,
      }));
      return { ...s, plan, reviewing: null };
    });

  return {
    ...state,
    plan: state.phase === 'drawing' ? drawnSoFar(state.plan, drawn) : state.plan,
    answer,
    answerInWords,
    lookAt,
    decideRest,
    build,
    review,
    decide,
  };
}
