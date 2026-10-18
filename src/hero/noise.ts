/** Seeded 32-bit LCG — deterministic across reloads, so the fog never jumps. */
export function makeLcg(seed: number): () => number {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

/**
 * Smoothed value-noise tile: a random grid box-blurred twice and normalized
 * to [0,1]. Sampled with toroidal wrap, it becomes the flowing fog of the
 * LED field (omarchy's `ye()` with seed 10407530, size 128).
 */
export function valueNoiseTile(seed: number, size = 128): Float32Array {
  const rnd = makeLcg(seed);
  let field = new Float32Array(size * size);
  for (let i = 0; i < field.length; i++) field[i] = rnd();

  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const sx = (x + dx + size) % size;
            const sy = (y + dy + size) % size;
            sum += field[sy * size + sx];
          }
        }
        next[y * size + x] = sum / 9;
      }
    }
    field = next;
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const v of field) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - lo) / span;
  return field;
}

/**
 * Bilinear noise sample with smoothstep weights and wrap-around — the fog
 * drifts by feeding time offsets into x/y (omarchy's `xe()`).
 */
export function sampleNoise(tile: Float32Array, size: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = ((xi % size) + size) % size;
  const y0 = ((yi % size) + size) % size;
  const x1 = (x0 + 1) % size;
  const y1 = (y0 + 1) % size;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = tile[y0 * size + x0];
  const b = tile[y0 * size + x1];
  const c = tile[y1 * size + x0];
  const d = tile[y1 * size + x1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/**
 * Static per-cell random table (4096 values): drives the sparkle phase, the
 * per-cell twinkle and the dither jitter — indexed so nearby cells decorrelate.
 */
export function whiteNoise(seed: number, length = 4096): Float32Array {
  let t = seed >>> 0;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    t = (t * 1664525 + 1013904223) >>> 0;
    out[i] = t / 4294967296;
  }
  return out;
}
