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

/** Gray tint (0xRRGGBB) for a normalized brightness `t` in [0,1]. */
export function grayRamp(t: number): number {
  const v = Math.round(lerp(0x14, 0x38, clamp01(t)));
  return (v << 16) | (v << 8) | v;
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
