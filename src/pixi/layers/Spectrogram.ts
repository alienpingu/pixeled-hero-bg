import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import { expDamp, mixColor } from '../color';

/**
 * Bottom-of-screen audio spectrum visualizer: one column of LED particles per
 * grid column. Column heights follow the {@link SpectrumSource} output with
 * exponential smoothing; the topmost lit pixel is mixed toward white for a
 * bright "peak" LED look.
 */
export class Spectrogram {
  readonly container: ParticleContainer;

  private particles: Particle[] = [];
  private heights = new Float32Array(0);
  private cols = 0;
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

  layout(cols: number, rows: number, stride: number, pixelSize: number): void {
    this.cols = cols;
    this.bandRows = Math.max(6, Math.round(rows * 0.16));
    const topRow = rows - this.bandRows;

    this.container.removeParticles();
    this.particles = new Array(cols * this.bandRows);
    this.heights = new Float32Array(cols);

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

  update(dt: number, spectrum: Float32Array, accent: number): void {
    const k = expDamp(dt, 90); // frame-rate independent smoothing
    const { bandRows, cols } = this;

    for (let c = 0; c < cols; c++) {
      const target = spectrum[c] ?? 0;
      this.heights[c] += (target - this.heights[c]) * k;
      const lit = Math.round(this.heights[c] * bandRows);
      const base = c * bandRows;

      for (let r = 0; r < bandRows; r++) {
        const p = this.particles[base + r];
        if (r < lit) {
          p.alpha = 1;
          p.tint = r === lit - 1 ? mixColor(accent, 0xffffff, 0.5) : accent;
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
