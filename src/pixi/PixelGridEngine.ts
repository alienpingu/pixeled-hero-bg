import { Application, Texture, type Ticker } from 'pixi.js';
import { rampFromBackground, toPixiColor, type GrayRamp } from './color';
import { BouncingSquare } from './layers/BouncingSquare';
import { PixelGrid } from './layers/PixelGrid';
import { PixelText } from './layers/PixelText';
import { Spectrogram } from './layers/Spectrogram';
import { computeCellMetrics } from './metrics';
import { MockSpectrumSource } from './spectrum/MockSpectrumSource';
import { WebAudioSpectrumSource } from './spectrum/WebAudioSpectrumSource';
import { TUNING } from './tuning';
import type { SpectrumSource } from './spectrum/SpectrumSource';
import type { EngineConfig, GlitchView } from './types';

/** Wait for the screen size to settle before rebuilding (mobile URL-bar churn). */
const RESIZE_DEBOUNCE_MS = 140;

/**
 * Full-screen Pixi.js canvas manager for the LED pixel-grid background.
 *
 * Lifecycle: `await PixelGridEngine.create(host, config)` → engine owns the
 * canvas, ticker and pointer listener inside `host`; call `destroy()` on
 * unmount. Handles React StrictMode's double-mount by tolerating a `destroy()`
 * issued while `create()` is still awaiting `Application.init()`.
 *
 * Extension notes:
 * - Spectrum analysis is delegated to a {@link SpectrumSource} — real Web
 *   Audio (`WebAudioSpectrumSource`) when `audioReactivity` + `audioSrc` are
 *   configured, otherwise the synthetic `MockSpectrumSource`.
 * - Window resizes are detected by comparing `app.screen` each tick (Pixi's
 *   ResizePlugin does not emit an event), then the layers are re-laid out.
 */
export class PixelGridEngine {
  private readonly app = new Application();
  private readonly host: HTMLElement;
  private readonly spectrumSource: SpectrumSource;
  /** True when a real track drives the visuals (gates the roaming square). */
  private readonly audioConfigured: boolean;
  private cfg: EngineConfig;
  private accent: number;
  private ramp: GrayRamp;

  private grid: PixelGrid | null = null;
  private text: PixelText | null = null;
  private spectro: Spectrogram | null = null;
  private square: BouncingSquare | null = null;
  private readonly isTextCell = (col: number, row: number): boolean =>
    this.text ? this.text.isOccupied(col, row) : false;

  private spectrumBuf = new Float32Array(0);
  private glitch = { active: false, t: 0, intensity: 1, originCol: 0, originRow: 0 };
  private lastW = 0;
  private lastH = 0;
  private time = 0;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;
  private disposed = false;
  private canvas: HTMLCanvasElement | null = null;

  private constructor(host: HTMLElement, config: EngineConfig) {
    this.host = host;
    this.cfg = { ...config };
    this.accent = toPixiColor(config.accentColor);
    this.ramp = rampFromBackground(toPixiColor(config.backgroundColor));
    // Real Web Audio analysis when reactivity + a track are configured;
    // otherwise the synthetic mock keeps the grid alive.
    this.spectrumSource =
      config.audioReactivity && config.audioSrc
        ? new WebAudioSpectrumSource(config.audioSrc, config.muted)
        : new MockSpectrumSource();
    this.audioConfigured = this.spectrumSource instanceof WebAudioSpectrumSource;
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
      // Theme swap: repaint the whole gray field with the new ramp instead of
      // letting the old static decay through the slow per-cell noise timers.
      this.ramp = rampFromBackground(toPixiColor(next.backgroundColor));
      this.grid?.setRamp(this.ramp);
    }
    if (next.audioReactivity !== prev.audioReactivity && this.spectrumSource instanceof MockSpectrumSource) {
      this.spectrumSource.intensity = next.audioReactivity ? 1.35 : 1;
    }
    if (next.muted !== prev.muted) this.setMuted(next.muted);
    if (next.logoText !== prev.logoText) this.text?.setText(next.logoText);

