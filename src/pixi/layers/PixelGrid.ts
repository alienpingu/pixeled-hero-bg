import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import { grayRamp, mixColor } from '../color';
import type { GlitchView } from '../types';

/**
 * Background noise matrix — the full-screen LED field.
 *
 * Every cell is a lightweight {@link Particle} sharing one white texture;
 * only `tint`/`alpha` (color) is dynamic, positions are static and only
 * re-uploaded when `ParticleContainer.update()` is called (layout / row-shift).
 * Each cell re-rolls its gray tone on its own random timer, so only a small
 * slice of the grid is rewritten per frame.
 */
export class PixelGrid {
  readonly container: ParticleContainer;
  readonly pixelSize: number;
  readonly gap: number;
  readonly stride: number;

  private particles: Particle[] = [];
  private refreshIn = new Float32Array(0);
  private cols = 0;
  private rows = 0;
  private rowShift = new Int16Array(0);

  constructor(texture: Texture, pixelSize: number, gap = Math.max(1, Math.round(pixelSize / 8))) {
    this.pixelSize = pixelSize;
    this.gap = gap;
    this.stride = pixelSize + gap;
    this.container = new ParticleContainer({
      texture,
      roundPixels: true,
      dynamicProperties: { position: false, color: true },
    });
  }

  /** (Re)build the matrix for a grid of `cols` × `rows` cells. */
  layout(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    const count = cols * rows;

    this.container.removeParticles();
    this.particles = new Array(count);
    this.refreshIn = new Float32Array(count);
    this.rowShift = new Int16Array(rows);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const v = Math.pow(Math.random(), 2.2); // biased toward dim cells
        const p = new Particle({
          texture: this.container.texture,
          x: c * this.stride,
          y: r * this.stride,
          // Texture.WHITE is 1×1 — scale it up to a full LED square.
          scaleX: this.pixelSize,
          scaleY: this.pixelSize,
          tint: grayRamp(v),
        });
        this.particles[i] = p;
        this.refreshIn[i] = Math.random() * 400;
        this.container.addParticle(p);
      }
    }
    this.container.update(); // positions are static
  }

  update(dt: number, time: number, accent: number, glitch: GlitchView): void {
    this.refreshNoise(dt, time, accent);
    if (glitch.active) this.applyGlitchFrame(accent, glitch);
  }

  /** Scramble rows once when a glitch begins (static positions → update() once). */
  beginGlitch(): void {
    const shiftCount = 2 + ((Math.random() * 3) | 0);
    for (let n = 0; n < shiftCount; n++) {
      const r = (Math.random() * this.rows) | 0;
      if (this.rowShift[r] !== 0) continue;
      const shift = (((Math.random() * 5) | 0) - 2) * this.stride;
      if (shift === 0) continue;
      this.rowShift[r] = shift;
      const base = r * this.cols;
      for (let c = 0; c < this.cols; c++) this.particles[base + c].x = c * this.stride + shift;
    }
    this.container.update();
  }

  /** Restore displaced rows and re-roll every cell so no scramble tint lingers. */
  settleGlitch(): void {
    for (let r = 0; r < this.rows; r++) {
      const shift = this.rowShift[r];
      if (shift === 0) continue;
      const base = r * this.cols;
      for (let c = 0; c < this.cols; c++) this.particles[base + c].x = c * this.stride;
      this.rowShift[r] = 0;
    }
    for (let i = 0; i < this.particles.length; i++) {
      const v = Math.pow(Math.random(), 2.2);
      this.particles[i].tint = grayRamp(v);
      this.refreshIn[i] = Math.random() * 400;
    }
    this.container.update();
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.particles = [];
  }

  /** Convert absolute stage coordinates to a grid cell. */
  stageToCell(x: number, y: number): { col: number; row: number } {
    return { col: Math.floor(x / this.stride), row: Math.floor(y / this.stride) };
  }

  private refreshNoise(dt: number, _time: number, accent: number): void {
    const { particles, refreshIn } = this;
    for (let i = 0; i < particles.length; i++) {
      refreshIn[i] -= dt;
      if (refreshIn[i] > 0) continue;
      // Sparse "hot" accent pixels hint at the brand color inside the static.
      const hot = Math.random() < 0.012;
      if (hot) {
        particles[i].tint = accent;
        refreshIn[i] = 60 + Math.random() * 140;
      } else {
        particles[i].tint = grayRamp(Math.pow(Math.random(), 2.2));
        refreshIn[i] = 40 + Math.random() * 380;
      }
    }
  }

  private applyGlitchFrame(accent: number, glitch: GlitchView): void {
    const { particles } = this;
    const count = particles.length;

    // Random scramble budget scales with intensity (~7% of cells per frame).
    const budget = Math.max(8, ((count * 0.07 * glitch.intensity) | 0));
    for (let n = 0; n < budget; n++) {
      const i = (Math.random() * count) | 0;
      const roll = Math.random();
      if (roll < 0.4) particles[i].tint = accent;
      else if (roll < 0.65) particles[i].tint = 0xffffff;
      else if (roll < 0.8) particles[i].tint = 0x0a0a0a;
      else particles[i].tint = grayRamp(Math.random());
    }

    // Ripple ring expanding from the click origin.
    const maxDist = Math.hypot(this.cols, this.rows) * 0.6;
    const ringR = glitch.progress * maxDist;
    const { originCol, originRow } = glitch;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const d = Math.hypot(c - originCol, r - originRow);
        if (Math.abs(d - ringR) < 1.3 && Math.random() < 0.55) {
          particles[r * this.cols + c].tint = mixColor(accent, 0xffffff, Math.random() * 0.65);
        }
      }
    }
  }
}
