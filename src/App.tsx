import { HeroPixelCanvas } from './components/HeroPixelCanvas/HeroPixelCanvas';

/**
 * Demo page — overlay content is hidden while we iterate on the canvas.
 * Restore the block below (set SHOW_OVERLAY to true) to get the hero UI back.
 */
const SHOW_OVERLAY = false;

export default function App() {
  return (
    <HeroPixelCanvas className="h-screen w-screen" logoText="PIXEL" accentColor="#4ade80">
      {SHOW_OVERLAY && (
        <>
          {/* Top nav */}
          <header className="pointer-events-auto flex items-center justify-between px-6 py-4 md:px-10">
            <span className="text-sm font-bold tracking-[0.3em] text-[#4ade80]">PIXEL//HERO</span>
            <nav className="flex gap-6 text-xs tracking-widest text-neutral-400 uppercase">
              <a className="transition-colors hover:text-[#4ade80]" href="#grid">
                Grid
              </a>
              <a className="transition-colors hover:text-[#4ade80]" href="#specs">
                Specs
              </a>
              <a className="transition-colors hover:text-[#4ade80]" href="#signal">
                Signal
              </a>
            </nav>
          </header>

          {/* Center copy (sits over the Pixi-rendered pixel text) */}
          <main className="flex h-[calc(100%-8rem)] flex-col items-center justify-center px-6 text-center">
            <p className="mb-4 text-xs tracking-[0.5em] text-neutral-500 uppercase">
              Retro-futuristic signal online
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-neutral-100 drop-shadow-[0_0_24px_rgba(74,222,128,0.25)] md:text-6xl">
              LED MATRIX BACKGROUND
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-400">
              React + TypeScript + Pixi.js pixel grid. Click anywhere on the background to
              trigger a glitch regeneration.
            </p>
            <button
              type="button"
              className="mt-8 cursor-pointer border border-[#4ade80]/60 px-6 py-2 text-xs tracking-[0.3em] text-[#4ade80] uppercase transition-colors hover:bg-[#4ade80]/10"
            >
              Initialize
            </button>
          </main>

          {/* Footer caption */}
          <footer className="absolute right-0 bottom-0 left-0 flex items-end justify-between px-6 pb-24 text-[10px] tracking-widest text-neutral-600 uppercase md:px-10">
            <span>pixi.js v8 · particle grid</span>
            <span>click to glitch</span>
          </footer>
        </>
      )}
    </HeroPixelCanvas>
  );
}
