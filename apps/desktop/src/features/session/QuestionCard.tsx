import type { ToolCallItem } from '@alpine/protocol';
import { Button } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { useState } from 'react';

import { HtmlFrame } from '@/shared/components/html-frame';
import { useMessages } from '@/shared/i18n';
import { answerTo, lookCss, pageOf, readQuestion, type Question, type QuestionOption } from '@/shared/questions';
import { useSendMessage, type Item } from '@/shared/server';

import { messages } from './messages';

/**
 * A question the agent asked me, under its call. Its pick comes first, marked 추천. Options without pages are
 * answered with one press; options with pages are drawn side by side at a phone's width, and one button answers with
 * the chosen one. Answering in the input instead works too. Once I answered, the card is the question in one quiet
 * line; my answer is my message under it.
 */
export function QuestionCard({
  sessionId,
  call,
  items,
  inputOnMap = false,
  pinned = false,
}: {
  sessionId: string;
  call: ToolCallItem;
  items: Item[];
  /** Shown beside the map: another answer is written in the map's input. */
  inputOnMap?: boolean;
  /** Answered in the bar under the conversation (a plan's map): the question in one line, never twice. */
  pinned?: boolean;
}) {
  const t = useMessages(messages);
  const question = readQuestion(call);
  if (!question) return null;
  if (pinned || answerTo(items, call, question)) return <p className="text-meta text-fg-muted">{question.text}</p>;

  return (
    <section
      aria-label={t.questionLabel}
      className="flex flex-col gap-3 rounded-xl border border-line bg-canvas-raised p-3"
    >
      <p className="text-title text-fg">{question.text}</p>
      {question.options.some((o) => pageOf(question, o)) ? (
        <WithPages sessionId={sessionId} question={question} />
      ) : (
        <Choices sessionId={sessionId} question={question} />
      )}
      <p className="text-meta text-fg-muted">{inputOnMap ? t.questionOtherMap : t.questionOther}</p>
    </section>
  );
}

function Choices({ sessionId, question }: { sessionId: string; question: Question }) {
  const t = useMessages(messages);
  const send = useSendMessage();
  return (
    <div className="flex flex-col gap-1">
      {question.options.map((o, i) => (
        <button
          key={o.label}
          type="button"
          disabled={send.isPending}
          onClick={() => send.mutate({ sessionId, text: o.label })}
          className="flex cursor-pointer flex-col rounded-lg px-2.5 py-2 text-left hover:bg-hover disabled:cursor-default"
        >
          <span className="flex items-baseline gap-1.5">
            <span className="text-body text-fg">{o.label}</span>
            {i === 0 && <span className="text-meta text-interactive">{t.questionRecommended}</span>}
          </span>
          {o.detail && <span className="text-meta text-fg-muted">{o.detail}</span>}
        </button>
      ))}
    </div>
  );
}

function WithPages({ sessionId, question }: { sessionId: string; question: Question }) {
  const t = useMessages(messages);
  const send = useSendMessage();
  const [chosen, setChosen] = useState(0);
  const option = question.options[chosen] ?? question.options[0];
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {question.options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={i === chosen}
            onClick={() => setChosen(i)}
            className={clsx(
              'flex cursor-pointer flex-col gap-1.5 rounded-lg p-1.5 text-left',
              i === chosen ? 'bg-selected' : 'hover:bg-hover',
            )}
          >
            <Page question={question} option={o} />
            <span className="flex items-baseline gap-1.5 px-0.5">
              <span className="truncate text-body text-fg">{o.label}</span>
              {i === 0 && <span className="shrink-0 text-meta text-interactive">{t.questionRecommended}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-start gap-3">
        <p className="min-w-0 grow text-body text-fg">{option.detail}</p>
        <Button
          variant="primary"
          disabled={send.isPending}
          onClick={() => send.mutate({ sessionId, text: option.label })}
        >
          {t.questionPick}
        </Button>
      </div>
    </>
  );
}

/** One option's page, drawn at a phone's width in its look and made smaller to fit the card: a picture. */
function Page({ question, option }: { question: Question; option: QuestionOption }) {
  return (
    <HtmlFrame
      html={pageOf(question, option)}
      title={option.label}
      pageWidth={390}
      ratio={1.6}
      theme={option.look ? lookCss(option.look) : ''}
      inert
      className="rounded-md border border-line-subtle bg-canvas"
    />
  );
}
