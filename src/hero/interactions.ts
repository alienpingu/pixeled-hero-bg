import type { PointerOptions } from './options';

export interface RectCss {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface GlowSource {
  x: number;
  y: number;
  strength: number;
  /** Reach in device px. */
  reach: number;
}

export interface StampWave {
  x: number;
  y: number;
  /** Current ring radius in device px. */
  cellPx: number;
  amp: number;
}

export interface FxGeometry {
  /** Cell pitch in device px. */
  cellW: number;
  cellH: number;
  /** Glyph box origin + size in grid cells (device origin included). */
  glyphX: number;
  glyphY: number;
  cols: number;
  rows: number;
  /** Canvas size in device px. */
  canvasW: number;
  canvasH: number;
  /** Canvas origin in CSS viewport px — converts device coords for proximity. */
  hostX: number;
  hostY: number;
}

/** The 15×15 stamp brush — a chiselled ring outline (omarchy's `he`). */
export const STAMP_MASK = [
  '111111111111111',
  '100000010000001',
  '101111110001101',
  '101000000000101',
  '101000000000101',
  '101000000000101',
  '101000000000101',
  '111000000000101',
  '101000000000101',
  '101000000000101',
  '101000000000101',
  '101000000000101',
  '101111111111101',
  '100000010000001',
  '111111110111111',
];

interface FinishedStamp {
  x: number;
  y: number;
  born: number;
  from: number;
  to: number;
  life: number;
}

interface PendingCharge {
  x: number;
  y: number;
  start: number;
}

const rand = ([a, b]: [number, number]) => a + Math.random() * (b - a);

/**
 * All pointer-driven state except rendering: proximity glow (pointer + drifting
 * ambient), press-charge → stamp ripples, and idle auto-ripples. Positions are
 * device px against the canvas; quiet rects stay CSS px so proximity is
 * DPR-independent, matching how users perceive the fade near interactive text.
 */
export class PointerFx {
  private quiet: RectCss[] = [];
  private g = 0; // pointer strength target
  private w = 0; // smoothed pointer strength
  private px = -1e4;
  private py = -1e4;
  private ambientX = 0;
  private ambientY = 0;
  private ambientStrength = 0;

  private stamps: FinishedStamp[] = [];
  private charge: PendingCharge | null = null;
  private auto: PendingCharge & { level: number } | null = null;
  private nextAuto = Infinity;

  private finePointer: boolean;
  private dpr = 1;
  private geom: FxGeometry = {
    cellW: 16,
    cellH: 16,
    glyphX: 0,
    glyphY: 0,
    cols: 0,
    rows: 0,
    canvasW: 0,
    canvasH: 0,
    hostX: 0,
    hostY: 0,
  };
  private overlayOpen = false;
  private pointerInside = false;

  private opts: PointerOptions;
  private quietDistance: number;
  private quietExponent: number;

