/**
 * Minimal 5×7 bitmap font used to rasterize the central "pixel logo" text.
 * Each glyph is 7 rows of 5 columns; '#' = lit LED, '.' = off.
 *
 * Every font pixel is expanded into a {@link PIXEL_SCALE}×{@link PIXEL_SCALE}
 * block of grid cells, so the logo reads as chunky 2×2 LED squares.
 *
 * To extend: add more glyphs to GLYPHS (keep the 5×7 shape) — the engine
 * only looks characters up through {@link getGlyph}.
 */

const GLYPHS: Record<string, readonly string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#....', '#....', '#####'],
  F: ['#####', '#....', '####.', '#....', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
};

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;
export const GLYPH_GAP = 1; // empty columns between glyphs, in glyph cells

/** Grid cells covered by one font pixel — each '#' becomes a 2×2 LED block. */
export const PIXEL_SCALE = 2;

/** Returns the glyph rows for `char`, falling back to '?' for unknown characters. */
export function getGlyph(char: string): readonly string[] {
  return GLYPHS[char.toUpperCase()] ?? GLYPHS['?'];
}

/**
 * A rasterized glyph: one entry per lit cell with column/row offsets.
 * Precomputed once per `setText` call so layers never re-parse strings.
 */
export interface RasterGlyph {
  readonly char: string;
  readonly cells: ReadonlyArray<{ col: number; row: number }>;
}

export interface RasterText {
  readonly glyphs: readonly RasterGlyph[];
  /** Total footprint in grid cells, including inter-glyph gaps. */
  readonly width: number;
  readonly height: number;
}

/** Rasterize a text string into lit grid cells (uppercase, unknown → '?'). */
export function rasterizeText(text: string, scale: number = PIXEL_SCALE): RasterText {
  const glyphs: RasterGlyph[] = [];
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const rows = getGlyph(char);
    const cells: { col: number; row: number }[] = [];
    for (let r = 0; r < GLYPH_HEIGHT; r++) {
      const line = rows[r];
      for (let c = 0; c < GLYPH_WIDTH; c++) {
        if (line[c] !== '#') continue;
        // Expand one font pixel into a scale×scale block of grid cells.
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            cells.push({ col: c * scale + dx, row: r * scale + dy });
          }
        }
      }
    }
    const offsetX = width;
    glyphs.push({
      char,
      cells: cells.map(({ col, row }) => ({ col: col + offsetX, row })),
    });
    width += (GLYPH_WIDTH + (i < text.length - 1 ? GLYPH_GAP : 0)) * scale;
  }
  return { glyphs, width, height: GLYPH_HEIGHT * scale };
}
