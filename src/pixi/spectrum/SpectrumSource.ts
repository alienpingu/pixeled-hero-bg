/**
 * Spectrum source abstraction — the seam between the rendering engine and
 * any frequency-analysis backend.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Implementations
 * ──────────────────────────────────────────────────────────────────────────
 * - {@link WebAudioSpectrumSource}: real analysis of a looping `<audio>`
 *   track (AnalyserNode + spectral-flux beat detection). Selected by the
 *   engine when `audioReactivity` is on and `audioSrc` is set; starts on the
 *   canvas `pointerdown` gesture (see PixelGridEngine.onPointerDown).
 * - {@link MockSpectrumSource}: synthetic fallback used before the first
 *   gesture and whenever the real track is unavailable.
 */
export interface SpectrumSource {
  /**
   * Fill and return `out` with normalized magnitudes in [0,1] for `bins`
   * frequency bands. `dtMs` is the elapsed frame time, useful for smoothing.
   */
  sample(bins: number, dtMs: number, out: Float32Array): Float32Array;
  /** Acquire resources (mic stream, AudioContext resume, …). Safe to call repeatedly. */
  start(): Promise<void>;
  /** Release resources. Safe to call repeatedly. */
  stop(): void;
  /**
   * True while audible music is actually playing — gates the spectrogram
   * layer (no music, no equalizer) and the beat reaction on text/grid.
   */
  playing(): boolean;
  /** Current beat pulse in [0,1] (1 = beat just hit, decaying). */
  beatPulse(): number;
}
