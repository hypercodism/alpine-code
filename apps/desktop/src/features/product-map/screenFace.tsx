import clsx from 'clsx';
import type { ReactNode } from 'react';

import { HtmlFrame } from '@/shared/components/html-frame';
import { FallingSnow } from '@/shared/components/snowscape';

import type { TreeCard } from './flowTreeModel';
import { LiveScreen, useLiveApp } from './liveScreens';
import { screenPage, screenWidthFor, type Device } from './planLook';

/**
 * What a frame shows: a capture of the running app, else the planned screen in the map's look (the look being tried,
 * while one is), else the sketch drawn from the code, else the empty frame with the screen's name.
 */
export function ScreenFace({
  card,
  device,
  ratio,
  look,
  touched,
  overlay,
}: {
  card: TreeCard;
  device: Device;
  ratio: number;
  look: string;
  touched: boolean;
  /** Drawn over the live screen, given its scale (the flow player's mark on the button that leads on). */
  overlay?: (scale: number) => ReactNode;
}) {
  const app = useLiveApp();
  const screen = card.screen;
  const face = !screen ? (
    <span className="flex size-full items-center justify-center p-4 text-center text-meta text-fg-faint">
      {card.title}
    </span>
  ) : screen.kind === 'planned' ? (
    <HtmlFrame
      html={screenPage(screen.src)}
      title=""
      pageWidth={screenWidthFor(screen.device ?? device)}
      ratio={ratio}
      theme={look}
      inert
    />
  ) : (
    <img src={screen.src} alt="" draggable={false} className="size-full object-contain object-top" />
  );
  return (
    <>
      <span
        className={clsx('block size-full transition-[filter] duration-(--motion-panel)', touched && 'blur-[1.5px]')}
      >
        {app && card.path && card.kind === 'screen' ? (
          <LiveScreen
            cardId={card.id}
            path={card.path}
            device={device}
            ratio={ratio}
            title={card.title}
            fallback={face}
            overlay={overlay}
          />
        ) : (
          face
        )}
      </span>
      {touched && (
        <span aria-hidden className="motion-content absolute inset-0 bg-brand-blue/15">
          <FallingSnow />
        </span>
      )}
    </>
  );
}
