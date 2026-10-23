import { useMessages } from '@/shared/i18n';

import { messages } from './messages';

/** What the server said when something failed, folded away: it is in English and for whoever has to look into it. */
export function ErrorDetail({ detail }: { detail: string | null }) {
  const t = useMessages(messages);
  if (!detail) return null;
  return (
    <details className="text-meta text-fg-muted">
      <summary className="cursor-pointer">{t.errorDetail}</summary>
      <p className="mt-1 font-mono break-words">{detail}</p>
    </details>
  );
}
