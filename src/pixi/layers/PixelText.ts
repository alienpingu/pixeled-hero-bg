import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import { rasterizeText, type RasterText } from '../bitmapFont';
import type { GlitchView } from '../types';

/**
 * Central pixelated "logo" text, rasterized from the 5×7 bitmap font.
 * Renders as accent-tinted particles with a slow breathing alpha and
 * occasional per-glyph flicker; during glitches it jitters, drops out and
 * flash-frames in white.
 */
export class PixelText {
  readonly container: ParticleContainer;

  private raster: RasterText = rasterizeText('');
  private particles: Particle[] = [];
  private baseX = new Float32Array(0);
  private phases = new Float32Array(0);
  private glyphRanges: Array<{ start: number; end: number }> = [];
  private cols = 0;
  private rows = 0;
  private stride = 16;
  private pixelSize = 16;
  private flickerTimer = 400;
  private flickerGlyph = -1;
  private flickerTtl = 0;

  constructor(texture: Texture) {
    this.container = new ParticleContainer({
      texture,
      roundPixels: true,
      dynamicProperties: { position: false, color: true },
    });
  }

  setText(text: string): void {
    this.raster = rasterizeText(text);
    if (this.cols > 0) this.rebuild();
  }

  layout(cols: number, rows: number, stride: number, pixelSize: number): void {
    this.cols = cols;
    this.rows = rows;
    this.stride = stride;
    this.pixelSize = pixelSize;
    this.rebuild();
  }

  update(dt: number, time: number, accent: number, glitch: GlitchView): void {
    const t = time / 1000;
    const breath = 0.78 + 0.22 * Math.sin(t * Math.PI * 0.8);

    // Periodic single-glyph flicker (CRT dropout feel).
    this.flickerTimer -= dt;
    if (this.flickerTimer <= 0 && this.glyphRanges.length > 0) {
      this.flickerGlyph = (Math.random() * this.glyphRanges.length) | 0;
      this.flickerTtl = 50 + Math.random() * 90;
      this.flickerTimer = 280 + Math.random() * 720;
    }
    if (this.flickerTtl > 0) this.flickerTtl -= dt;

    const range = this.flickerGlyph >= 0 ? this.glyphRanges[this.flickerGlyph] : null;
    const flickering = !glitch.active && range !== null && this.flickerTtl > 0;

    let positionsDirty = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      let alpha = breath + 0.08 * Math.sin(t * 2.4 + this.phases[i]);
      let tint = accent;

      if (flickering && i >= range!.start && i < range!.end) alpha *= 0.12;

      if (glitch.active) {
        const roll = Math.random();
        if (roll < 0.07) alpha = 0; // dropout
        else if (roll < 0.28) tint = Math.random() < 0.5 ? 0xffffff : accent;
        const jitter = (((Math.random() * 5) | 0) - 2) * this.stride;
        if (jitter !== 0) {
          p.x = this.baseX[i] + jitter;
          positionsDirty = true;
        }
      }

      p.alpha = alpha;
      p.tint = tint;
    }

    if (positionsDirty) this.container.update();
  }

  settleGlitch(): void {
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].x = this.baseX[i];
      this.particles[i].alpha = 1;
      this.particles[i].tint = 0xffffff;
    }
    this.container.update();
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.particles = [];
  }

  private rebuild(): void {
    this.container.removeParticles();
    this.particles = [];
    this.glyphRanges = [];

    const { glyphs, width, height } = this.raster;
    if (width === 0 || this.cols === 0) {
      this.phases = new Float32Array(0);
      this.baseX = new Float32Array(0);
      this.container.update();
      return;
    }

    // Center horizontally; sit slightly above the vertical midpoint so the
    // spectrogram band at the bottom doesn't crowd the composition.
    const originCol = Math.max(0, Math.floor((this.cols - width) / 2));
    const lift = Math.max(1, Math.round(this.rows * 0.04));
    const originRow = Math.max(0, Math.floor((this.rows - height) / 2) - lift);

    for (const glyph of glyphs) {
      const start = this.particles.length;
      for (const { col, row } of glyph.cells) {
        const p = new Particle({
          texture: this.container.texture,
          x: (originCol + col) * this.stride,
          y: (originRow + row) * this.stride,
          // Texture.WHITE is 1×1 — scale it up to a full LED square.
          scaleX: this.pixelSize,
          scaleY: this.pixelSize,
        });
        this.container.addParticle(p);
        this.particles.push(p);
      }
      this.glyphRanges.push({ start, end: this.particles.length });
    }

    this.baseX = new Float32Array(this.particles.length);
    this.phases = new Float32Array(this.particles.length);
    for (let i = 0; i < this.particles.length; i++) {
      this.baseX[i] = this.particles[i].x;
      this.phases[i] = Math.random() * Math.PI * 2;
    }
    this.container.update();
  }
}
