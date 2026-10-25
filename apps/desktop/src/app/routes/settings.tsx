import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { Settings, type SettingsTab } from '@/features/settings/Settings';

const TABS: SettingsTab[] = ['general', 'connection'];

interface Search {
  tab?: SettingsTab;
}

/** `?tab=` picks the tab. Any other value, like an old link to a tab that is gone, opens the first one. */
export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    // Spelled out even when unknown: the router keeps the raw `tab` otherwise.
    tab: TABS.includes(search.tab as SettingsTab) ? (search.tab as SettingsTab) : undefined,
  }),
  component: SettingsRoute,
});

function SettingsRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <main className="flex min-w-120 grow flex-col bg-canvas">
      <Settings tab={tab} onChange={(search) => void navigate({ to: '/settings', search, replace: true })} />
    </main>
  );
}
