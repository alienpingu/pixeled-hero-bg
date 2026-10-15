import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import { clamp01, expDamp } from '../color';
import { TUNING } from '../tuning';

const TWO_PI = Math.PI * 2;

/**
 * Feel knobs for the wavy spectrogram. Kept local to the layer because they
 * only describe how the live spectrum is reshaped into hills — nothing else in
 * the background reads them.
 */
const FLOW = {
  /** Spectral bands the spectrum is split into → one travelling wave each. */
  bandCount: 6,
  /** Hills across the width per band. Fractional + distinct so the crests
   *  never settle into a repeating, regular picket fence. */
  hills: [2.4, 3.1, 3.7, 4.6, 5.3, 6.2],
  /** Travel speed in screen-widths per second (sign = direction). Opposing
   *  directions let the bands drift through each other. */
  speed: [0.14, -0.12, 0.1, -0.09, 0.08, -0.07],
  /** Crest sharpness (>1 narrows the hills and widens the valleys). */
  sharpness: [1.8, 2.1, 2.4, 2.7, 3.0, 3.3],
  /** Mix weight per band (bass carries a touch more weight). */
  weight: [1.0, 0.96, 0.92, 0.88, 0.84, 0.8],
  /** Half-life of each band's running level, for the per-band auto-gain (ms). */
  levelHalfLifeMs: 700,
  /** Auto-gain divisor floor — keeps genuinely quiet bands quiet, not noisy. */
  levelFloor: 0.08,
  /** Max per-band auto-gain so a single onset cannot blow the mix up. */
  maxDynamic: 1.6,
  /** Uniform minimum so the valleys stay faintly alive, not dead black. */
  baseFill: 0.12,
  /** Scale from the summed waves to a column height (0..1). */
  gain: 0.6,
  /** Macro dynamics: overall height range as loudness sweeps (silence → loud).
   *  `baseGain` is the quiet-passage floor, `gainRange` the extra at full level. */
  baseGain: 0.25,
  gainRange: 1.0,
  /** Loudness compensation before the macro height (mean band energy → 0..1). */
  loudScale: 1.7,
  /** Wave-motion multiplier range: idle drift up to full-speed when loud. */
  moveBase: 0.6,
  moveRange: 0.9,
} as const;

/**
 * Bottom-of-screen audio visualizer, drawn as a grid of matrix cells.
 *
 * The spectrum is deliberately NOT mapped left-to-right to frequency: that
 * always produced the same bass-left / treble-right slope on electronic music.
 * Instead each frame collapses the spectrum into a few bands and gives every
 * band one travelling wave across the full width — its own hill count,
 * direction and crest sharpness — then superposes them. The result is a
 * constantly moving ridge with several hills and valleys in different places.
 *
 * Every band's hills grow with that band's energy (auto-gained so the quieter
 * high bands still read against a bass-heavy mix) and the whole field drifts
 * faster when the music is loud, so the motion stays tied to the song. The low
 * band keeps the beat punch for free: the audio source already pumps the bass
 * bins on every kick.
 *
 * Heights follow their target asymmetrically — fast attack, lazy release — and
 * a detached white peak-cap LED falls on its own slower timer. The whole band is
 * gated by `enabled` (music playing): when disabled the targets collapse to zero
 * and everything fades out smoothly.
 */
export class Spectrogram {
  readonly container: ParticleContainer;

  private particles: Particle[] = [];
  private heights = new Float32Array(0);
  private peaks = new Float32Array(0);
  private cols = 0;
  private rows = 0;
  private bandRows = 0;

  /** Per-band energy, running level (auto-gain baseline) and mix amplitude. */
  private bandEnergy = new Float32Array(FLOW.bandCount);
  private bandLevel = new Float32Array(FLOW.bandCount);
  private bandAmp = new Float32Array(FLOW.bandCount);
  /** Travelling-wave phase per band, in radians. */
  private bandPhase = new Float32Array(FLOW.bandCount);
  private levelsSeeded = false;
  /** Slow mean energy across bands — scales overall height and wave motion. */
  private loudLevel = 0;

  constructor(texture: Texture) {
    this.container = new ParticleContainer({
      texture,
      roundPixels: true,
      dynamicProperties: { position: false, color: true },
    });
  }

  /** Number of frequency columns the layer exposes (bin count for SpectrumSource). */
  get columnCount(): number {
    return this.cols;
  }

  /** Top grid row of the spectrogram band (rows above it are free field). */
  get bandTopRow(): number {
    return this.rows - this.bandRows;
  }

  /** Bands actually mixed (a very narrow grid can expose fewer columns). */
  private get bandCount(): number {
    return Math.min(FLOW.bandCount, Math.max(1, this.cols));
  }

