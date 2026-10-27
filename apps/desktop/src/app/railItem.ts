import clsx from 'clsx';

/** The look of every rail item: the icon over its word, always both. */
export const railItem = (on: boolean) =>
  clsx(
    'relative flex w-12.5 flex-col items-center gap-0.5 rounded-lg pt-1.5 pb-1 text-meta outline-none focus-visible:ring-2 focus-visible:ring-interactive',
    on ? 'bg-selected font-semibold text-fg' : 'text-fg-muted',
  );
