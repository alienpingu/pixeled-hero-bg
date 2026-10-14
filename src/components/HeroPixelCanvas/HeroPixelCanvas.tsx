import { useRef } from 'react';
import type { HeroPixelCanvasProps } from './HeroPixelCanvasProps';
import { usePixelGridEngine } from './usePixelGridEngine';

export type { HeroPixelCanvasProps };

/**
 * Full-screen interactive pixel-grid background (LED matrix / cyberpunk hero).
 *
 * Renders a Pixi.js canvas behind an optional Tailwind-styled UI overlay.
 * The wrapper fills its parent box — give it a sized ancestor (e.g.
 * `h-screen w-screen` on a page section).
 *
 * ```tsx
 * <HeroPixelCanvas logoText="NEO" accentColor="#22d3ee">
 *   <nav className="pointer-events-auto ...">…</nav>
 * </HeroPixelCanvas>
 * ```
 */
export function HeroPixelCanvas({
  className = '',
  backgroundColor,
  children,
  ...configProps
}: HeroPixelCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  usePixelGridEngine(hostRef, { ...configProps, backgroundColor });

  return (
    <div
      className={`relative isolate overflow-hidden ${className}`}
      style={{ backgroundColor: backgroundColor ?? '#0d0d0d' }}
    >
      {/* Pixi canvas host — the engine appends its canvas here.
          touch-none/select-none: instant tap-to-glitch, no scroll/selection quirks. */}
      <div ref={hostRef} className="absolute inset-0 touch-none select-none" aria-hidden="true" />
      {/* UI overlay: transparent to pointer events except explicit children. */}
      <div className="pointer-events-none relative z-10 h-full w-full">{children}</div>
    </div>
  );
}
