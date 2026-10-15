import type { ReactNode } from 'react';

/** Props for {@link HeroPixelCanvas}. All visual knobs have safe defaults. */
export interface HeroPixelCanvasProps {
  /** Edge length of one LED cell in CSS pixels (16 = 1rem). Acts as the maximum when `responsive`. @default 16 */
  pixelSize?: number;
  /**
   * Gutter between LED cells in CSS pixels. Must be a whole number so the
   * grid stays pixel-aligned (0.1rem ≈ 1.6px rounds to 2). Acts as the
   * maximum when `responsive`.
   * @default 2
   */
  gap?: number;
  /**
   * Shrink cells on narrow screens so the grid keeps ~64 columns
   * (phones get ~5–8px LEDs instead of a clipped matrix).
   * @default true
   */
  responsive?: boolean;
  /** Smallest allowed LED edge when `responsive` is on. @default 5 */
  minPixelSize?: number;
  /** Accent color for logo text, spectrogram and glitch flashes. @default '#4ade80' */
  accentColor?: string;
  /** Canvas / wrapper background color. @default '#0d0d0d' */
  backgroundColor?: string;
  /** Trigger the glitch scramble on canvas clicks. @default true */
  enableGlitchOnClick?: boolean;
  /**
   * Analyse the real audio track and pump the spectrogram on its rhythm.
   * Falls back to an intensified mock signal if the track fails to load.
   * @default false
   */
  audioReactivity?: boolean;
  /** URL of the looping music track (same-origin asset under `public/`). @default '/song.mp3' */
  audioSrc?: string;
  /** Start with the music muted; a small toggle is rendered bottom-right. @default true */
  muted?: boolean;
  /** Text rendered as pixel glyphs in the grid center (A–Z, 0–9). @default 'PIXEL' */
  logoText?: string;
  /** Extra class names for the outer wrapper (positioning, sizing, …). */
  className?: string;
  /** UI overlay rendered above the canvas (default: `pointer-events-none`). */
  children?: ReactNode;
}
