/**
 * 8×8 ordered-dither matrix — a bit-reversal permutation of 0–63, laid out so
 * consecutive columns/rows step through the matrix with maximum spacing.
 * Indexed as `[(row & 7) * 8 + (col & 7)]`.
 */
export const BAYER8X8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60,
  28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47,
  7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

/**
 * Per-cell dither threshold: mostly the ordered matrix (stable, engineered
 * texture) with a slice of static white noise (breaks up the matrix's
 * visible repetition). A cell lights up when its intensity clears this.
 */
export function ditherThreshold(
  white: Float32Array,
  col: number,
  row: number,
  orderedWeight = 0.78,
): number {
  const ordered = (BAYER8X8[(row & 7) * 8 + (col & 7)] + 0.5) / 64;
  const jitter = white[((row & 63) * 64 + (col & 63)) & 4095];
  return orderedWeight * ordered + (1 - orderedWeight) * jitter;
}
