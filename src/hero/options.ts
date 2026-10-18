import type { GlyphOptions } from './glyphs';
import { PRESETS, parseColor, type Palette } from './ramp';

export type PresetName = 'tokyoNight' | 'gruvbox' | 'catppuccin';
export type RevealEffect = 'decrypt' | 'matrix' | 'laser';

export interface HeroColorsInput extends Partial<Palette> {
  /** Base palette the overrides apply on. @default 'tokyoNight' */
  preset?: PresetName;
}

/** Cell-grid + layout of the invisible anchor that defines it. */
export interface GridOptions {
  /** cellHeight / cellWidth. 50/51 matches the reference LED pitch. @default 50/51 */
  cellRatio: number;
  /** Anchor box width as a fraction of the container. @default 0.88 */
  anchorFraction: number;
  /** CSS px the anchor box subtracts from the container width. @default 48 */
  anchorPadding: number;
  /** Max anchor box width in CSS px. @default 896 */
  anchorMaxWidth: number;
}

/** The static-texture fog field. Defaults are omarchy's engine constants. */
export interface FieldOptions {
  enabled: boolean;
  /** Seed of the 128² value-noise tile. @default 10407530 */
  noiseSeed: number;
  /** Seed of the 4096-cell static random table (sparkle + dither jitter). @default 663316 */
  sparkleSeed: number;
  /** Cells per noise-tile unit for the big fog octave. @default 9 */
  fogScale: number;
  /** Weight of the first octave vs the coarse second. @default 0.6 */
  fogMix: number;
  /** Global drift speed multiplier. @default 1 */
  fogDrift: number;
  /** Extra per-cell static twinkle weight. @default 0.18 */
  sparkle: number;
  /** Master field brightness. @default 0.62 */
  brightness: number;
  /** Elliptical vignette: y-squash, inner clear radius, falloff span. */
  vignette: { squash: number; inner: number; span: number };
  /** Fade of the field toward the top edge: floor, css-px offset, ramp height. */
  topFade: { min: number; offset: number; height: number };
  /** Ordered-matrix weight in the dither threshold (rest = static jitter). @default 0.78 */
  dither: { ordered: number };
  /** Field dims near interactive elements so text stays readable. */
  quiet: { selector: string; distance: number; exponent: number };
}

/** Pointer glow, press→stamp ripples and idle auto-ripples. */
export interface PointerOptions {
  enabled: boolean;
  /** Drifting ambient glow that keeps the field alive without a pointer. */
  ambient: boolean;
  /** Max glow reach in cells. @default 12 */
  reachCells: number;
  /** Peak glow strength. @default 0.7 */
  strength: number;
  /** Pointer smoothing per frame. @default 0.3 */
  smoothing: number;
  /** Ambient-glow smoothing per frame. @default 0.08 */
  ambientSmoothing: number;
  /** Extra reach at full beat. @default 0.84 */
  beatBoost: number;
  /** Glow → intensity gain. @default 0.6 */
  glowGain: number;
  /** Stamp → intensity gain. @default 1.15 */
  stampGain: number;
  /** Glyph-cell color thresholds over the effect intensity. */
  crestAt: number;
  hoverAt: number;
  stamps: boolean;
  autoRipples: boolean;
  /** Seconds-to-full at ~100% charge. @default 1.1 */
  chargeSeconds: number;
  /** Stamp brush: square mask size, start scale, growth per charge, spread. */
  stampSize: number;
  stampBase: number;
  stampGrowth: number;
  stampSpan: number;
  /** Stamp life range in seconds + amplitude easing. */
  stampLife: [number, number];
  rippleDelay: [number, number];
  rippleRepeat: [number, number];
  rippleCharge: [number, number];
  /** Pointer glow multiplier while an auto-ripple is charging. @default 0.4 */
  autoGlowDim: number;
  /** Pointer gets `cursor: pointer` over the glyph box when pressable. */
  glyphCursor: boolean;
}

