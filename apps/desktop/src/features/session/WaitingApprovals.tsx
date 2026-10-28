import { useMessages } from '@/shared/i18n';
import { useProjectApprovals, type ProjectApproval } from '@/shared/server';

import { ApprovalCard } from './ApprovalCard';
import { messages } from './messages';

/**
 * Every call of a project that waits for my OK, in one place that never scrolls away or hides behind anything: under
 * the conversation beside the map, right above the input. Whatever shows there (the map's conversation, the build's
 * record, a TF's agents, a developer tool), the cards are here: the map conversation's, the build's and its agents'.
 * The chat itself only says that a call waits, and where. Words in the input answer the last card, nearest it, so
 * only that one says to write there.
 */
export function WaitingApprovals({ cwd }: { cwd: string }) {
  const t = useMessages(messages);
  const waiting = useProjectApprovals(cwd);
  if (!waiting.length) return null;
  const who = ({ info }: ProjectApproval) =>
    info.purpose === 'map' ? t.whoMap : info.purpose === 'build' ? t.whoBuild : info.title || t.whoOther;
  return (
    <section
      aria-label={t.waitingHere}
      className="flex max-h-[40%] min-h-0 shrink-0 flex-col gap-2 overflow-y-auto border-t border-line bg-canvas p-3"
    >
      {waiting.map((one, index) => (
        <div key={one.approval.id} className="flex flex-col gap-1.5">
          <p className="px-1 text-meta text-fg-muted">{t.waitingFrom(who(one))}</p>
          <ApprovalCard
            sessionId={one.info.id}
            approval={one.approval}
            inputOnMap
            compact
            hint={index === waiting.length - 1}
          />
        </div>
      ))}
    </section>
  );
}
