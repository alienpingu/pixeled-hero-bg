/** A 6-value palette: flat bg + a 5-step glow ramp (darkest → brightest). */
export interface Palette {
  bg: string;
  dim: string;
  mid: string;
  lit: string;
  hover: string;
  crest: string;
}

export type RampLevel = 'dim' | 'mid' | 'lit' | 'hover' | 'crest';

/** Palette presets — values taken from omarchy.org's shipped theme CSS. */
export const PRESETS: Record<string, Palette> = {
  // Default theme of the reference site.
  tokyoNight: {
    bg: '#0e0e14',
    dim: '#39482e',
    mid: '#678549',
    lit: '#9ece6a',
    hover: '#bbdd97',
    crest: '#daecc6',
  },
  gruvbox: {
    bg: '#090909',
    dim: '#4b310a',
    mid: '#925b0b',
    lit: '#e68e0d',
    hover: '#eeb056',
    crest: '#f6d4a3',
  },
  catppuccin: {
    bg: '#101019',
    dim: '#34415c',
    mid: '#5b76a4',
    lit: '#89b4fa',
    hover: '#accafc',
    crest: '#d2e2fd',
  },
};

export type Rgb = [number, number, number];

/** Parse `#rrggbb` or `rgb()/rgba()` — CSS custom props come in both shapes. */
export function parseColor(source: string): Rgb | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(source.trim());
  if (hex) {
    const v = parseInt(hex[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const rgb = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(source.trim());
  return rgb ? [+rgb[1], +rgb[2], +rgb[3]] : null;
}

/** Rec. 601 luma in [0,1] — used to order the ramp regardless of theme. */
export function luminance([r, g, b]: Rgb): number {
  return (r * 299 + g * 587 + b * 114) / 255000;
}

export function toRgbCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Blend two CSS colors by t (port of omarchy's `ze`). */
export function blendColors(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  const m = ca.map((v, i) => Math.round(v + (cb[i] - v) * t)) as Rgb;
  return toRgbCss(m);
}

/**
 * Canonical row→ramp-level mapping for the wordmark, normalized to a 19-row
 * reference (5 crest / 2 hover / 4 lit / 3 mid / 5 dim — omarchy's gradient
 * stops 5/19, 7/19, 11/19, 14/19). Any text height samples the same bands.
 */
const ROW_BANDS: RampLevel[] = [
  'crest', 'crest', 'crest', 'crest', 'crest',
  'hover', 'hover',
  'lit', 'lit', 'lit', 'lit',
  'mid', 'mid', 'mid',
  'dim', 'dim', 'dim', 'dim', 'dim',
];

export function rowLevel(row: number, rows: number): RampLevel {
  const band = Math.floor((row / Math.max(1, rows)) * ROW_BANDS.length);
  return ROW_BANDS[Math.max(0, Math.min(ROW_BANDS.length - 1, band))];
}

/**
 * The glow-ordered ramp (dim → crest), but sorted by luminance so light
 * themes (where crest is *darker*) map effect colors correctly.
 */
export interface LevelRamp {
  /** All ramp levels ascending in luminance; `nearest()` snaps colors into it. */
  nearest(css: string): string;
  /** Ramp css value for a glow intensity of a glyph/field cell. */
  colorAt(level: RampLevel): string;
}

export function buildLevelRamp(palette: Palette): LevelRamp {
  const levels: RampLevel[] = ['dim', 'mid', 'lit', 'hover', 'crest'];
  const entries = levels
    .map((level) => ({ level, css: palette[level] }))
    .filter((e) => parseColor(e.css) !== null)
    .sort((a, b) => luminance(parseColor(a.css)!) - luminance(parseColor(b.css)!));

  return {
    nearest(css: string): string {
      if (entries.length === 0) return palette.lit;
      const target = luminance(parseColor(css) ?? [128, 128, 128]);
      let best = entries[0];
      let bestDist = Infinity;
      for (const e of entries) {
        const d = Math.abs(luminance(parseColor(e.css)!) - target);
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      return best.css;
    },
    colorAt(level: RampLevel): string {
      return palette[level];
    },
  };
}
