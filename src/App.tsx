import { ThemeSwitcher } from './components/ThemeSwitcher';
import { HeroPixelCanvas } from './components/HeroPixelCanvas/HeroPixelCanvas';
import { useTheme } from './hooks/useTheme';

/**
 * Demo page — overlay content is hidden while we iterate on the canvas.
 * Restore the block below (set SHOW_OVERLAY to true) to get the hero UI back.
 */
const SHOW_OVERLAY = false;

export default function App() {
  const { theme, setThemeId } = useTheme();

  return (
    <HeroPixelCanvas
      className="h-[100dvh] w-screen"
      logoText="brtsml"
      accentColor={theme.accent}
      backgroundColor={theme.background}
      audioReactivity
    >
      <ThemeSwitcher theme={theme} onSelect={setThemeId} />
    </HeroPixelCanvas>
  );
}
