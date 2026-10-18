/**
 * Gruvbox palette — the app's only color scheme.
 * Hex values mirror the colorscheme's signature colors and are kept in sync
 * with the CSS variables in src/index.css (:root).
 */
export const THEME = {
  /** Canvas + UI accent color (logo glyphs, spectrogram, glitch, borders). */
  accent: '#fe8019',
  /** Canvas clear color + page background. */
  background: '#282828',
  /** Default UI text color. */
  text: '#ebdbb2',
} as const;
