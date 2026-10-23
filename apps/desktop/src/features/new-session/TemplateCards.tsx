import type { JudgedNew } from '@alpine/protocol';
import { Collapse } from '@alpine/ui/primitives';
import clsx from 'clsx';
import { Feather, Layers, Smartphone, SquareDashed, type LucideIcon } from 'lucide-react';

import { useMessages } from '@/shared/i18n';
import type { TemplateId } from '@/shared/server';

import { messages } from './messages';

export interface Template {
  id: TemplateId;
  icon: LucideIcon;
  /** The tile behind the icon: a soft fill with the ink of the same hue, from the avatar palette. */
  tile: string;
  name: string;
  short: string;
  points: string[];
  stack?: string;
  badge?: string;
  soon?: boolean;
}

/**
 * The setups the app shows. Without Alpine Cloud (`cloud` false) nothing that needs it is offered or promised: no
 * realtime web app (it lives on the cloud's database), and no web address, visitors, hosting or putting it on the
 * internet.
 */
export function useTemplates(cloud: boolean): Template[] {
  const t = useMessages(messages);
  const all: Template[] = [
    {
      id: 'blank',
      icon: SquareDashed,
      tile: 'bg-avatar-7 text-avatar-7-ink',
      name: t.blank,
      short: t.blankShort,
      points: cloud ? [t.blankPoint1, t.blankPoint2] : [t.blankPoint1],
    },
    {
      id: 'web-lite',
      icon: Feather,
      tile: 'bg-avatar-1 text-avatar-1-ink',
      name: t.lite,
      short: cloud ? t.liteShort : t.liteShortLocal,
      // Visitors and where it runs only matter once it is on the internet, which needs Alpine Cloud.
      points: cloud ? [t.litePoint1, t.litePoint2, t.litePoint3] : [t.litePoint1Local],
      stack: cloud ? 'React · Hono · Cloudflare D1' : undefined,
    },
    {
      id: 'web-pro',
      icon: Layers,
      tile: 'bg-avatar-2 text-avatar-2-ink',
      name: t.pro,
      short: t.proShort,
      points: [t.proPoint1, t.proPoint2, t.proPoint3, t.proPoint4, t.proPoint5],
      stack: 'React · Supabase',
      badge: t.proBadge,
    },
    {
      id: 'mobile',
      icon: Smartphone,
      tile: 'bg-avatar-3 text-avatar-3-ink',
      name: t.mobile,
      short: t.mobileShort,
      points: [],
      stack: 'Expo',
      soon: true,
    },
  ];
  return cloud ? all : all.filter((template) => template.id !== 'web-pro');
}

/**
 * The setups side by side (decisions 5, 6 and 13 in docs/alpine-cloud.md), shown once the agent has judged that
 * what I wrote is a new app. Its pick comes chosen with a 추천 mark and its reason (no line when it gave none); I can
 * choose another. Without a `recommendation` nobody picked: no mark, no reason. What each means is on its card, and the
 * chosen one opens its details under the row.
 */
export function TemplateCards({
  templates,
  value,
  onChange,
  recommendation,
}: {
  templates: Template[];
  value: TemplateId;
  onChange: (value: TemplateId) => void;
  recommendation?: Pick<JudgedNew, 'template' | 'reason'>;
}) {
  const t = useMessages(messages);
  const chosen = templates.find((template) => template.id === value);
  return (
    <div className="flex w-full flex-col gap-2">
      <div
        role="radiogroup"
        aria-label={t.setups}
        className={clsx('grid gap-2', templates.length > 3 ? 'grid-cols-4' : 'grid-cols-3')}
      >
        {templates.map((template, index) => {
          const selected = template.id === value;
          const picked = recommendation?.template === template.id;
          const Icon = template.icon;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={template.soon}
              onClick={() => onChange(template.id)}
              style={{ animationDelay: `${index * 50}ms` }}
              className={clsx(
                'motion-step group flex min-h-36 cursor-pointer flex-col items-start gap-2 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow,translate] disabled:cursor-default',
                selected
                  ? 'border-interactive bg-selected'
                  : 'border-line bg-canvas-raised hover:-translate-y-0.5 hover:shadow-overlay disabled:hover:translate-y-0 disabled:hover:shadow-none',
              )}
            >
              <span
                aria-hidden="true"
                className={clsx(
                  'flex size-9 items-center justify-center rounded-lg transition-transform duration-(--motion-normal) group-disabled:opacity-50',
                  template.tile,
                  !template.soon && 'group-hover:scale-105',
                )}
              >
                <Icon size={18} strokeWidth={1.75} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-body font-medium text-fg group-disabled:text-fg-muted">{template.name}</span>
                <span className="line-clamp-2 text-meta text-fg-muted">{template.short}</span>
              </span>
              <span className="mt-auto flex flex-wrap gap-1">
                {picked && (
                  <span className="motion-step rounded-full bg-interactive px-2 text-meta text-on-fill">
                    {t.recommended}
                  </span>
                )}
                {template.badge && <Pill>{template.badge}</Pill>}
                {template.soon && <Pill>{t.soon}</Pill>}
              </span>
            </button>
          );
        })}
      </div>
      {recommendation?.reason && <p className="motion-step px-1 text-meta text-interactive">{recommendation.reason}</p>}
      <Collapse open={!!chosen && chosen.points.length > 0}>
        {chosen && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-line-subtle bg-canvas-raised px-4 py-3">
            <ul className="flex flex-col gap-1">
              {chosen.points.map((point) => (
                <li key={point} className="flex gap-2 text-meta text-fg">
                  <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-fg-faint" />
                  {point}
                </li>
              ))}
            </ul>
            {chosen.stack && <p className="font-mono text-meta text-fg-faint">{chosen.stack}</p>}
          </div>
        )}
      </Collapse>
    </div>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-line bg-canvas-raised px-2 text-meta whitespace-nowrap text-fg-muted">
      {children}
    </span>
  );
}
