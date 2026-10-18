import type { ResolvedHeroOptions } from './options';

export interface AudioSnapshot {
  /** Normalized band energies [0,1] — zeroed while nothing is audible. */
  bands: Float32Array;
  /** Beat pulse 0..1 (spectral flux on the bass bands). */
  beat: number;
  /** True while the track is actually playing (started, unmuted, context running). */
  active: boolean;
}

/**
 * Optional Web Audio analyser for the hero: a looping `<audio>` element with a
 * log-spaced 32-band equalizer and a bass spectral-flux beat detector.
 * `resume()` must be called from a user gesture (autoplay policy); until then
 * everything reads as inactive and the visuals stay calm.
 */
export class SpectrumAudio {
  private readonly opts: ResolvedHeroOptions['audio'];

  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private media: MediaElementAudioSourceNode | null = null;

  private freqDb: Float32Array<ArrayBuffer> = new Float32Array(0);
  private binMap: Array<[number, number]> = [];
  private readonly bands: Float32Array;
  private readonly prevBands: Float32Array;
  private fluxAvg = 0;
  private pulse = 0;

  private muted: boolean;
  private started = false;
  private failed = false;

  constructor(opts: ResolvedHeroOptions['audio']) {
    this.opts = opts;
    this.muted = opts.muted;
    this.bands = new Float32Array(opts.bands);
    this.prevBands = new Float32Array(opts.bands);
  }

  /** Build the graph if needed; resume the context + play the element. */
  async resume(): Promise<void> {
    const src = this.opts.src;
    if (!src || this.failed) return;
    try {
      if (!this.ctx) this.buildGraph(src);
      await this.ctx!.resume();
      await this.el!.play();
      this.started = true;
    } catch {
      this.started = false; // no gesture yet — retry on the next one
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gain && this.ctx) this.gain.gain.value = muted ? 0 : this.opts.volume;
  }

  isMuted(): boolean {
    return this.muted;
  }

  update(dtMs: number): AudioSnapshot {
    const alive = this.started && !this.muted && this.ctx?.state === 'running' && !this.failed;
    if (!alive || !this.analyser) {
      this.bands.fill(0);
      this.pulse *= Math.pow(0.5, dtMs / this.opts.beat.decayHalfLifeMs);
      return { bands: this.bands, beat: this.pulse, active: false };
    }

    this.analyser.getFloatFrequencyData(this.freqDb);
    this.readBands();
    this.updateBeat(dtMs);
    return { bands: this.bands, beat: this.pulse, active: true };
  }

  destroy(): void {
    this.started = false;
    if (!this.ctx) return;
    this.el?.pause();
    this.el?.removeEventListener('error', this.onElementError);
    try {
      this.media?.disconnect();
      this.analyser?.disconnect();
      this.gain?.disconnect();
    } catch {
      // Nodes may already be gone if the context closed.
    }
    void this.ctx.close().catch(() => {});
    this.el = null;
    this.ctx = null;
    this.analyser = null;
    this.gain = null;
    this.media = null;
  }

  private buildGraph(src: string): void {
    const el = new Audio(src);
    el.loop = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.addEventListener('error', this.onElementError);

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = this.opts.fftSize;
    analyser.smoothingTimeConstant = 0; // per-band smoothing happens in the display loop
    analyser.minDecibels = -110;
    analyser.maxDecibels = 0;

    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : this.opts.volume;

    const media = ctx.createMediaElementSource(el);
    media.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);

    this.freqDb = new Float32Array(analyser.frequencyBinCount);
    this.mapBins(ctx.sampleRate);

    this.el = el;
    this.ctx = ctx;
    this.analyser = analyser;
    this.gain = gain;
    this.media = media;
  }

  /** Log-spaced [startHz, endHz] → analyser bin ranges, one per band. */
  private mapBins(sampleRate: number): void {
    const [lo, hi] = this.opts.range;
    const bins = this.freqDb.length;
    this.binMap = [];
    for (let i = 0; i < this.opts.bands; i++) {
      const f0 = lo * (hi / lo) ** (i / this.opts.bands);
      const f1 = lo * (hi / lo) ** ((i + 1) / this.opts.bands);
      const a = Math.max(1, Math.round((f0 / sampleRate) * bins));
      const b = Math.min(bins - 1, Math.max(a + 1, Math.round((f1 / sampleRate) * bins)));
      this.binMap.push([a, b]);
    }
  }

  /** Mean band power in dB, normalized against the floor and scaled by gain. */
  private readBands(): void {
    const floor = this.opts.floorDb;
    for (let i = 0; i < this.binMap.length; i++) {
      const [a, b] = this.binMap[i];
      let sum = 0;
      for (let k = a; k <= b; k++) if (this.freqDb[k] > floor) sum += 10 ** (this.freqDb[k] / 10);
      const db = sum > 0 ? 10 * Math.log10(sum / (b - a + 1)) : floor;
      this.bands[i] = Math.max(0, Math.min(1, (db - floor) / -floor)) * this.opts.gain;
    }
  }

  /** Rising bass energy vs its running average = beat candidate. */
  private updateBeat(dtMs: number): void {
    const { bassBands, threshold, avgHalfLifeMs, decayHalfLifeMs, min } = this.opts.beat;
    let flux = 0;
    for (let i = 0; i < bassBands && i < this.bands.length; i++) {
      const d = this.bands[i] - this.prevBands[i];
      if (d > 0) flux += d;
      this.prevBands[i] = this.bands[i];
    }
    this.fluxAvg += (flux - this.fluxAvg) * (1 - 0.5 ** (dtMs / avgHalfLifeMs));
    if (flux > this.fluxAvg * threshold && flux > min) {
      this.pulse = 1;
    } else {
      this.pulse *= 0.5 ** (dtMs / decayHalfLifeMs);
    }
  }

  private readonly onElementError = (): void => {
    this.failed = true;
    this.started = false;
    this.el?.pause();
  };
}
