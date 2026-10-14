import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import { grayRamp, mixColor } from '../color';
import { TUNING } from '../tuning';
import type { GlitchView } from '../types';

/**
 * Background noise matrix — the full-screen LED field.
 *
 * Every cell is a lightweight {@link Particle} sharing one white texture;
 * only `tint`/`alpha` (color) is dynamic, positions are static and only
 * re-uploaded when `ParticleContainer.update()` is called (layout). Each cell
 * re-rolls its gray tone on its own random timer, so only a small slice of
 * the grid is rewritten per frame. Motion speed/intensity lives in TUNING.
 */
export class PixelGrid {
  readonly container: ParticleContainer;

  private particles: Particle[] = [];
  private refreshIn = new Float32Array(0);
  private cols = 0;
  private rows = 0;
  private currentStride = 18;
  // Cells tinted by the glitch this frame, with their pre-glitch tint, so
  // ring/scramble marks vanish after one frame (noise re-rolls are slow).
  private touchedList: number[] = [];
  private touchedTint: number[] = [];
  private touchedMark = new Uint8Array(0);

  /** Current cell stride (pixelSize + gap), valid after `layout()`. */
  get stride(): number {
    return this.currentStride;
  }

  constructor(texture: Texture) {
    this.container = new ParticleContainer({
      texture,
      roundPixels: true,
      dynamicProperties: { position: false, color: true },
    });
  }

  /**
   * (Re)build the matrix for a grid of `cols` × `rows` cells.
   * Cell metrics are inputs (not constructor state) so the grid can adapt
   * to the screen size on every resize.
   */
  layout(cols: number, rows: number, pixelSize: number, gap: number): void {
    this.cols = cols;
    this.rows = rows;
    const stride = pixelSize + gap;
    this.currentStride = stride;
    const count = cols * rows;

    this.container.removeParticles();
    this.particles = new Array(count);
    this.refreshIn = new Float32Array(count);
    this.touchedMark = new Uint8Array(count);
    this.touchedList = [];
    this.touchedTint = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const v = Math.pow(Math.random(), 2.2); // biased toward dim cells
        const p = new Particle({
          texture: this.container.texture,
          x: c * stride,
          y: r * stride,
          // Texture.WHITE is 1×1 — scale it up to a full LED square.
          scaleX: pixelSize,
          scaleY: pixelSize,
          tint: grayRamp(v),
        });
        this.particles[i] = p;
        this.refreshIn[i] = TUNING.noise.refreshMin + Math.random() * TUNING.noise.refreshJitter;
        this.container.addParticle(p);
      }
    }
    this.container.update(); // positions are static
  }

  update(dt: number, _time: number, accent: number, glitch: GlitchView): void {
    this.refreshNoise(dt, accent);
    if (glitch.active) this.applyGlitchFrame(accent, glitch);
  }

  /**
   * Dissolve the ring at glitch end: restore whatever the last frame's ring
   * tinted. No full re-roll — the field must look untouched by the click.
   */
  settleGlitch(): void {
    this.restoreTouched();
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.particles = [];
  }

  /** Convert absolute stage coordinates to a grid cell. */
  stageToCell(x: number, y: number): { col: number; row: number } {
    return { col: Math.floor(x / this.stride), row: Math.floor(y / this.stride) };
  }

  private refreshNoise(dt: number, accent: number): void {
    const { particles, refreshIn } = this;
    const { hotChance, hotHoldMin, hotHoldJitter, refreshMin, refreshJitter } = TUNING.noise;
    for (let i = 0; i < particles.length; i++) {
      refreshIn[i] -= dt;
      if (refreshIn[i] > 0) continue;
      // Sparse "hot" accent pixels hint at the brand color inside the static.
      if (Math.random() < hotChance) {
        particles[i].tint = accent;
        refreshIn[i] = hotHoldMin + Math.random() * hotHoldJitter;
      } else {
        particles[i].tint = grayRamp(Math.pow(Math.random(), 2.2));
        refreshIn[i] = refreshMin + Math.random() * refreshJitter;
      }
    }
  }

  private applyGlitchFrame(accent: number, glitch: GlitchView): void {
    // Undo last frame's marks first — the ring must read as ONE traveling
    // band, not a filled disc (noise re-rolls are too slow to clear it).
    this.restoreTouched();

    // Single expanding ring from the click origin: eased outward, continuous,
    // and fading from bright accent to dim gray as it travels. Nothing else
    // in the field changes — the ring is the entire click effect here.
    const { ringWidth, ringContinuity, ringWhiteMix } = TUNING.glitch;
    const p = glitch.progress;
    const eased = 1 - (1 - p) * (1 - p); // easeOutQuad
    const ringR = eased * Math.hypot(this.cols, this.rows) * 0.6;
    const ringColor = mixColor(
      mixColor(accent, 0xffffff, ringWhiteMix * (1 - p)),
      0x141414,
      p * 0.6,
    );
    const { originCol, originRow } = glitch;
    const halfWidth = ringWidth / 2;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const d = Math.hypot(c - originCol, r - originRow);
        if (Math.abs(d - ringR) < halfWidth && Math.random() < ringContinuity) {
          this.touchTint(r * this.cols + c, ringColor);
        }
      }
    }
  }

  /** Tint a cell while remembering its pre-glitch tint (once per frame). */
  private touchTint(index: number, tint: number): void {
    if (this.touchedMark[index] === 0) {
      this.touchedMark[index] = 1;
      this.touchedList.push(index);
      this.touchedTint.push(this.particles[index].tint);
    }
    this.particles[index].tint = tint;
  }

  /** Restore every cell touched last frame to its pre-glitch tint. */
  private restoreTouched(): void {
    const { touchedList, touchedTint, touchedMark } = this;
    for (let n = 0; n < touchedList.length; n++) {
      const i = touchedList[n];
      this.particles[i].tint = touchedTint[n];
      touchedMark[i] = 0;
    }
    touchedList.length = 0;
    touchedTint.length = 0;
  }
}
