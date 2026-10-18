import { FONT, FONT_HEIGHT, FONT_WIDTH } from './font';

export interface GlyphField {
  /** Rows of `0`/`1` strings, all the same length — the LED text. */
  rows: string[];
  cols: number;
  rowsCount: number;
}

export interface GlyphOptions {
  /** Grid cells covered by one font pixel. 3 ≈ omarchy's stroke weight. */
  pixelScale: number;
  /** Blank columns between glyphs, in grid cells. */
  gap: number;
}

/**
 * Lay text out into the LED grid: uppercase A–Z/0–9/symbols of the built-in
 * font, each font pixel inflated to a `pixelScale`² block of cells.
 * Unrenderable characters become a blank advance.
 */
export function rasterizeText(text: string, opts: GlyphOptions): GlyphField {
  const scale = Math.max(1, Math.round(opts.pixelScale));
  const gap = Math.max(0, Math.round(opts.gap));
  const chars = [...text.toUpperCase()];

  const cols = chars.length * (FONT_WIDTH * scale + gap) - (chars.length > 0 ? gap : 0);
  const rowsCount = FONT_HEIGHT * scale;

  if (cols <= 0 || chars.length === 0) {
    return { rows: [], cols: 0, rowsCount: 0 };
  }

  const grid: Uint8Array = new Uint8Array(rowsCount * cols);
  let pen = 0;
  for (const ch of chars) {
    const glyph = FONT[ch] ?? FONT[' '];
    for (let gy = 0; gy < FONT_HEIGHT; gy++) {
      const line = glyph[gy];
      for (let gx = 0; gx < FONT_WIDTH; gx++) {
        if (line[gx] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            grid[(gy * scale + dy) * cols + pen + gx * scale + dx] = 1;
          }
        }
      }
    }
    pen += FONT_WIDTH * scale + gap;
  }

  const rows: string[] = [];
  for (let y = 0; y < rowsCount; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) line += grid[y * cols + x] ? '1' : '0';
    rows.push(line);
  }
  return { rows, cols, rowsCount };
}

/** Validate + normalize a user-supplied bitmap (rows of `0`/`1`). */
export function fromBitmap(rows: string[]): GlyphField {
  const cleaned = rows.filter((r) => typeof r === 'string');
  const cols = cleaned.reduce((m, r) => Math.max(m, r.length), 0);
  const normalized = cleaned.map((r) =>
    r.padEnd(cols, '0').replace(/[^01]/g, '0').slice(0, cols),
  );
  return { rows: normalized, cols, rowsCount: normalized.length };
}