  constructor(opts: PointerOptions, quietDistance: number, quietExponent: number) {
    this.opts = opts;
    this.quietDistance = quietDistance;
    this.quietExponent = quietExponent;
    this.finePointer =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  setOptions(opts: PointerOptions): void {
    this.opts = opts;
  }

  setDpr(dpr: number): void {
    this.dpr = dpr;
  }

  setGeometry(geom: FxGeometry): void {
    this.geom = geom;
    if (this.nextAuto === Infinity && this.opts.autoRipples) {
      this.nextAuto = performance.now() + rand(this.opts.rippleDelay) * 1000;
    }
  }

  setQuietRects(rects: RectCss[]): void {
    this.quiet = rects;
  }

  setQuietProfile(distance: number, exponent: number): void {
    this.quietDistance = distance;
    this.quietExponent = exponent;
  }

  /** Proximity in CSS viewport px (quiet rects are viewport-relative). */
  private proximityAtDevice(xDev: number, yDev: number): number {
    return this.proximity(this.geom.hostX + xDev / this.dpr, this.geom.hostY + yDev / this.dpr);
  }

  /** True when canvas-space (x, y) lands inside the glyph box. */
  insideGlyph(x: number, y: number): boolean {
    const g = this.geom;
    return (
      x >= g.glyphX &&
      y >= g.glyphY &&
      x < g.glyphX + g.cols * g.cellW &&
      y < g.glyphY + g.rows * g.cellH
    );
  }

  /** Distance-based proximity to interactive elements: 1 far away, 0 on top. */
  proximity(xCss: number, yCss: number): number {
    if (this.quiet.length === 0) return 1;
    let min = Infinity;
    for (const r of this.quiet) {
      const dx = Math.max(r.l - xCss, 0, xCss - r.r);
      const dy = Math.max(r.t - yCss, 0, yCss - r.b);
      const d = Math.hypot(dx, dy);
      if (d < min) min = d;
    }
    if (min >= this.quietDistance) return 1;
    return (min / this.quietDistance) ** this.quietExponent;
  }

  /**
   * `x`/`y` are device px relative to the canvas; `inside` = pointer within
   * the hero host box.
   */
  pointerMove(x: number, y: number, inside: boolean): void {
    this.pointerInside = inside;
    this.px = x;
    this.py = y;
    if (!this.charge && !this.overlayOpen) {
      this.g = inside ? this.proximityAtDevice(x, y) * this.opts.strength : 0;
    }
  }

  /**
   * Register a press. `glyphPress` taps are routed by the engine to
   * `onGlyphPress`; taps on interactive targets never stamp.
   */
  pointerDown(x: number, y: number, interactiveTarget: boolean, glyphPress: boolean): void {
    if (glyphPress) return;
    if (interactiveTarget) {
      this.g = 0;
      this.charge = null;
      return;
    }
    this.g = 0;
    if (this.opts.stamps) this.charge = { x, y, start: performance.now() };
  }

  pointerUp(inside: boolean): void {
    const now = performance.now();
    this.pointerInside = inside;
    if (this.charge) {
      this.spawnStamp(this.charge.x, this.charge.y, this.progress(now, this.charge.start), now);
      this.charge = null;
    }
    if (this.finePointer && !this.overlayOpen) {
      this.g = this.pointerInside ? this.proximityAtDevice(this.px, this.py) * this.opts.strength : 0;
    } else {
      this.g = 0;
    }
  }

  pointerCancel(): void {
    this.charge = null;
  }

  pointerLeave(): void {
    this.pointerInside = false;
    this.g = 0;
  }

  setOverlayOpen(open: boolean): void {
    this.overlayOpen = open;
    if (open) {
      this.g = 0;
      this.charge = null;
    }
  }

  /** Advance smoothing, ambient drift and the auto-ripple cycle. */
  update(now: number, revealActive: boolean): void {
    if (this.opts.ambient) {
      const e = now / 1000;
      const g = this.geom;
      const ax = 0.44 * (1 + 0.1 * Math.sin(e * 0.11));
      const ay = 0.38 * (1 + 0.1 * Math.sin(e * 0.09 + 2));
      this.ambientX = g.canvasW * (0.5 + ax * Math.sin(e * 0.65));
      this.ambientY = g.canvasH * (0.48 + ay * Math.sin(e * 0.39 + 1.1));
      let r = this.proximityAtDevice(g.glyphX + this.ambientX, g.glyphY + this.ambientY) * this.opts.strength;
      if (!revealActive && this.opts.autoRipples) {
        if (!this.auto && now >= this.nextAuto) {
          this.auto = { x: this.ambientX, y: this.ambientY, start: now, level: rand(this.opts.rippleCharge) };
        }
        if (this.auto) {
          this.auto.x = this.ambientX;
          this.auto.y = this.ambientY;
          r *= this.opts.autoGlowDim;
          if (this.progress(now, this.auto.start) >= this.auto.level) {
            this.spawnStamp(this.auto.x, this.auto.y, this.auto.level, now);
            this.auto = null;
            this.nextAuto = now + rand(this.opts.rippleRepeat) * 1000;
          }
        }
      }
      this.ambientStrength += (r - this.ambientStrength) * this.opts.ambientSmoothing;
    }

    this.w += (this.g - this.w) * this.opts.smoothing;
    this.stamps = this.stamps.filter((s) => (now - s.born) / 1000 < s.life);
  }

  /** Glow sources to fold into the field/glyph intensity, in draw order. */
  glows(beat: number): GlowSource[] {
    const out: GlowSource[] = [];
    const reach = (s: number) =>
      this.opts.reachCells * this.geom.cellW * (0.45 + 0.55 * s) * (1 + this.opts.beatBoost * beat);
    if (this.w > 0.01) out.push({ x: this.px, y: this.py, strength: this.w, reach: reach(this.w) });
    if (this.opts.ambient && this.ambientStrength > 0.01) {
      out.push({
        x: this.ambientX,
        y: this.ambientY,
        strength: this.ambientStrength,
        reach: reach(this.ambientStrength),
      });
    }
    return out;
  }

  /** Expanding stamp rings: finished stamps + in-flight charges. */
  waves(now: number): StampWave[] {
    const out: StampWave[] = [];
    for (const s of this.stamps) {
      const n = (now - s.born) / 1000 / s.life;
      const ease = 1 - (1 - n) ** 3;
      out.push({
        x: s.x,
        y: s.y,
        cellPx: this.geom.cellW * (s.from + (s.to - s.from) * ease),
        amp: (1 - n) ** 1.7,
      });
    }
    const pendings: Array<PendingCharge & { level?: number }> = [];
    if (this.charge) pendings.push(this.charge);
    if (this.auto) pendings.push(this.auto);
    for (const c of pendings) {
      const shown = Math.min(this.progress(now, c.start), c.level ?? 1);
      out.push({
        x: c.x,
        y: c.y,
        cellPx: this.geom.cellW * (this.opts.stampBase + this.opts.stampGrowth * shown),
        amp: 0.9,
      });
    }
    return out;
  }

  /** Whether the cursor should read as clickable over the glyph box. */
  pressable(): boolean {
    return this.opts.glyphCursor && this.pointerInside;
  }

  /** Sample the active stamp rings at a canvas point → effect intensity 0..~1. */
  stampAt(x: number, y: number, waves: StampWave[]): number {
    if (waves.length === 0) return 0;
    let a = 0;
    const half = this.opts.stampSize / 2;
    for (const s of waves) {
      const i = Math.floor((x - s.x) / s.cellPx + half);
      const r = Math.floor((y - s.y) / s.cellPx + half);
      if (i < 0 || r < 0 || i >= this.opts.stampSize || r >= this.opts.stampSize) continue;
      if (STAMP_MASK[r][i] === '1' && s.amp > a) a = s.amp;
    }
    return a;
  }

  private progress(now: number, start: number): number {
    return Math.min((now - start) / 1000 / this.opts.chargeSeconds, 1);
  }

  private spawnStamp(x: number, y: number, charge: number, now: number): void {
    const base = this.opts.stampBase + this.opts.stampGrowth * charge;
    const jitter = () => 0.92 + Math.random() * 0.16;
    this.stamps = [
      ...this.stamps.slice(-3),
      {
        x,
        y,
        born: now,
        from: base,
        to: (base + 1 + this.opts.stampSpan * charge) * jitter(),
        life: (0.65 + 0.55 * charge) * jitter(),
      },
    ];
  }
}
