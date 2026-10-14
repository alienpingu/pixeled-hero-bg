import { Application, Texture, type Ticker } from 'pixi.js';
import { toPixiColor } from './color';
import { PixelGrid } from './layers/PixelGrid';
import { PixelText } from './layers/PixelText';
import { Spectrogram } from './layers/Spectrogram';
import { MockSpectrumSource } from './spectrum/MockSpectrumSource';
import type { SpectrumSource } from './spectrum/SpectrumSource';
import type { EngineConfig, GlitchView } from './types';

const GLITCH_DURATION_MS = 520;

/**
 * Full-screen Pixi.js canvas manager for the LED pixel-grid background.
 *
 * Lifecycle: `await PixelGridEngine.create(host, config)` → engine owns the
 * canvas, ticker and pointer listener inside `host`; call `destroy()` on
 * unmount. Handles React StrictMode's double-mount by tolerating a `destroy()`
 * issued while `create()` is still awaiting `Application.init()`.
 *
 * Extension notes:
 * - Spectrum analysis is delegated to a {@link SpectrumSource} — swap in a
 *   Web Audio implementation in `spectrum/SpectrumSource.ts` (commented recipe).
 * - Window resizes are detected by comparing `app.screen` each tick (Pixi's
 *   ResizePlugin does not emit an event), then the layers are re-laid out.
 */
export class PixelGridEngine {
  private readonly app = new Application();
  private readonly host: HTMLElement;
  private readonly spectrumSource: SpectrumSource;
  private cfg: EngineConfig;
  private accent: number;

  private grid: PixelGrid | null = null;
  private text: PixelText | null = null;
  private spectro: Spectrogram | null = null;

  private spectrumBuf = new Float32Array(0);
  private glitch = { active: false, t: 0, intensity: 1, originCol: 0, originRow: 0 };
  private lastW = 0;
  private lastH = 0;
  private time = 0;
  private initialized = false;
  private disposed = false;
  private canvas: HTMLCanvasElement | null = null;

  private constructor(host: HTMLElement, config: EngineConfig) {
    this.host = host;
    this.cfg = { ...config };
    this.accent = toPixiColor(config.accentColor);
    // Mock source today; replace with a WebAudioSpectrumSource when available.
    this.spectrumSource = new MockSpectrumSource();
  }

  static async create(host: HTMLElement, config: EngineConfig): Promise<PixelGridEngine> {
    const engine = new PixelGridEngine(host, config);
    await engine.init();
    return engine;
  }

  /** Apply non-structural config changes to the live engine. */
  setConfig(next: EngineConfig): void {
    const prev = this.cfg;
    this.cfg = { ...next };

    if (next.accentColor !== prev.accentColor) this.accent = toPixiColor(next.accentColor);
    if (next.backgroundColor !== prev.backgroundColor) {
      this.app.renderer.background.color = next.backgroundColor;
    }
    if (next.audioReactivity !== prev.audioReactivity && this.spectrumSource instanceof MockSpectrumSource) {
      this.spectrumSource.intensity = next.audioReactivity ? 1.35 : 1;
    }
    if (next.logoText !== prev.logoText) this.text?.setText(next.logoText);
    // NOTE: `pixelSize` / `gap` are structural — the React hook rebuilds the engine.
  }

  /** Trigger the scramble/glitch effect. `origin` defaults to the canvas center. */
  triggerGlitch(intensity = 1, originCol?: number, originRow?: number): void {
    if (!this.grid || !this.text) return;
    const stride = this.grid.stride;
    this.glitch.active = true;
    this.glitch.t = GLITCH_DURATION_MS;
    this.glitch.intensity = Math.min(1, Math.max(0, intensity));
    this.glitch.originCol = originCol ?? Math.floor(this.lastW / stride / 2);
    this.glitch.originRow = originRow ?? Math.floor(this.lastH / stride / 2);
    this.grid.beginGlitch();
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    this.spectrumSource.stop();
    if (this.initialized) this.destroyPixi();
    // If init() is still pending, its continuation sees `disposed` and tears down.
  }

