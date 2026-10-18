import { HeroPixelCanvas } from './components/HeroPixelCanvas/HeroPixelCanvas';
import { THEME } from './theme';

export default function App() {
  return (
    <HeroPixelCanvas
      className="h-[100dvh] w-screen"
      logoText="brtsml"
      accentColor={THEME.accent}
      backgroundColor={THEME.background}
      audioReactivity
    />
  );
}