    // Sizing fields only need a re-layout (cell metrics are derived in layout()).
    const sizingChanged =
      next.pixelSize !== prev.pixelSize ||
      next.gap !== prev.gap ||
      next.responsive !== prev.responsive ||
      next.minPixelSize !== prev.minPixelSize;
    if (sizingChanged && this.initialized) this.layout();
  }

  /** Trigger the scramble/glitch effect. `origin` defaults to the canvas center. */
  triggerGlitch(intensity = 1, originCol?: number, originRow?: number): void {
    if (!this.grid || !this.text) return;
    const stride = this.grid.stride;
    this.glitch.active = true;
    this.glitch.t = TUNING.glitch.durationMs;
    this.glitch.intensity = Math.min(1, Math.max(0, intensity));
    this.glitch.originCol = originCol ?? Math.floor(this.lastW / stride / 2);
    this.glitch.originRow = originRow ?? Math.floor(this.lastH / stride / 2);
  }

  /**
   * Mute/unmute the music output (a toggle click is a user gesture, so this
   * can also be the call that starts a not-yet-started AudioContext).
   */
  setMuted(muted: boolean): void {
    this.cfg.muted = muted;
    if (this.spectrumSource instanceof WebAudioSpectrumSource) {
      this.spectrumSource.setMuted(muted);
      if (!muted) void this.spectrumSource.start();
    }
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
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
    this.grid = new PixelGrid(texture, this.ramp);
    this.text = new PixelText(texture);
    this.spectro = new Spectrogram(texture);
    this.square = new BouncingSquare(texture);
    this.app.stage.addChild(
      this.grid.container,
      this.text.container,
      this.spectro.container,
      this.square.container,
    );
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

    // Responsive cell sizing: shrink LEDs on narrow screens so the column
    // count (and the bitmap text) always fits.
    const metrics = computeCellMetrics(width, this.cfg);
    const cols = Math.ceil(width / metrics.stride);
    const rows = Math.ceil(height / metrics.stride);

    this.grid!.layout(cols, rows, metrics.pixelSize, metrics.gap);
    this.spectro!.layout(cols, rows, metrics.stride, metrics.pixelSize);
    this.text!.layout(cols, rows, metrics.stride, metrics.pixelSize);
    this.square!.layout(cols, rows, metrics.stride, metrics.pixelSize, this.spectro!.bandTopRow);

    if (this.spectrumBuf.length !== this.spectro!.columnCount) {
      this.spectrumBuf = new Float32Array(this.spectro!.columnCount);
    }
  }

  /** Debounced relayout — mobile URL-bar resizes fire continuously while scrolling. */
  private scheduleLayout(): void {
    if (this.resizeTimer !== null) return;
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      if (!this.disposed && this.initialized) this.layout();
    }, RESIZE_DEBOUNCE_MS);
  }

  private tick = (ticker: Ticker): void => {
    if (this.disposed || !this.grid || !this.text || !this.spectro || !this.square) return;

    const dt = Math.min(ticker.elapsedMS, 100); // clamp tab-switch spikes
    this.time += dt;

    // ResizePlugin resizes the renderer silently — detect it here (debounced,
    // because mobile browsers fire continuous resizes while the URL bar moves).
    if (this.app.screen.width !== this.lastW || this.app.screen.height !== this.lastH) {
      this.scheduleLayout();
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
          progress: 1 - this.glitch.t / TUNING.glitch.durationMs,
          originCol: this.glitch.originCol,
          originRow: this.glitch.originRow,
        }
      : { active: false, intensity: 0, progress: 1, originCol: 0, originRow: 0 };

    this.spectrumSource.sample(this.spectro.columnCount, dt, this.spectrumBuf);
    const playing = this.spectrumSource.playing();
    const beat = playing ? this.spectrumSource.beatPulse() : 0;

    this.grid.update(dt, this.time, this.accent, glitchView, beat);
    this.text.update(dt, this.time, this.accent, glitchView, beat);
    // No music playing → the equalizer stays collapsed (fades out smoothly).
    this.spectro.update(dt, this.spectrumBuf, this.accent, playing);
    // The roaming highlight square only appears once the music is unmuted, so
    // a muted/idle background stays clean. Non-audio setups keep it as before.
    this.square.container.visible = playing || !this.audioConfigured;
    this.square.update(dt, this.accent, this.isTextCell, this.glitch.active);
  };

  private onPointerDown = (ev: PointerEvent): void => {
    // User gesture → resume the AudioContext / start playback (no-op for the mock).
    void this.spectrumSource.start();

    if (!this.cfg.enableGlitchOnClick || !this.canvas || !this.grid) return;

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
    this.square?.destroy();
    this.app.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true, texture: true, textureSource: true },
    );
    this.initialized = false;
  }
}