export interface AudioOptions {
  enabled: boolean;
  /** Looping track URL. Undefined → enabled but silent until one is set. */
  src?: string;
  muted: boolean;
  volume: number;
  bands: number;
  fftSize: number;
  /** Frequency range [Hz, Hz] the bands map logarithmically over. */
  range: [number, number];
  /** Energy floor in dB normalized against 0 dBFS. @default -90 */
  floorDb: number;
  /** Output scale of normalized band energy. @default 0.6 */
  gain: number;
  /** Per-band display smoothing, fast attack / lazy release. */
  attack: number;
  release: number;
  /** Min band energy to consider the spectrum alive. @default 0.01 */
  threshold: number;
  /** Beat detection from bass-band spectral flux. */
  beat: { bassBands: number; threshold: number; avgHalfLifeMs: number; decayHalfLifeMs: number; min: number };
  /** Beat amplitude hold decay per frame multiplier. @default 0.84 */
  beatHold: number;
  /** Bottom spectrum bump: alpha, floor, max height fraction, color weight, field gate. */
  bump: { alpha: number; floor: number; length: number; colorWeight: number; fieldGate: number };
}

export interface RevealOptions {
  effect: RevealEffect | 'none';
  /** When to fire automatically: once after mount, on palette/theme change, or never. */
  auto: 'mount' | 'theme' | 'none';
  durationMs: number;
}

/** Audio options with everything resolved (src stays optional by design). */
export type ResolvedAudio = Omit<Required<AudioOptions>, 'src'> & { src?: string };

/** Fully-resolved engine options (what the engine always receives). */
export interface ResolvedHeroOptions {
  text: string;
  bitmap?: string[];
  palette: Palette;
  cssVars?: Partial<Record<keyof Palette, string>>;
  grid: GridOptions;
  glyphs: GlyphOptions;
  field: FieldOptions;
  pointer: PointerOptions;
  audio: ResolvedAudio;
  reveal: RevealOptions;
  maxFps: number;
  dprCap: number;
  warmupMs: number;
  reducedMotion: 'auto' | 'always' | 'never';
  pixelSnapSelector: string | null;
  onPainted?: () => void;
  onGlyphPress?: () => void;
}

export interface HeroOptionsInput {
  /** Text rendered as LED glyphs when `bitmap` is not given. @default 'OMARCHY' */
  text?: string;
  /** Rows of `0`/`1` strings — overrides `text`. */
  bitmap?: string[];
  colors?: HeroColorsInput;
  /** Palette values read from these CSS custom properties on the <html> element. */
  cssVars?: Partial<Record<keyof Palette, string>>;
  grid?: Partial<GridOptions>;
  glyphs?: Partial<GlyphOptions>;
  field?: Partial<FieldOptions>;
  pointer?: Partial<PointerOptions>;
  audio?: Partial<AudioOptions>;
  reveal?: Partial<RevealOptions>;
  /** Render loop cap. @default 40 */
  maxFps?: number;
  /** devicePixelRatio cap. @default 2 */
  dprCap?: number;
  /** Fade-in duration on mount. @default 900 */
  warmupMs?: number;
  reducedMotion?: 'auto' | 'always' | 'never';
  /** Selector for elements to translate onto the pixel grid; null disables. @default '[data-px-snap]' */
  pixelSnapSelector?: string | null;
  onPainted?: () => void;
  onGlyphPress?: () => void;
}

export const DEFAULT_GRID: GridOptions = {
  cellRatio: 50 / 51,
  anchorFraction: 0.88,
  anchorPadding: 48,
  anchorMaxWidth: 896,
};

export const DEFAULT_GLYPHS: GlyphOptions = {
  pixelScale: 3,
  gap: 2,
};

export const DEFAULT_FIELD: FieldOptions = {
  enabled: true,
  noiseSeed: 10407530,
  sparkleSeed: 663316,
  fogScale: 9,
  fogMix: 0.6,
  fogDrift: 1,
  sparkle: 0.18,
  brightness: 0.62,
  vignette: { squash: 0.82, inner: 0.42, span: 0.85 },
  topFade: { min: 0.16, offset: 24, height: 130 },
  dither: { ordered: 0.78 },
  quiet: { selector: 'a, button', distance: 96, exponent: 3 },
};

