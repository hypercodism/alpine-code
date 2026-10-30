import type { MemoryReviewItem, ToolCallItem } from '@alpine/protocol';
import { LinkButton } from '@alpine/ui/primitives';

import { SuggestionCard, useMemoryWords } from '@/shared/components/memory';
import { useFormat, useMessages } from '@/shared/i18n';
import { openMemory } from '@/shared/navigation';
import { useMemory } from '@/shared/server';

import { messages } from './messages';

/**
 * A memory the agent suggested, under its call. While it waits it is a card to keep or decline; it does not hold up
 * the run. Once kept (here, in another window or on the memory page) it is one quiet line, and once declined
 * nothing. A later suggestion of this session that joined this one shows under that later call instead.
 */
export function MemoryCard({ sessionId, cwd, call }: { sessionId: string; cwd: string; call: ToolCallItem }) {
  const t = useMessages(messages);
  const words = useMemoryWords();
  const memory = useMemory(cwd);
  const headline = typeof call.args.headline === 'string' ? call.args.headline.trim() : '';
  const list = memory.data;
  if (!list || !headline) return null;

  const suggestion = list.pending.find(
    (s) => s.headline === headline && s.evidence.some((e) => e.sessionId === sessionId),
  );
  if (suggestion) return <SuggestionCard cwd={cwd} suggestion={suggestion} />;
  const kept = list.memories.find((m) => m.headline === headline);
  if (!kept) return null;
  return (
    <p className="text-meta text-fg-muted">
      {t.memoryKept(words.scope(kept.scope))} ·{' '}
      <LinkButton className="min-h-5 px-0.5" onClick={() => openMemory(cwd)}>
        {t.memoryOpen}
      </LinkButton>
    </p>
  );
}

/**
 * What the harness noticed about the memory at the end of a run, as one quiet line that opens the memory page,
 * where its suggestions wait. The model never sees it.
 */
export function MemoryReviewLine({ cwd, item }: { cwd: string; item: MemoryReviewItem }) {
  const t = useMessages(messages);
  const format = useFormat();
  const count = format.number(item.count);
  return (
    <p className="text-meta text-fg-muted">
      {item.source === 'missing_paths' ? t.review_missing_paths(count) : t.review_other(count)} ·{' '}
      <LinkButton className="min-h-5 px-0.5" onClick={() => openMemory(cwd)}>
        {t.reviewOpen} ›
      </LinkButton>
    </p>
  );
}