  private async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.host,
      background: this.cfg.backgroundColor,
      antialias: false, // crisp LED edges
      autoDensity: true,
      resolution: Math.min(globalThis.devicePixelRatio ?? 1, 2),
      powerPreference: 'high-performance',
    });

    if (this.disposed) {
      this.destroyPixi();
      return;
    }

    const canvas = this.app.canvas;
    this.canvas = canvas;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.host.appendChild(canvas);

    const texture = Texture.WHITE; // single shared 1×1 texture for every LED
    this.grid = new PixelGrid(texture, this.cfg.pixelSize, this.cfg.gap);
    this.text = new PixelText(texture);
    this.spectro = new Spectrogram(texture);
    this.app.stage.addChild(this.grid.container, this.text.container, this.spectro.container);
    this.text.setText(this.cfg.logoText);
    this.layout();

    this.app.ticker.add(this.tick, this);
    canvas.addEventListener('pointerdown', this.onPointerDown);

    if (this.cfg.audioReactivity && this.spectrumSource instanceof MockSpectrumSource) {
      this.spectrumSource.intensity = 1.35;
    }
    this.initialized = true;
  }

  private layout(): void {
    const { width, height } = this.app.screen;
    this.lastW = width;
    this.lastH = height;

    const stride = this.grid!.stride;
    const cols = Math.ceil(width / stride);
    const rows = Math.ceil(height / stride);

    this.grid!.layout(cols, rows);
    this.spectro!.layout(cols, rows, stride, this.cfg.pixelSize);
    this.text!.layout(cols, rows, stride, this.cfg.pixelSize);

    if (this.spectrumBuf.length !== this.spectro!.columnCount) {
      this.spectrumBuf = new Float32Array(this.spectro!.columnCount);
    }
  }

  private tick = (ticker: Ticker): void => {
    if (this.disposed || !this.grid || !this.text || !this.spectro) return;

    const dt = Math.min(ticker.elapsedMS, 100); // clamp tab-switch spikes
    this.time += dt;

    // ResizePlugin resizes the renderer silently — detect it here.
    if (this.app.screen.width !== this.lastW || this.app.screen.height !== this.lastH) {
      this.layout();
    }

    if (this.glitch.active) {
      this.glitch.t -= dt;
      if (this.glitch.t <= 0) {
        this.glitch.active = false;
        this.grid.settleGlitch();
        this.text.settleGlitch();
      }
    }

    const glitchView: GlitchView = this.glitch.active
      ? {
          active: true,
          intensity: this.glitch.intensity,
          progress: 1 - this.glitch.t / GLITCH_DURATION_MS,
          originCol: this.glitch.originCol,
          originRow: this.glitch.originRow,
        }
      : { active: false, intensity: 0, progress: 1, originCol: 0, originRow: 0 };

    this.spectrumSource.sample(this.spectro.columnCount, dt, this.spectrumBuf);

    this.grid.update(dt, this.time, this.accent, glitchView);
    this.text.update(dt, this.time, this.accent, glitchView);
    this.spectro.update(dt, this.spectrumBuf, this.accent);
  };

  private onPointerDown = (ev: PointerEvent): void => {
    if (!this.cfg.enableGlitchOnClick || !this.canvas || !this.grid) return;

    // User gesture → a future Web Audio source can resume its AudioContext here.
    void this.spectrumSource.start();

    const rect = this.canvas.getBoundingClientRect();
    const stageX = ((ev.clientX - rect.left) / rect.width) * this.lastW;
    const stageY = ((ev.clientY - rect.top) / rect.height) * this.lastH;
    const { col, row } = this.grid.stageToCell(stageX, stageY);
    this.triggerGlitch(1, col, row);
  };

  private destroyPixi(): void {
    try {
      this.app.ticker.remove(this.tick, this);
      this.app.ticker.stop();
    } catch {
      // Ticker may already be torn down if init() never completed.
    }
    this.grid?.destroy();
    this.text?.destroy();
    this.spectro?.destroy();
    this.app.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true, texture: true, textureSource: true },
    );
    this.initialized = false;
  }
}
