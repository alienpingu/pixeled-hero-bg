/**
 * @brtsml/pixeled-hero — omarchy-style pixel-canvas hero for React.
 *
 * A single 2D canvas renders a dithered LED fog field with bitmap-glyph text
 * in a 5-level palette ramp, pointer glow, press→stamp ripples, optional
 * audio spectrum and terminal-style reveal animations. Dependency-free
 * (React is the only peer).
 *
 * ```tsx
 * import { HeroCanvas } from '@brtsml/pixeled-hero';
 *
 * <HeroCanvas className="h-[100dvh] w-screen" text="brtsml"
 *   colors={{ preset: 'gruvbox' }} />;
 * ```
 */

export {
  HeroCanvas,
  type HeroCanvasProps,
  type HeroCanvasHandle,
} from './components/HeroCanvas';

export {
  createHeroField,
  PIXEL_GRID_EVENT,
  PIXEL_GRID_CLEAR_EVENT,
  type HeroFieldHandle,
  type PixelGrid,
} from './hero/engine';

export type {
  AudioOptions,
  FieldOptions,
  GridOptions,
  HeroColorsInput,
  HeroOptionsInput,
  PointerOptions,
  PresetName,
  ResolvedHeroOptions,
  RevealEffect,
  RevealOptions,
} from './hero/options';

export {
  DEFAULT_AUDIO,
  DEFAULT_FIELD,
  DEFAULT_GLYPHS,
  DEFAULT_GRID,
  DEFAULT_POINTER,
  DEFAULT_REVEAL,
  resolveOptions,
} from './hero/options';

export { PRESETS, type Palette, type RampLevel } from './hero/ramp';

export { rasterizeText, fromBitmap, type GlyphField } from './hero/glyphs';
export { FONT_HEIGHT, FONT_WIDTH } from './hero/font';
export type { GlyphOptions } from './hero/glyphs';
