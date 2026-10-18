import { SpectrumAudio } from './audio';
import { ditherThreshold } from './dither';
import { fromBitmap, rasterizeText, type GlyphField } from './glyphs';
import {
  PointerFx,
  type GlowSource,
  type RectCss,
  type StampWave,
} from './interactions';
import { sampleNoise, valueNoiseTile, whiteNoise } from './noise';
import {
  applyCssVars,
  resolveOptions,
  type HeroOptionsInput,
  type RevealEffect,
  type ResolvedHeroOptions,
} from './options';
import { buildLevelRamp, blendColors, rowLevel, type Palette } from './ramp';
import { createReveal, type RevealCell, type RevealSession } from './reveal';

const TAU = Math.PI * 2;

/** Grid descriptor published for DOM pixel-snapping (CSS px, viewport space). */
export interface PixelGrid {
  x: number;
  y: number;
  cw: number;
  ch: number;
}

export const PIXEL_GRID_EVENT = 'hero-pixel-grid';
export const PIXEL_GRID_CLEAR_EVENT = 'hero-pixel-grid-clear';

export interface HeroFieldHandle {
  /** Stream new option values into the live engine. */
  setOptions(input: HeroOptionsInput): void;
  /** Fire a one-shot reveal of the text. Defaults to the configured effect. */
  reveal(effect?: RevealEffect | 'none'): void;
  /** Resume the AudioContext + play — must be called from a user gesture. */
  startAudio(): void;
  setMuted(muted: boolean): void;
  hasAudio(): boolean;
  destroy(): void;
}

/**
 * The hero engine — a faithful port of omarchy.org's `HeroPixelField`:
 * one 2D canvas, cell grid anchored to an invisible `[data-hero-anchor]`
 * element, a dithered value-noise fog field, a bitmap-glyph text layer in a
 * 5-level ramp, pointer glow, press→stamp ripples and optional audio.
 *
 * Attach to an element via `createHeroField(canvas, options)` — the canvas'
 * parent is the drawing host and must contain the anchor placeholder.
 */
