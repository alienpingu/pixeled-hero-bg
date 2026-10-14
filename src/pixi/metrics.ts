import type { EngineConfig } from './types';

export interface CellMetrics {
  pixelSize: number;
  gap: number;
  stride: number;
}

/**
 * Minimum number of columns the grid should aim for. The 5×7 bitmap text
 * expanded at 2×2 ("PIXEL" = 58 cells) needs ~58+, so ~64 leaves margin
 * down to ~375px-wide phones.
 */
const TARGET_COLUMNS = 64;

/**
 * Derive integer cell metrics for a screen width so the matrix adapts from
 * phone to desktop while keeping LEDs pixel-aligned.
 *
 * - `responsive: false` → the configured pixelSize/gap verbatim.
 * - `responsive: true` → shrink stride toward `screenWidth / TARGET_COLUMNS`,
 *   clamped between `minPixelSize + 1` and the configured (max) stride.
 *   Gap scales down with the cell (~1/9 of stride) but never below 1px.
 */
export function computeCellMetrics(screenWidth: number, cfg: EngineConfig): CellMetrics {
  const maxStride = cfg.pixelSize + cfg.gap;
  if (!cfg.responsive || screenWidth <= 0) {
    return { pixelSize: cfg.pixelSize, gap: cfg.gap, stride: maxStride };
  }
  const minStride = cfg.minPixelSize + 1; // gap is always ≥ 1
  const stride = Math.min(maxStride, Math.max(minStride, Math.round(screenWidth / TARGET_COLUMNS)));
  const gap = Math.max(1, Math.round(stride / 9));
  return { pixelSize: stride - gap, gap, stride };
}
