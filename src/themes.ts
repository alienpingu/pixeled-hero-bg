/**
 * Neovim-inspired color palettes.
 * Hex values mirror each colorscheme's signature colors.
 */

export type ThemeId = 'catppuccin' | 'tokyonight' | 'gruvbox' | 'nord' | 'dracula';

export interface Theme {
  id: ThemeId;
  name: string;
  /** Canvas + UI accent color (logo glyphs, spectrogram, glitch, borders). */
  accent: string;
  /** Canvas clear color + page background. */
  background: string;
  /** Default UI text color. */
  text: string;
}

export const THEMES: readonly Theme[] = [
  { id: 'catppuccin', name: 'Catppuccin', accent: '#cba6f7', background: '#1e1e2e', text: '#cdd6f4' },
  { id: 'tokyonight', name: 'TokyoNight', accent: '#7aa2f7', background: '#24283b', text: '#c0caf5' },
  { id: 'gruvbox', name: 'Gruvbox', accent: '#fe8019', background: '#282828', text: '#ebdbb2' },
  { id: 'nord', name: 'Nord', accent: '#88c0d0', background: '#2e3440', text: '#d8dee9' },
  { id: 'dracula', name: 'Dracula', accent: '#bd93f9', background: '#282a36', text: '#f8f8f2' },
];

export const DEFAULT_THEME: Theme = THEMES[0];

export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME;
}
