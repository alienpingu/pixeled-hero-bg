import { clamp01, expDamp } from '../color';
import { TUNING } from '../tuning';
import { MockSpectrumSource } from './MockSpectrumSource';
import type { SpectrumSource } from './SpectrumSource';

/** Analyser FFT size → `frequencyBinCount` = 512 bins (~47 Hz each at 48 kHz). */
const FFT_SIZE = 1024;

/**
 * Real Web Audio spectrum source: a looping `<audio>` element analysed with an
 * {@link AnalyserNode}, plus spectral-flux beat detection that pumps the bass
 * of the spectrogram on rhythm.
 *
 * - `playing()` is the "music on" gate: true only while audible (started,
 *   context running, unmuted). Muted playback still analyses, but the engine
 *   hides the equalizer and the beat reaction through this flag.
 * - `start()` requires a user gesture (autoplay policy); until it succeeds,
 *   `sample()` falls back to a {@link MockSpectrumSource} so the display stays
 *   alive. A failed *load* (404 / decode error) falls back permanently.
 */
export class WebAudioSpectrumSource implements SpectrumSource {
  private readonly src: string;
  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private media: MediaElementAudioSourceNode | null = null;

  private readonly freq = new Uint8Array(FFT_SIZE / 2);
  private readonly fluxHistory = new Float32Array(TUNING.audio.fluxBassBins);
  private fluxAvg = 0;
  private pulse = 0;

  private muted: boolean;
  private started = false;
  private starting = false;
  private failed = false;
  private readonly fallback = new MockSpectrumSource();

  constructor(src: string, muted = true) {
    this.src = src;
    this.muted = muted;
  }

  /** Flip the output gain. Muting also hides the equalizer via `playing()`. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gain && this.ctx) this.gain.gain.value = muted ? 0 : TUNING.audio.volume;
  }

  async start(): Promise<void> {
    if (this.failed || this.starting || this.started) return;
    this.starting = true;
    try {
      if (!this.ctx) this.buildGraph();
      await this.ctx!.resume();
      await this.el!.play();
      this.started = true;
    } catch {
      // Autoplay blocked (no user gesture yet) — retry on the next gesture.
      // Only an element load/decode error (below) marks the source dead.
      this.started = false;
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    this.started = false;
    if (!this.ctx) return;
    this.el?.pause();
    this.el?.removeEventListener('error', this.onElementError);
    try {
      this.media?.disconnect();
      this.analyser?.disconnect();
      this.gain?.disconnect();
    } catch {
      // Nodes may already be torn down by context close.
    }
    void this.ctx.close().catch(() => {});
    this.el = null;
    this.ctx = null;
    this.analyser = null;
    this.gain = null;
    this.media = null;
  }

  sample(bins: number, dtMs: number, out: Float32Array): Float32Array {
    if (this.failed || !this.started || !this.analyser || this.ctx?.state !== 'running') {
      return this.fallback.sample(bins, dtMs, out);
    }

    this.analyser.getByteFrequencyData(this.freq);
    this.updateBeatPulse(dtMs);

    const numBins = this.freq.length;
    const pulseBandCols = Math.max(1, Math.round(bins * TUNING.audio.pulseBandFraction));
    const floor = TUNING.audio.floor;

    for (let i = 0; i < bins; i++) {
      // Quadratic (log-ish) band edges: more columns to the lows, which is
      // where both musical energy and the beat live.
      const lo = Math.floor(((i / bins) ** 2) * numBins);
      const hi = Math.max(lo + 1, Math.floor((((i + 1) / bins) ** 2) * numBins));
      let sum = 0;
      for (let b = lo; b < hi; b++) sum += this.freq[b];
      // Subtract the room-tone floor and renormalize so quiet columns sit
      // fully dark; mids stay dim and only real peaks punch up (spiky look).
      const raw = sum / (hi - lo) / 255;
      const floored = clamp01((raw - floor) / (1 - floor));
      const v = Math.pow(floored, TUNING.audio.gamma);
      // Beat pulse tapers from full strength at the bass edge to none above.
      const w = 1 - clamp01(i / pulseBandCols);
      out[i] = clamp01(v * (1 + TUNING.audio.pulseGain * this.pulse * w));
    }
    return out;
  }

  /** Audible playback = the equalizer's "music on" gate. */
  playing(): boolean {
    return this.started && !this.muted && this.ctx?.state === 'running';
  }

  beatPulse(): number {
    return this.pulse;
  }

  private buildGraph(): void {
    const el = new Audio(this.src);
    el.loop = true;
    el.preload = 'auto';
    el.addEventListener('error', this.onElementError);

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = TUNING.audio.smoothing;
    // Typical music sits well below 0 dBFS — narrow the window so the byte
    // values spread across the full range instead of clustering low.
    analyser.minDecibels = -85;
    analyser.maxDecibels = -15;

    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : TUNING.audio.volume;

    const media = ctx.createMediaElementSource(el);
    media.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);

    this.el = el;
    this.ctx = ctx;
    this.analyser = analyser;
    this.gain = gain;
    this.media = media;
  }

  /** Spectral flux over the bass bins: rising energy = beat candidate. */
  private updateBeatPulse(dtMs: number): void {
    let flux = 0;
    for (let b = 0; b < TUNING.audio.fluxBassBins; b++) {
      const v = this.freq[b] / 255;
      const d = v - this.fluxHistory[b];
      if (d > 0) flux += d;
      this.fluxHistory[b] = v;
    }

    this.fluxAvg += (flux - this.fluxAvg) * expDamp(dtMs, TUNING.audio.fluxAvgHalfLifeMs);
    if (flux > this.fluxAvg * TUNING.audio.fluxThreshold && flux > TUNING.audio.fluxMin) {
      this.pulse = 1;
    } else {
      this.pulse *= Math.pow(0.5, dtMs / TUNING.audio.pulseHalfLifeMs);
    }
  }

  private readonly onElementError = (): void => {
    // Load/decode failure is permanent — stay on the mock fallback.
    this.failed = true;
    this.started = false;
    this.el?.pause();
  };
}
