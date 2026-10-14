import { useEffect, useRef, type RefObject } from 'react';
import { PixelGridEngine } from '../../pixi/PixelGridEngine';
import { DEFAULT_CONFIG, type EngineConfig } from '../../pixi/types';
import type { HeroPixelCanvasProps } from './HeroPixelCanvasProps';

function resolveConfig(props: HeroPixelCanvasProps): EngineConfig {
  return {
    pixelSize: props.pixelSize ?? DEFAULT_CONFIG.pixelSize,
    gap: props.gap ?? DEFAULT_CONFIG.gap,
    accentColor: props.accentColor ?? DEFAULT_CONFIG.accentColor,
    backgroundColor: props.backgroundColor ?? DEFAULT_CONFIG.backgroundColor,
    enableGlitchOnClick: props.enableGlitchOnClick ?? DEFAULT_CONFIG.enableGlitchOnClick,
    audioReactivity: props.audioReactivity ?? DEFAULT_CONFIG.audioReactivity,
    logoText: props.logoText ?? DEFAULT_CONFIG.logoText,
  };
}

/**
 * Owns the {@link PixelGridEngine} lifecycle for a host element.
 *
 * - Creates the engine on mount; destroys it on unmount (StrictMode-safe).
 * - Rebuilds the engine only for structural props (`pixelSize`).
 * - Streams cosmetic props into the live engine via `setConfig` — no re-init.
 */
export function usePixelGridEngine(
  hostRef: RefObject<HTMLDivElement | null>,
  props: HeroPixelCanvasProps,
): void {
  const engineRef = useRef<PixelGridEngine | null>(null);
  const propsRef = useRef(props);

  const pixelSize = props.pixelSize ?? DEFAULT_CONFIG.pixelSize;
  const gap = props.gap ?? DEFAULT_CONFIG.gap;

  // Runs before the lifecycle effect below: keeps the prop snapshot fresh
  // (including on structural rebuilds) and streams cosmetic updates into the
  // live engine without re-initializing it.
  useEffect(() => {
    propsRef.current = props;
    engineRef.current?.setConfig(resolveConfig(props));
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;

    PixelGridEngine.create(host, resolveConfig(propsRef.current))
      .then((engine) => {
        if (cancelled) {
          engine.destroy(); // unmounted (or StrictMode remount) while init() was in flight
          return;
        }
        engineRef.current = engine;
      })
      .catch((err) => {
        console.error('[HeroPixelCanvas] failed to start Pixi engine:', err);
      });

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [hostRef, pixelSize, gap]);
}
