import clsx from 'clsx';
import { useEffect, useRef } from 'react';

import { createSnowfall } from './snowfall';

/** Screen pixels per picture pixel: the snow is pixel art, like the snowscape's. */
const PIXEL = 2;

/**
 * Pixel snow falling over its parent (put it in a `relative` parent): the snowscape's snowfall alone, without the
 * landscape. It is only decoration, so it is hidden from assistive tech and takes no clicks; under reduced motion the
 * snow stands still.
 */
export function FallingSnow({ className, seed = 7 }: { className?: string; seed?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const parent = element?.parentElement;
    const context = element?.getContext('2d');
    if (!element || !parent || !context) return;
    let frame = 0;
    let stop = () => {};

    const start = () => {
      stop();
      const width = Math.max(1, Math.round(parent.clientWidth / PIXEL));
      const height = Math.max(1, Math.round(parent.clientHeight / PIXEL));
      element.width = width;
      element.height = height;
      element.style.width = `${width * PIXEL}px`;
      element.style.height = `${height * PIXEL}px`;
      const snow = createSnowfall(width, height, undefined, seed);
      if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        snow.draw(context);
        return;
      }
      let last = performance.now();
      const tick = (now: number) => {
        snow.step(Math.min(0.1, (now - last) / 1000));
        last = now;
        snow.draw(context);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      stop = () => cancelAnimationFrame(frame);
    };

    start();
    const observer = new ResizeObserver(start);
    observer.observe(parent);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [seed]);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={clsx('pointer-events-none absolute top-0 left-0', className)}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
