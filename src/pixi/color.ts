import { Color } from 'pixi.js';

/** Convert any CSS color source to a Pixi numeric color (0xRRGGBB). */
export function toPixiColor(source: string): number {
  return new Color(source).toNumber();
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Exponential smoothing factor that is frame-rate independent. */
export function expDamp(dtMs: number, halfLifeMs: number): number {
  return 1 - Math.pow(0.5, dtMs / halfLifeMs);
}

/** Linear RGB mix of two 0xRRGGBB colors. */
export function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}

/** Dim/bright endpoints of the LED field's gray ramp (0xRRGGBB). */
export interface GrayRamp {
  dim: number;
  bright: number;
}

/** Scale each channel of a 0xRRGGBB color by `k` (clamped to 255). */
function scaleColor(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((c & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

/**
 * Derive the noise field's gray ramp from the theme background: unlit LEDs
 * sit a touch darker than the panel, lit ones brighter. Per-channel scaling
 * keeps each palette's own hue in the static (purple on Catppuccin, blue on
 * Nord…) instead of a fixed neutral gray.
 */
export function rampFromBackground(background: number): GrayRamp {
  return { dim: scaleColor(background, 0.6), bright: scaleColor(background, 2.0) };
}

/** Field tint (0xRRGGBB) for a normalized brightness `t` in [0,1]. */
export function grayRamp(ramp: GrayRamp, t: number): number {
  return mixColor(ramp.dim, ramp.bright, clamp01(t));
}
