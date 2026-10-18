import type { GlyphField } from './glyphs';
import type { RevealEffect } from './options';

export interface RevealCell {
  col: number;
  row: number;
  kind: 'block' | 'dot' | 'line';
  /** Effect color, css. Engine blends toward the row-ramp color for settled target cells. */
  color: string;
  /** 0..1 blend toward the glyph ramp once the cell has been "etched". */
  settle: number;
  /** This cell is part of the target glyph bitmap. */
  target: boolean;
  /** Dot size factor 0..1. */
  weight: number;
}

export interface RevealPalette {
  dim: string;
  mid: string;
  lit: string;
  hover: string;
}

export interface RevealSession {
  advance(nowMs: number): void;
  collect(out: RevealCell[]): void;
  readonly done: boolean;
}

interface TargetCell {
  col: number;
  row: number;
  /** When this cell starts etching, ms into the effect. */
  revealAt: number;
}

const SETTLE_SPAN = 0.32; // fraction of duration each cell takes to blend into the ramp

/** Cheap per-cell flicker hash that changes every ~70 ms. */
function flick(seed: number, now: number): number {
  const tick = Math.floor(now / 70);
  let h = (seed * 2654435761 + tick * 40503) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 1000) / 1000;
}

/**
 * JS re-implementation of the three hero reveal effects, drawn into the same
 * LED cell grid so the text appears to be etched/decoded/rained into place:
 *
 * - `decrypt`  — every glyph cell flickers as random debris, then locks in on
 *   its own cue time (left bias), settling into the ramp.
 * - `matrix`   — per-column rain heads sweep down, leaving settled glyphs in
 *   their wake and a dim trail behind them.
 * - `laser`    — a beam scans top→bottom; cells above lock in, cells below
 *   jitter until the beam reaches them.
 */
export function createReveal(
  effect: RevealEffect,
  field: GlyphField,
  durationMs: number,
  palette: RevealPalette,
): RevealSession {
  const { rows, cols, rowsCount } = field;
  const duration = Math.max(400, durationMs);
  const settleSpan = duration * SETTLE_SPAN;

  const targets: TargetCell[] = [];
  for (let r = 0; r < rowsCount; r++) {
    const line = rows[r];
    for (let c = 0; c < cols; c++) {
      if (line[c] !== '1') continue;
      // Left-biased cue order for decrypt: earlier columns start earlier.
      const cue = 0.55 + 0.45 * (cols > 1 ? c / (cols - 1) : 0);
      const revealAt = Math.random() * cue * 0.72 * duration;
      targets.push({ col: c, row: r, revealAt });
    }
  }

  // matrix: per-column head schedule
  const colStart = new Float32Array(cols);
  const colSpeed = new Float32Array(cols); // cells per second
  for (let c = 0; c < cols; c++) {
    colStart[c] = Math.random() * 0.45 * duration;
    colSpeed[c] = (rowsCount + 4 + Math.random() * rowsCount) / (duration / 1000);
  }

  const settleOf = (now: number, revealAt: number): number =>
    Math.max(0, Math.min(1, (now - revealAt) / settleSpan));

  let done = false;
  let elapsed = 0;

  const decrypt: RevealSession['collect'] = (out) => {
    for (const t of targets) {
      const s = settleOf(elapsed, t.revealAt);
      if (s < 1 && elapsed < t.revealAt) {
        const f = flick(t.col * 131 + t.row * 17, elapsed);
        out.push({
          col: t.col,
          row: t.row,
          kind: 'dot',
          color: f > 0.66 ? palette.mid : f > 0.33 ? palette.dim : palette.lit,
          settle: 0,
          target: true,
          weight: 0.35 + f * 0.65,
        });
      } else {
        out.push({
          col: t.col,
          row: t.row,
          kind: 'block',
          color: palette.lit,
          settle: s,
          target: true,
          weight: 1,
        });
      }
    }
    // Scattered debris across the text box, fading out over the first half.
    const debris = Math.round(targets.length * 0.25 * Math.max(0, 1 - elapsed / (duration * 0.55)));
    for (let i = 0; i < debris; i++) {
      const f = flick(i * 977 + 31, elapsed);
      out.push({
        col: Math.floor(f * cols),
        row: Math.floor(flick(i * 613 + 7, elapsed) * rowsCount),
        kind: 'dot',
        color: f > 0.5 ? palette.dim : palette.mid,
        settle: 0,
        target: false,
        weight: 0.3 + f * 0.5,
      });
    }
  };

  const matrix: RevealSession['collect'] = (out) => {
    const trail = 6;
    for (let c = 0; c < cols; c++) {
      const head = ((elapsed - colStart[c]) / 1000) * colSpeed[c];
      if (head < 0) continue;
      const top = Math.max(0, Math.floor(head - trail));
      const bottom = Math.min(rowsCount - 1, Math.floor(head));
      for (let r = top; r <= bottom; r++) {
        const dist = bottom - r;
        out.push({
          col: c,
          row: r,
          kind: 'block',
          color: dist === 0 ? palette.hover : dist < 3 ? palette.lit : palette.mid,
          settle: 0,
          target: false,
          weight: 1,
        });
      }
    }
    // Settled glyphs: cells whose column head has passed them.
    for (const t of targets) {
      const head = ((elapsed - colStart[t.col]) / 1000) * colSpeed[t.col];
      if (head < t.row) continue;
      const passedAt = colStart[t.col] + (t.row / colSpeed[t.col]) * 1000;
      const s = settleOf(elapsed, passedAt);
      out.push({
        col: t.col,
        row: t.row,
        kind: 'block',
        color: palette.lit,
        settle: s,
        target: true,
        weight: 1,
      });
    }
  };

  const laser: RevealSession['collect'] = (out) => {
    const progress = Math.min(1, elapsed / duration);
    const beam = -1.5 + progress * (rowsCount + 3);
    const beamRow = Math.floor(beam);
    if (beamRow >= 0 && beamRow < rowsCount) {
      for (let c = 0; c < cols; c++) {
        out.push({
          col: c,
          row: beamRow,
          kind: 'line',
          color: palette.hover,
          settle: 0,
          target: false,
          weight: 1,
        });
      }
    }
    for (const t of targets) {
      if (t.row + 1 < beam) {
        const s = Math.max(0, Math.min(1, (beam - t.row - 1) / 2));
        out.push({ col: t.col, row: t.row, kind: 'block', color: palette.lit, settle: s, target: true, weight: 1 });
      } else {
        const f = flick(t.col * 131 + t.row * 17, elapsed);
        out.push({
          col: t.col,
          row: t.row,
          kind: 'dot',
          color: f > 0.5 ? palette.dim : palette.mid,
          settle: 0,
          target: true,
          weight: 0.3 + f * 0.4,
        });
      }
    }
  };

  const collect = effect === 'matrix' ? matrix : effect === 'laser' ? laser : decrypt;
  const finishAfter = effect === 'matrix' ? 1.35 : 1.05;

  let startedAt = -1;

  return {
    advance(nowMs: number) {
      if (startedAt < 0) startedAt = nowMs;
      elapsed = nowMs - startedAt;
      done = elapsed >= duration * finishAfter;
    },
    collect: (out) => {
      collect(out);
    },
    get done() {
      return done;
    },
  };
}