export function createHeroField(canvas: HTMLCanvasElement, input: HeroOptionsInput): HeroFieldHandle {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('hero engine: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = context;
  const host = canvas.parentElement ?? canvas;

  let opts = resolveOptions(input);
  let palette: Palette = applyCssVars(opts.palette, opts.cssVars);
  let ramp = buildLevelRamp(palette);
  let field: GlyphField = buildField(opts);
  let rowColors: string[] = [];

  let tile = valueNoiseTile(opts.field.noiseSeed);
  let white = whiteNoise(opts.field.sparkleSeed);

  const fx = new PointerFx(opts.pointer, opts.field.quiet.distance, opts.field.quiet.exponent);
  let audio: SpectrumAudio | null = opts.audio.enabled ? new SpectrumAudio(opts.audio) : null;
  let bands = new Float32Array(opts.audio.bands);
  let bandTimes = performance.now();
  let bandsActive = false;
  let beatAmp = 0;

  let session: RevealSession | null = null;
  const revealCells: RevealCell[] = [];

  // Geometry (device px unless noted). j/M = canvas, L/R = cell pitch,
  // F/I = glyph-box origin, z/ye = first cell index, N/P = cell counts.
  let dpr = 1;
  let j = 0;
  let m = 0;
  let L = 16;
  let R = 16;
  let F = 0;
  let I = 0;
  let z = 0;
  let ye = 0;
  let n = 1;
  let p = 1;
  let base = new Float32Array(1);
  let gridKey = '';

  let disposed = false;
  let painted = false;
  let raf = 0;
  let visible = true;
  let lastDraw = 0;
  let staticMode = isStatic(opts);

  rebuildRows();

  // ── lifecycle ─────────────────────────────────────────────────────────────

  if (layout() && !staticMode) startLoop();
  if (staticMode) renderOnce();
  if (opts.reveal.auto === 'mount' && !staticMode) revealNow(opts.reveal.effect);

  const resizeObserver = new ResizeObserver(() => {
    if (!layout()) return;
    if (staticMode) renderOnce();
    else startLoop();
  });
  resizeObserver.observe(host);
  const anchorNode = anchorEl();
  if (anchorNode) resizeObserver.observe(anchorNode);

  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (!visible) cancelLoop();
      else if (!staticMode) startLoop();
    },
    { rootMargin: '64px' },
  );
  io.observe(host);

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerCancel, { passive: true });
  window.addEventListener('contextmenu', onPointerCancel, { passive: true });

  let themeWatcher: MutationObserver | null = null;
  if (opts.cssVars) {
    themeWatcher = new MutationObserver(() => {
      const next = applyCssVars(opts.palette, opts.cssVars);
      if (paletteKey(next) === paletteKey(palette)) return;
      palette = next;
      ramp = buildLevelRamp(palette);
      rebuildRows();
      if (opts.reveal.auto === 'theme') revealNow(opts.reveal.effect);
      if (staticMode) renderOnce();
      else requestFrame();
    });
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
  }

  return {
    setOptions(nextInput) {
      const prev = opts;
      opts = resolveOptions(nextInput);
      const nextPalette = applyCssVars(opts.palette, opts.cssVars);
      const paletteChanged = paletteKey(nextPalette) !== paletteKey(palette);
      if (paletteChanged) {
        palette = nextPalette;
        ramp = buildLevelRamp(palette);
      }
      const staticWas = staticMode;
      staticMode = isStatic(opts);
      fx.setOptions(opts.pointer);
      fx.setQuietProfile(opts.field.quiet.distance, opts.field.quiet.exponent);

      const glyphStructural =
        opts.text !== prev.text ||
        (opts.bitmap ?? undefined) !== (prev.bitmap ?? undefined) ||
        opts.glyphs.pixelScale !== prev.glyphs.pixelScale ||
        opts.glyphs.gap !== prev.glyphs.gap;
      if (glyphStructural) field = buildField(opts);
      if (
        glyphStructural ||
        paletteChanged ||
        opts.field.noiseSeed !== prev.field.noiseSeed ||
        opts.field.sparkleSeed !== prev.field.sparkleSeed
      ) {
        if (opts.field.noiseSeed !== prev.field.noiseSeed) tile = valueNoiseTile(opts.field.noiseSeed);
        if (opts.field.sparkleSeed !== prev.field.sparkleSeed) white = whiteNoise(opts.field.sparkleSeed);
        rebuildRows();
        if (layout()) {
          if (staticMode) renderOnce();
          else requestFrame();
        }
      }

      const audioStructural =
        opts.audio.enabled !== prev.audio.enabled ||
        opts.audio.src !== prev.audio.src ||
        opts.audio.bands !== prev.audio.bands ||
        opts.audio.fftSize !== prev.audio.fftSize ||
        opts.audio.volume !== prev.audio.volume;
      if (audioStructural) {
        audio?.destroy();
        audio = opts.audio.enabled ? new SpectrumAudio(opts.audio) : null;
        bands = new Float32Array(opts.audio.bands);
        bandsActive = false;
        beatAmp = 0;
      }

      if (staticWas !== staticMode) {
        if (staticMode) {
          cancelLoop();
          renderOnce();
        } else {
          startLoop();
        }
      }
    },

    reveal(effect) {
      revealNow(effect ?? opts.reveal.effect);
    },

    startAudio() {
      void audio?.resume();
    },

    setMuted(muted: boolean) {
      audio?.setMuted(muted);
    },

    hasAudio() {
      return audio !== null;
    },

    destroy() {
      disposed = true;
      cancelLoop();
      resizeObserver.disconnect();
      io.disconnect();
      themeWatcher?.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('contextmenu', onPointerCancel);
      audio?.destroy();
      audio = null;
      session = null;
      host.style.cursor = '';
      clearSnap();
      window.dispatchEvent(new CustomEvent(PIXEL_GRID_CLEAR_EVENT));
    },
  };

  // ── internals ─────────────────────────────────────────────────────────────

  function buildField(o: ResolvedHeroOptions): GlyphField {
    return o.bitmap && o.bitmap.length > 0 ? fromBitmap(o.bitmap) : rasterizeText(o.text, o.glyphs);
  }

  function isStatic(o: ResolvedHeroOptions): boolean {
    if (o.reducedMotion === 'always') return true;
    if (o.reducedMotion === 'never') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function paletteKey(pl: Palette): string {
    return `${pl.bg}|${pl.dim}|${pl.mid}|${pl.lit}|${pl.hover}|${pl.crest}`;
  }

  function rebuildRows(): void {
    rowColors = [];
    for (let e = 0; e < field.rowsCount; e++) rowColors.push(palette[rowLevel(e, field.rowsCount)]);
  }

  /** Invisible sizing placeholder whose rect defines the LED cell grid. */
  function anchorEl(): Element | null {
    return host.querySelector('[data-hero-anchor]');
  }

  /** Measure the host + anchor, rebuild the cell grid and base intensities. */
  function layout(): boolean {
    if (disposed) return false;
    const hr = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap);
    j = Math.round(hr.width * dpr);
    m = Math.round(hr.height * dpr);
    if (j < 1 || m < 1) return false;
    canvas.width = j;
    canvas.height = m;

    const cols = Math.max(1, field.cols);
    const rows = Math.max(1, field.rowsCount);
    const anchor = anchorEl()?.getBoundingClientRect();
    if (anchor && anchor.width >= 1) {
      L = (anchor.width * dpr) / cols;
      R = (anchor.height * dpr) / rows;
      F = (anchor.left - hr.left) * dpr;
      I = (anchor.top - hr.top) * dpr;
    } else {
      // Fallback box: centered, sized like the CSS anchor would be.
      const g = opts.grid;
      const boxW = Math.min((hr.width - g.anchorPadding) * g.anchorFraction, g.anchorMaxWidth) * dpr;
      const boxH = (boxW * rows * g.cellRatio) / cols;
      L = boxW / cols;
      R = boxH / rows;
      F = (j - boxW) / 2;
      I = (m - boxH) / 2;
    }

    z = -Math.ceil(F / L) - 1;
    ye = -Math.ceil(I / R) - 1;
    n = Math.ceil((j - F) / L) - z + 1;
    p = Math.ceil((m - I) / R) - ye + 1;

    // Quiet zones: interactive elements whose text the field must not fight.
    const quietEls = opts.field.quiet.selector
      ? [...host.querySelectorAll(opts.field.quiet.selector)]
      : [];
    const quiet: RectCss[] = quietEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    });

    fx.setDpr(dpr);
    fx.setQuietRects(quiet);
    fx.setGeometry({
      cellW: L,
      cellH: R,
      glyphX: F,
      glyphY: I,
      cols,
      rows,
      canvasW: j,
      canvasH: m,
      hostX: hr.left,
      hostY: hr.top,
    });

    // Static base intensity per cell: elliptical vignette × top fade × quiet.
    const v = opts.field.vignette;
    const tf = opts.field.topFade;
    base = new Float32Array(n * p);
    for (let e = 0; e < p; e++) {
      const yDev = I + (ye + e + 0.5) * R;
      const ny = (yDev / m) * 2 - 1;
      const cssY = hr.top + yDev / dpr;
      const fade = Math.min(1, Math.max(tf.min, (yDev / dpr - tf.offset) / tf.height));
      for (let r = 0; r < n; r++) {
        const xDev = F + (z + r + 0.5) * L;
        const ox = (xDev / j) * 2 - 1;
        const s = Math.sqrt(ox * ox + ny * ny * v.squash);
        const c = Math.min(1, Math.max(0, (s - v.inner) / v.span));
        const u = fx.proximity(hr.left + xDev / dpr, cssY);
        base[e * n + r] = c * c * fade * u;
      }
    }

    publishGrid(anchor ?? new DOMRect(hr.left + F / dpr, hr.top + I / dpr, L / dpr, R / dpr));
    return true;
  }

  /** Notify DOM snap helpers when the anchor geometry meaningfully changes. */
  function publishGrid(rect: DOMRect): void {
    const grid: PixelGrid = { x: rect.left, y: rect.top, cw: L / dpr, ch: R / dpr };
    const key = `${grid.x.toFixed(2)},${grid.y.toFixed(2)},${grid.cw.toFixed(4)},${grid.ch.toFixed(4)}`;
    if (key === gridKey) return;
    gridKey = key;
    window.dispatchEvent(new CustomEvent<PixelGrid>(PIXEL_GRID_EVENT, { detail: grid }));
    applySnap(grid);
  }

  function startLoop(): void {
    if (disposed || staticMode || raf !== 0) return;
    raf = requestAnimationFrame(loop);
  }

  function cancelLoop(): void {
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
  }

  function requestFrame(): void {
    lastDraw = 0; // draw on the very next animation frame
    startLoop();
  }

  function loop(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    if (!visible || staticMode) return;
    const interval = 1000 / Math.max(6, opts.maxFps);
    if (now - lastDraw < interval) return;
    lastDraw = now;
    fx.update(now, session !== null);
    frame(now);
  }

  function renderOnce(): void {
    frame(performance.now());
  }

  function frame(now: number): void {
    if (audio) {
      const dt = Math.min(Math.max(now - bandTimes, 1), 100);
      bandTimes = now;
      const snap = audio.update(dt);
      let any = false;
      for (let i = 0; i < bands.length; i++) {
        const value = snap.bands[i] ?? 0;
        const rising = value > bands[i];
        bands[i] += (value - bands[i]) * (rising ? opts.audio.attack : opts.audio.release);
        if (bands[i] > opts.audio.threshold) any = true;
      }
      bandsActive = any;
      beatAmp = Math.max(beatAmp * opts.audio.beatHold, snap.beat);
      if (beatAmp < 0.005) beatAmp = 0;
    }

    const glows = fx.glows(beatAmp);
    const waves = fx.waves(now);

    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, j, m);

    if (opts.field.enabled) fieldPass(glows, waves);
    if (session) revealPass(glows, waves, now);
    else glyphPass(glows, waves);

    if (!painted) {
      painted = true;
      opts.onPainted?.();
    }
  }

  function inGlyph(col: number, row: number): boolean {
    return (
      col >= 0 &&
      col < field.cols &&
      row >= 0 &&
      row < field.rowsCount &&
      field.rows[row][col] === '1'
    );
  }

  /** Dithered fog field (everything that is not a glyph cell). */
  function fieldPass(glows: GlowSource[], waves: StampWave[]): void {
    const fo = opts.field;
    const fogTime = staticMode ? 0 : (lastDraw / 1000) * fo.fogDrift;
    const bump = opts.audio.bump;
    const bandCount = bands.length;

    for (let e = 0; e < p; e++) {
      const row = ye + e;
      const y0 = I + row * R;
      const py = Math.round(y0);
      const ph = Math.round(y0 + R) - py;
      if (ph <= 0) continue;
      const yc = y0 + R / 2;

      for (let r = 0; r < n; r++) {
        const col = z + r;
        if (inGlyph(col, row)) continue;

        const f = base[e * n + r];
        let h = 0;
        if (f > 0.002) {
          const ex = col / fo.fogScale;
          const ey = row / fo.fogScale;
          const f1 = sampleNoise(tile, 128, ex + fogTime * 0.14, ey - fogTime * 0.055);
          const f2 = sampleNoise(tile, 128, ex * 0.55 - fogTime * 0.08, ey * 0.55 + fogTime * 0.06);
          const fog = fo.fogMix * f1 + (1 - fo.fogMix) * f2;
          const twinkle = 0.5 + 0.5 * Math.sin(fogTime * 1.1 + white[(row * 37 + col * 11) & 4095] * TAU);
          h = f * (0.3 + 0.52 * fog * fog + fo.sparkle * twinkle) * fo.brightness;
        }

        const x0 = F + col * L;
        const xc = x0 + L / 2;
        let glow = 0;
        for (const g of glows) {
          const dx = xc - g.x;
          const dy = yc - g.y;
          const d = Math.hypot(dx, dy);
          if (d < g.reach) {
            const k = 1 - d / g.reach;
            const v = k * k * g.strength;
            if (v > glow) glow = v;
          }
        }
        h += glow * opts.pointer.glowGain;

        const stamp = fx.stampAt(xc, yc, waves);
        h += stamp * opts.pointer.stampGain;

        let aud = 0;
        if (bandsActive && f > 0.002) {
          const center = (1 - Math.abs((r + 0.5) / n - 0.5) * 2) * bandCount - 0.5;
          const i0 = Math.max(0, Math.min(bandCount - 1, Math.floor(center)));
          const i1 = Math.min(bandCount - 1, i0 + 1);
          const o = Math.max(0, Math.min(1, center - i0));
          const level = bands[i0] * (1 - o) + bands[i1] * o;
          const c0 = Math.max(0, Math.min(1, (level - bump.floor) / (1 - bump.floor)));
          const fromBottom = p - 1 - e;
          const height = c0 * p * bump.length;
          if (c0 > 0 && fromBottom < height) {
            aud = c0 * (1 - fromBottom / height) ** 0.85;
            h += aud * bump.alpha * Math.min(1, f * 3);
          }
        }

        if (h <= ditherThreshold(white, col, row, fo.dither.ordered)) continue;

        const ce = Math.max(glow, stamp, aud * bump.colorWeight);
        ctx.fillStyle = ce > 0.34 ? palette.lit : ce > 0.1 ? palette.mid : palette.dim;
        const px = Math.round(x0);
        ctx.fillRect(px, py, Math.round(x0 + L) - px, ph);
      }
    }
  }

  /** Effect intensity at a canvas point: glow + stamp rings, 0..~1. */
  function effectAt(x: number, y: number, glows: GlowSource[], waves: StampWave[]): number {
    let best = fx.stampAt(x, y, waves);
    for (const g of glows) {
      const d = Math.hypot(x - g.x, y - g.y);
      if (d < g.reach) {
        const k = 1 - d / g.reach;
        const v = k * k * g.strength;
        if (v > best) best = v;
      }
    }
    return best;
  }

  function glyphCellColor(
    x: number,
    y: number,
    row: number,
    glows: GlowSource[],
    waves: StampWave[],
  ): string {
    const baseCss = rowColors[row] ?? palette.lit;
    const effect = effectAt(x, y, glows, waves);
    if (effect > opts.pointer.crestAt) return palette.crest;
    if (effect > opts.pointer.hoverAt) return palette.hover;
    return baseCss;
  }

  /** The text layer: solid runs when calm, per-cell reactive when touched. */
  function glyphPass(glows: GlowSource[], waves: StampWave[]): void {
    const cols = field.cols;
    const rows = field.rowsCount;
    const gx1 = F + cols * L;
    const gy1 = I + rows * R;
    const near = glows.filter(
      (g) =>
        g.x > F - g.reach && g.x < gx1 + g.reach && g.y > I - g.reach && g.y < gy1 + g.reach,
    );
    const calm = waves.length === 0 && near.length === 0;

    for (let e = 0; e < rows; e++) {
      const line = field.rows[e];
      const y0 = I + e * R;
      const py = Math.round(y0);
      const ph = Math.round(y0 + R) - py;
      if (ph <= 0) continue;

      if (calm) {
        // Fast path: merge horizontal runs of lit cells into one rect each.
        ctx.fillStyle = rowColors[e];
        let run = 0;
        for (let c = 0; c <= cols; c++) {
          if (c < cols && line[c] === '1') {
            run++;
            continue;
          }
          if (run > 0) {
            const x = Math.round(F + (c - run) * L);
            ctx.fillRect(x, py, Math.round(F + c * L) - x, ph);
            run = 0;
          }
        }
        continue;
      }

      for (let c = 0; c < cols; c++) {
        if (line[c] !== '1') continue;
        const x0 = F + c * L;
        const px = Math.round(x0);
        const pw = Math.round(x0 + L) - px;
        ctx.fillStyle = glyphCellColor(x0 + L / 2, y0 + R / 2, e, near, waves);
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }

  /** Reveal layer: etches the text in via a JS terminal-effect animation. */
  function revealPass(glows: GlowSource[], waves: StampWave[], now: number): void {
    if (!session) return;
    session.advance(now);
    revealCells.length = 0;
    session.collect(revealCells);

    ctx.lineCap = 'butt';
    for (const cell of revealCells) {
      if (cell.col < 0 || cell.col >= field.cols || cell.row < 0 || cell.row >= field.rowsCount) continue;
      const x0 = F + cell.col * L;
      const y0 = I + cell.row * R;
      const px = Math.round(x0);
      const py = Math.round(y0);
      const pw = Math.round(x0 + L) - px;
      const ph = Math.round(y0 + R) - py;

      if (cell.kind === 'line') {
        ctx.strokeStyle = cell.color;
        ctx.lineWidth = Math.max(1, Math.round(L / 5));
        ctx.beginPath();
        ctx.moveTo(px, py + ph / 2);
        ctx.lineTo(px + pw, py + ph / 2);
        ctx.stroke();
        continue;
      }

      if (cell.kind === 'dot') {
        const size = Math.max(1, Math.round(pw * Math.sqrt(cell.weight) * 0.9));
        ctx.fillStyle = cell.color;
        ctx.fillRect(px + Math.round((pw - size) / 2), py + Math.round((ph - size) / 2), size, size);
        continue;
      }

      const baseCss = rowColors[cell.row] ?? palette.lit;
      const effectColor = glyphCellColor(x0 + L / 2, y0 + R / 2, cell.row, glows, waves);
      if (cell.target && effectColor !== baseCss) {
        ctx.fillStyle = effectColor;
      } else {
        const from = ramp.nearest(cell.color);
        const to = cell.target ? baseCss : from;
        ctx.fillStyle = cell.settle > 0 ? blendColors(from, to, cell.settle) : from;
      }
      ctx.fillRect(px, py, pw, ph);
    }

    if (session.done) session = null;
  }

  function revealNow(effect?: RevealEffect | 'none'): void {
    const chosen = effect ?? opts.reveal.effect;
    if (chosen === 'none' || staticMode || field.cols === 0) return;
    session = createReveal(chosen, field, opts.reveal.durationMs, {
      dim: palette.dim,
      mid: palette.mid,
      lit: palette.lit,
      hover: palette.hover,
    });
    if (!staticMode) requestFrame();
  }

  // ── pointer wiring ────────────────────────────────────────────────────────

  function hostPoint(clientX: number, clientY: number) {
    const hr = host.getBoundingClientRect();
    const x = (clientX - hr.left) * dpr;
    const y = (clientY - hr.top) * dpr;
    const inside = x >= 0 && y >= 0 && x <= j && y <= m;
    return { x, y, inside };
  }

  function onPointerMove(e: PointerEvent): void {
    const { x, y, inside } = hostPoint(e.clientX, e.clientY);
    fx.pointerMove(x, y, inside);
    const glyph = inside && fx.insideGlyph(x, y);
    host.style.cursor = fx.pressable() && glyph ? 'pointer' : '';
    if (staticMode && inside) renderOnce();
  }

  function onPointerDown(e: PointerEvent): void {
    const { x, y, inside } = hostPoint(e.clientX, e.clientY);
    if (!inside) return;
    const glyph = fx.insideGlyph(x, y);
    const target = e.target instanceof Element ? e.target : null;
    const interactive = !!target?.closest(opts.field.quiet.selector || 'a, button');
    if (glyph) {
      if (opts.onGlyphPress) opts.onGlyphPress();
      else revealNow(opts.reveal.effect);
      return;
    }
    fx.pointerDown(x, y, interactive, false);
  }

  function onPointerUp(e: PointerEvent): void {
    const { inside } = hostPoint(e.clientX, e.clientY);
    fx.pointerUp(inside);
  }

  function onPointerCancel(): void {
    fx.pointerCancel();
  }

  // ── DOM pixel snap ────────────────────────────────────────────────────────

  function snapEls(): HTMLElement[] {
    const sel = opts.pixelSnapSelector;
    return sel ? [...document.querySelectorAll<HTMLElement>(sel)] : [];
  }

  function applySnap(grid: PixelGrid): void {
    const els = snapEls();
    if (els.length === 0) return;
    for (const el of els) el.style.transition = 'none';
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      const dx = Math.round((rect.left - grid.x) / grid.cw) * grid.cw + grid.x - rect.left;
      const axisX = el instanceof HTMLElement && el.dataset.pxSnap === 'x';
      const dy = axisX
        ? 0
        : Math.round((rect.top - grid.y) / grid.ch) * grid.ch + grid.y - rect.top;
      el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
    }
    requestAnimationFrame(() => {
      for (const el of els) el.style.transition = '';
    });
  }

  function clearSnap(): void {
    if (!gridKey) return;
    for (const el of snapEls()) {
      el.style.transform = '';
      el.style.transition = '';
    }
    gridKey = '';
  }
}
