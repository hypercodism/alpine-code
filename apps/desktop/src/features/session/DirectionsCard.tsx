import type { ToolCallItem } from '@alpine/protocol';
import { Button } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { useState } from 'react';

import { HtmlFrame } from '@/shared/components/html-frame';
import { useMessages } from '@/shared/i18n';
import { useSendMessage, type Item } from '@/shared/server';

import { answerTo, readDirections } from './directions';
import { messages } from './messages';

/**
 * Ways a new app could look, drawn by the agent, under its call: small pages side by side to compare at a glance,
 * the chosen one large below, and one button that answers with it. The first one is the agent's pick. Answering in
 * the input instead works too. Once I answered, the card is one quiet line naming what I picked, or just the pages
 * without the button when I said something else.
 */
export function DirectionsCard({ sessionId, call, items }: { sessionId: string; call: ToolCallItem; items: Item[] }) {
  const t = useMessages(messages);
  const send = useSendMessage();
  const proposal = readDirections(call);
  const [chosen, setChosen] = useState(0);
  if (!proposal) return null;
  const answer = answerTo(items, call, proposal.options);
  if (answer?.picked) return <p className="text-meta text-fg-muted">{t.directionPicked(answer.picked.title)}</p>;

  const option = proposal.options[chosen] ?? proposal.options[0];
  return (
    <section
      aria-label={t.directionsLabel}
      className="flex flex-col gap-3 rounded-xl border border-line bg-canvas-raised p-3"
    >
      <p className="text-title text-fg">{proposal.question || t.directionsQuestion}</p>
      <div className="grid grid-cols-3 gap-2">
        {proposal.options.map((o, i) => (
          <button
            key={o.title}
            type="button"
            aria-pressed={i === chosen}
            onClick={() => setChosen(i)}
            className={clsx(
              'flex cursor-pointer flex-col gap-1.5 rounded-lg p-1.5 text-left',
              i === chosen ? 'bg-selected' : 'hover:bg-hover',
            )}
          >
            <Page html={o.html} title={o.title} height={0.625} inert />
            <span className="flex items-baseline gap-1.5 px-0.5">
              <span className="truncate text-body text-fg">{o.title}</span>
              {i === 0 && <span className="shrink-0 text-meta text-interactive">{t.directionRecommended}</span>}
            </span>
          </button>
        ))}
      </div>
      {/* Every large page stays loaded, one over the other, so picking another shows it at once. */}
      <div className="grid">
        {proposal.options.map((o, i) => (
          <div key={o.title} className={clsx('[grid-area:1/1]', i !== chosen && 'invisible')}>
            <Page html={o.html} title={o.title} height={0.56} inert={i !== chosen} />
          </div>
        ))}
      </div>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 grow flex-col">
          <p className="text-body text-fg">{option.summary}</p>
          {option.reference && <p className="text-meta text-fg-muted">{t.directionReference(option.reference)}</p>}
        </div>
        {!answer && (
          <Button
            variant="primary"
            disabled={send.isPending}
            onClick={() => send.mutate({ sessionId, text: t.directionMessage(option.title) })}
          >
            {t.directionPick}
          </Button>
        )}
      </div>
      {!answer && <p className="text-meta text-fg-muted">{t.directionsOther}</p>}
    </section>
  );
}

/** One page, drawn at a laptop's width and made smaller to fit the card. */
function Page({ html, title, height, inert }: { html: string; title: string; height: number; inert?: boolean }) {
  return (
    <HtmlFrame
      html={html}
      title={title}
      ratio={height}
      inert={inert}
      className="rounded-md border border-line-subtle bg-canvas"
    />
  );
}