export const DEFAULT_POINTER: PointerOptions = {
  enabled: true,
  ambient: true,
  reachCells: 12,
  strength: 0.7,
  smoothing: 0.3,
  ambientSmoothing: 0.08,
  beatBoost: 0.84,
  glowGain: 0.6,
  stampGain: 1.15,
  crestAt: 0.45,
  hoverAt: 0.12,
  stamps: true,
  autoRipples: true,
  chargeSeconds: 1.1,
  stampSize: 15,
  stampBase: 0.45,
  stampGrowth: 1.6,
  stampSpan: 3.2,
  stampLife: [0.65, 1.2],
  rippleDelay: [1, 2],
  rippleRepeat: [2, 3],
  rippleCharge: [0, 0.2],
  autoGlowDim: 0.4,
  glyphCursor: true,
};

export const DEFAULT_AUDIO: ResolvedAudio = {
  enabled: false,
  src: undefined,
  muted: true,
  volume: 0.55,
  bands: 32,
  fftSize: 2048,
  range: [50, 10000],
  floorDb: -90,
  gain: 0.6,
  attack: 0.7,
  release: 0.14,
  threshold: 0.01,
  beat: { bassBands: 4, threshold: 1.5, avgHalfLifeMs: 400, decayHalfLifeMs: 140, min: 0.04 },
  beatHold: 0.84,
  bump: { alpha: 0.7, floor: 0.08, length: 0.92, colorWeight: 0.5, fieldGate: 3 },
};

export const DEFAULT_REVEAL: RevealOptions = {
  effect: 'decrypt',
  auto: 'none',
  durationMs: 1800,
};

export function resolvePalette(input: HeroColorsInput | undefined): Palette {
  const base = PRESETS[input?.preset ?? 'tokyoNight'] ?? PRESETS.tokyoNight;
  const out: Palette = { ...base };
  (Object.keys(base) as (keyof Palette)[]).forEach((k) => {
    const v = input?.[k];
    if (v !== undefined && parseColor(v) !== null) out[k] = v;
  });
  return out;
}

/** Read any configured cssVars from <html>, skipping unparseable values. */
export function applyCssVars(palette: Palette, vars: ResolvedHeroOptions['cssVars']): Palette {
  if (!vars) return palette;
  const cs = getComputedStyle(document.documentElement);
  const out = { ...palette };
  (Object.keys(vars) as (keyof Palette)[]).forEach((k) => {
    const name = vars[k];
    if (!name) return;
    const raw = cs.getPropertyValue(name).trim();
    if (raw && parseColor(raw) !== null) out[k] = raw;
  });
  return out;
}

export function resolveOptions(input: HeroOptionsInput): ResolvedHeroOptions {
  return {
    text: input.text ?? 'OMARCHY',
    bitmap: input.bitmap,
    palette: resolvePalette(input.colors),
    cssVars: input.cssVars,
    grid: { ...DEFAULT_GRID, ...input.grid },
    glyphs: { ...DEFAULT_GLYPHS, ...input.glyphs },
    field: {
      ...DEFAULT_FIELD,
      ...input.field,
      vignette: { ...DEFAULT_FIELD.vignette, ...input.field?.vignette },
      topFade: { ...DEFAULT_FIELD.topFade, ...input.field?.topFade },
      dither: { ...DEFAULT_FIELD.dither, ...input.field?.dither },
      quiet: { ...DEFAULT_FIELD.quiet, ...input.field?.quiet },
    },
    pointer: { ...DEFAULT_POINTER, ...input.pointer },
    audio: { ...DEFAULT_AUDIO, ...input.audio, beat: { ...DEFAULT_AUDIO.beat, ...input.audio?.beat }, bump: { ...DEFAULT_AUDIO.bump, ...input.audio?.bump } },
    reveal: { ...DEFAULT_REVEAL, ...input.reveal },
    maxFps: input.maxFps ?? 40,
    dprCap: input.dprCap ?? 2,
    warmupMs: input.warmupMs ?? 900,
    reducedMotion: input.reducedMotion ?? 'auto',
    pixelSnapSelector: input.pixelSnapSelector === undefined ? '[data-px-snap]' : input.pixelSnapSelector,
    onPainted: input.onPainted,
    onGlyphPress: input.onGlyphPress,
  };
}
