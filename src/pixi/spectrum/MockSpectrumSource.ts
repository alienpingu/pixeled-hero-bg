import { clamp01 } from '../color';
import { TUNING } from '../tuning';
import type { SpectrumSource } from './SpectrumSource';

/**
 * Synthetic spectrum used until a real Web Audio source is plugged in
 * (see SpectrumSource.ts for the upgrade path).
 *
 * The signal combines a low-frequency-weighted envelope (bass-heavy, like a
 * music visualizer), a few out-of-phase sine layers for rhythm, and a
 * smoothed random walk for organic variation.
 */
export class MockSpectrumSource implements SpectrumSource {
  private time = 0;
  private walk: Float32Array = new Float32Array(0);

  /** Extra energy multiplier — driven by `audioReactivity`. */
  intensity = 1;

  sample(bins: number, dtMs: number, out: Float32Array): Float32Array {
    if (this.walk.length !== bins) this.walk = new Float32Array(bins);
    this.time += ((dtMs / 1000) * TUNING.spectrum.timeScale);
    const t = this.time;

    for (let i = 0; i < bins; i++) {
      const f = i / bins;
      // Bass-heavy spectral envelope: loud lows, quiet highs.
      const envelope = 0.08 + 0.9 * Math.pow(1 - f, 1.9);
      // Layered sines at incommensurate rates → pseudo-rhythmic motion.
      const s =
        Math.sin(t * (1.3 + f * 3.7) + i * 0.55) * 0.5 +
        Math.sin(t * 0.47 + i * 1.9) * 0.3 +
        Math.sin(t * (2.1 + f * 2.3) + i) * 0.2;
      // Random walk with mean reversion for organic jitter.
      this.walk[i] = (this.walk[i] + (Math.random() - 0.5) * TUNING.spectrum.walkStep) * 0.92;

      out[i] = clamp01(envelope * (0.55 + 0.45 * s) * this.intensity + this.walk[i]);
    }
    return out;
  }

  async start(): Promise<void> {
    // Nothing to acquire for the mock source.
  }

  stop(): void {
    // Nothing to release for the mock source.
  }
}
