import type { ReactNode } from 'react';

/** Props for {@link HeroPixelCanvas}. All visual knobs have safe defaults. */
export interface HeroPixelCanvasProps {
  /** Edge length of one LED cell in CSS pixels (16 = 1rem). Structural — changes rebuild the grid. @default 16 */
  pixelSize?: number;
  /**
   * Gutter between LED cells in CSS pixels. Must be a whole number so the
   * grid stays pixel-aligned (0.1rem ≈ 1.6px rounds to 2). Structural.
   * @default 2
   */
  gap?: number;
  /** Accent color for logo text, spectrogram and glitch flashes. @default '#4ade80' */
  accentColor?: string;
  /** Canvas / wrapper background color. @default '#0d0d0d' */
  backgroundColor?: string;
  /** Trigger the glitch scramble on canvas clicks. @default true */
  enableGlitchOnClick?: boolean;
  /**
   * Run the spectrum source in "live" mode. Currently intensifies the mock
   * signal; reserved for a real Web Audio AnalyserNode source.
   * @default false
   */
  audioReactivity?: boolean;
  /** Text rendered as pixel glyphs in the grid center (A–Z, 0–9). @default 'PIXEL' */
  logoText?: string;
  /** Extra class names for the outer wrapper (positioning, sizing, …). */
  className?: string;
  /** UI overlay rendered above the canvas (default: `pointer-events-none`). */
  children?: ReactNode;
}