  layout(cols: number, rows: number, stride: number, pixelSize: number): void {
    this.cols = cols;
    this.rows = rows;
    this.bandRows = Math.max(6, Math.round(rows * 0.16));
    const topRow = rows - this.bandRows;

    this.container.removeParticles();
    this.particles = new Array(cols * this.bandRows);
    this.heights = new Float32Array(cols);
    this.peaks = new Float32Array(cols);

    // Spread the bands' starting crests so the very first frames already show
    // hills in different places instead of all stacking at the same column.
    for (let b = 0; b < FLOW.bandCount; b++) {
      this.bandPhase[b] = b * 2.399963; // consecutive golden-angle offsets
      this.bandLevel[b] = 0;
    }
    this.levelsSeeded = false;
    this.loudLevel = 0;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < this.bandRows; r++) {
        const p = new Particle({
          texture: this.container.texture,
          x: c * stride,
          y: (topRow + r) * stride,
          // Texture.WHITE is 1×1 — scale it up to a full LED square.
          scaleX: pixelSize,
          scaleY: pixelSize,
          alpha: 0,
        });
        this.particles[c * this.bandRows + r] = p;
        this.container.addParticle(p);
      }
    }
    this.container.update();
  }

  update(dt: number, spectrum: Float32Array, accent: number, enabled = true): void {
    const { bandRows, cols } = this;
    const bands = this.bandCount;
    const kAttack = expDamp(dt, TUNING.spectrum.attackHalfLifeMs);
    const kRelease = expDamp(dt, TUNING.spectrum.releaseHalfLifeMs);
    const peakDecay = Math.pow(0.5, dt / TUNING.spectrum.peakFallHalfLifeMs);
    const kLevel = expDamp(dt, FLOW.levelHalfLifeMs);

    // ── 1. Collapse the spectrum into band energies (bass → treble). ─────────
    let loud = 0;
    for (let b = 0; b < bands; b++) {
      const lo = Math.min(cols - 1, Math.floor((b * cols) / bands));
      const hi = Math.min(cols, Math.max(lo + 1, Math.floor(((b + 1) * cols) / bands)));
      let sum = 0;
      for (let c = lo; c < hi; c++) sum += spectrum[c] ?? 0;
      const e = sum / (hi - lo);
      this.bandEnergy[b] = e;
      loud += e;
    }
    loud /= bands;

    // Track each band's own running level so quiet highs still get to rise,
    // and a global level for the macro (loud passage → tall ridge) reaction.
    if (!this.levelsSeeded) {
      for (let b = 0; b < bands; b++) this.bandLevel[b] = this.bandEnergy[b];
      this.loudLevel = loud;
      this.levelsSeeded = true;
    } else {
      for (let b = 0; b < bands; b++) {
        this.bandLevel[b] += (this.bandEnergy[b] - this.bandLevel[b]) * kLevel;
      }
      this.loudLevel += (loud - this.loudLevel) * kLevel;
    }

    const global = FLOW.baseGain + FLOW.gainRange * clamp01(loud * FLOW.loudScale);
    const moveScale = FLOW.moveBase + FLOW.moveRange * clamp01(this.loudLevel * FLOW.loudScale);

    // ── 2. Per-band mix amplitude: energy relative to its own level, scaled by
    //       the macro loudness. Weighted here so the column loop stays cheap. ─
    for (let b = 0; b < bands; b++) {
      const dyn = Math.min(
        FLOW.maxDynamic,
        this.bandEnergy[b] / Math.max(this.bandLevel[b], FLOW.levelFloor),
      );
      this.bandAmp[b] = enabled ? FLOW.weight[b] * dyn * global : 0;
    }

    // ── 3. Advance every band's travelling wave. Further/faster when loud. ───
    const dtSec = dt / 1000;
    for (let b = 0; b < bands; b++) {
      this.bandPhase[b] += TWO_PI * FLOW.hills[b] * FLOW.speed[b] * moveScale * dtSec;
    }

    // ── 4. Superpose the waves into one moving ridge of hills and valleys. ───
    const invCols = 1 / cols;
    for (let c = 0; c < cols; c++) {
      const x = c * invCols;
      let sum = 0;
      for (let b = 0; b < bands; b++) {
        const amp = this.bandAmp[b];
        if (amp <= 0) continue;
        const raw = Math.sin(TWO_PI * FLOW.hills[b] * x + this.bandPhase[b]);
        // Signed shaping keeps a hill where a band swells and a valley where it
        // thins (sharpness > 1 narrows the hills and widens the valleys).
        sum += amp * Math.sign(raw) * Math.pow(Math.abs(raw), FLOW.sharpness[b]);
      }
      const target = enabled ? clamp01(FLOW.baseFill + FLOW.gain * sum) : 0;

      const h = this.heights[c];
      this.heights[c] = h + (target - h) * (target > h ? kAttack : kRelease);
      this.peaks[c] = Math.max(this.heights[c], this.peaks[c] * peakDecay);

      const lit = Math.round(this.heights[c] * bandRows);
      const firstLit = bandRows - lit;
      // Peak cap: the topmost LED of the held peak, falling independently.
      const capRow = bandRows - 1 - Math.round(this.peaks[c] * (bandRows - 1));
      const base = c * bandRows;

      for (let r = 0; r < bandRows; r++) {
        const p = this.particles[base + r];
        if (r >= firstLit && lit > 0) {
          p.alpha = 1;
          p.tint = accent;
        } else if (r === capRow && this.peaks[c] > 0.01) {
          p.alpha = 1;
          p.tint = 0xffffff;
        } else {
          p.alpha = 0;
        }
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.particles = [];
  }
}
