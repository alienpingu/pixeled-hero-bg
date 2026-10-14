/**
 * Shared engine-level types.
 */

/** Public configuration consumed by {@link PixelGridEngine}. */
export interface EngineConfig {
  /** Edge length of one LED cell in CSS pixels (16 = 1rem). */
  pixelSize: number;
  /**
   * Empty gutter between LED cells in CSS pixels. Kept integer so cell
   * positions land on whole pixels — fractional strides make hard-rasterized
   * (antialias: false) gaps flicker between 1–3px.
   */
  gap: number;
  /** Accent color (CSS hex) used for logo text, spectrogram and glitch flashes. */
  accentColor: string;
  /** Canvas clear color. */
  backgroundColor: string;
  /** When true, pointer presses on the canvas trigger the glitch effect. */
  enableGlitchOnClick: boolean;
  /**
   * When true the engine runs the spectrum source in "live" mode
   * (intensified mock for now — swap in a Web Audio source, see SpectrumSource.ts).
   */
  audioReactivity: boolean;
  /** Text rendered as pixel glyphs in the center of the grid. */
  logoText: string;
}

export const DEFAULT_CONFIG: EngineConfig = {
  pixelSize: 16, // 1rem
  gap: 2, // 0.125rem ≈ the requested 0.1rem, rounded to a whole pixel
  accentColor: '#4ade80',
  backgroundColor: '#0d0d0d',
  enableGlitchOnClick: true,
  audioReactivity: false,
  logoText: 'PIXEL',
};

/**
 * Mutable glitch timeline shared with the layers each frame.
 * `progress` runs 0 → 1 over the glitch duration (0 = just started).
 */
export interface GlitchView {
  active: boolean;
  /** 0..1 strength of the scramble. */
  intensity: number;
  /** 0..1 elapsed fraction of the current glitch. */
  progress: number;
  /** Grid column the glitch originated from (click position). */
  originCol: number;
  /** Grid row the glitch originated from. */
  originRow: number;
}
