import { useRef, useState } from 'react';
import { DEFAULT_CONFIG } from '../../pixi/types';
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
 * With `audioReactivity` enabled the engine analyses `audioSrc` and a small
 * mute toggle appears bottom-right. The equalizer (and the text/grid beat
 * reaction) is shown only while the music is ON: it stays hidden until the
 * first click starts playback with sound, and fades out on mute.
 *
 * ```tsx
 * <HeroPixelCanvas logoText="NEO" accentColor="#22d3ee" audioReactivity>
 *   <nav className="pointer-events-auto ...">…</nav>
 * </HeroPixelCanvas>
 * ```
 */
export function HeroPixelCanvas({
  className = '',
  backgroundColor,
  muted: initialMuted,
  children,
  ...configProps
}: HeroPixelCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [muted, setMutedState] = useState(initialMuted ?? true);
  const engineRef = usePixelGridEngine(hostRef, { ...configProps, muted });

  const audioEnabled =
    (configProps.audioReactivity ?? DEFAULT_CONFIG.audioReactivity) &&
    !!(configProps.audioSrc ?? DEFAULT_CONFIG.audioSrc);

  // Runs synchronously inside the click's user-activation window so the
  // AudioContext can resume immediately — the props→setConfig path lands a
  // render later, which can miss Safari's gesture allowance.
  const toggleSound = () => {
    const next = !muted;
    setMutedState(next);
    engineRef.current?.setMuted(next);
  };

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
      {audioEnabled && (
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={!muted}
          aria-label={muted ? 'Unmute ambient music' : 'Mute ambient music'}
          className="absolute right-4 bottom-4 z-20 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/40 text-neutral-400 backdrop-blur transition-colors hover:border-white/40 hover:text-neutral-100"
        >
          {muted ? <IconMuted /> : <IconPlaying />}
        </button>
      )}
    </div>
  );
}

function IconPlaying() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function IconMuted() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}
