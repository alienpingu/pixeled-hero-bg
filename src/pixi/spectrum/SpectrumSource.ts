/**
 * Spectrum source abstraction — the seam between the rendering engine and
 * any frequency-analysis backend.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * FUTURE: real Web Audio API analysis
 * ──────────────────────────────────────────────────────────────────────────
 * Implement a `WebAudioSpectrumSource` with this shape (no rendering changes
 * required — PixelGridEngine only ever calls `sample()`):
 *
 *   const ctx = new AudioContext();                     // must start muted/`suspend()`
 *   const src = ctx.createMediaElementSource(el);       // or MediaStreamSource(mic)
 *   const analyser = ctx.createAnalyser();
 *   analyser.fftSize = 512;                             // → 256 frequency bins
 *   analyser.smoothingTimeConstant = 0.8;
 *   src.connect(analyser); // …and analyser → destination to keep audio audible
 *
 *   sample(bins: number) {
 *     analyser.getByteFrequencyData(this.data);         // Uint8Array(256), 0–255
 *     // Collapse 256 bins → `bins` bands (average or log-spaced grouping),
 *     // normalize to [0,1] and return. Low frequencies should land in low indexes.
 *   }
 *
 * AudioContext requires a user gesture before `ctx.resume()` — wire that to
 * the canvas `pointerdown` handler (the engine already calls `start()`
 * lazily on first interaction) and call `stop()` on unmount to disconnect
 * nodes and close the context.
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
}
