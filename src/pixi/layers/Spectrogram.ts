import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import { expDamp } from '../color';
import { TUNING } from '../tuning';

/**
 * Bottom-of-screen audio spectrum visualizer: one column of LED particles per
 * grid column, styled as a spike equalizer — bars snap up instantly (fast
 * attack) and decay lazily, and a detached white peak-cap LED falls down on
 * its own slower timer after each spike.
 *
 * The whole band is gated by `enabled` (music playing): when disabled the
 * targets collapse to zero and everything fades out smoothly.
 */
export class Spectrogram {
  readonly container: ParticleContainer;

  private particles: Particle[] = [];
  private heights = new Float32Array(0);
  private peaks = new Float32Array(0);
  private cols = 0;
  private rows = 0;
  private bandRows = 0;

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

  layout(cols: number, rows: number, stride: number, pixelSize: number): void {
    this.cols = cols;
    this.rows = rows;
    this.bandRows = Math.max(6, Math.round(rows * 0.16));
    const topRow = rows - this.bandRows;

    this.container.removeParticles();
    this.particles = new Array(cols * this.bandRows);
    this.heights = new Float32Array(cols);
    this.peaks = new Float32Array(cols);

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
    const kAttack = expDamp(dt, TUNING.spectrum.attackHalfLifeMs);
    const kRelease = expDamp(dt, TUNING.spectrum.releaseHalfLifeMs);
    const peakDecay = Math.pow(0.5, dt / TUNING.spectrum.peakFallHalfLifeMs);

    for (let c = 0; c < cols; c++) {
      const target = enabled ? (spectrum[c] ?? 0) : 0;
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
