import { useEffect, useRef, type RefObject } from 'react';
import { PixelGridEngine } from '../../pixi/PixelGridEngine';
import { DEFAULT_CONFIG, type EngineConfig } from '../../pixi/types';
import type { HeroPixelCanvasProps } from './HeroPixelCanvasProps';

function resolveConfig(props: HeroPixelCanvasProps): EngineConfig {
  return {
    pixelSize: props.pixelSize ?? DEFAULT_CONFIG.pixelSize,
    gap: props.gap ?? DEFAULT_CONFIG.gap,
    responsive: props.responsive ?? DEFAULT_CONFIG.responsive,
    minPixelSize: props.minPixelSize ?? DEFAULT_CONFIG.minPixelSize,
    accentColor: props.accentColor ?? DEFAULT_CONFIG.accentColor,
    backgroundColor: props.backgroundColor ?? DEFAULT_CONFIG.backgroundColor,
    enableGlitchOnClick: props.enableGlitchOnClick ?? DEFAULT_CONFIG.enableGlitchOnClick,
    audioReactivity: props.audioReactivity ?? DEFAULT_CONFIG.audioReactivity,
    audioSrc: props.audioSrc ?? DEFAULT_CONFIG.audioSrc,
    muted: props.muted ?? DEFAULT_CONFIG.muted,
    logoText: props.logoText ?? DEFAULT_CONFIG.logoText,
  };
}

/**
 * Owns the {@link PixelGridEngine} lifecycle for a host element.
 *
 * - Creates the engine on mount; destroys it on unmount (StrictMode-safe).
 * - All prop changes (including sizing) are applied to the live engine via
 *   `setConfig` — sizing triggers an internal re-layout, no re-init needed.
 * - Returns the engine ref so callers can drive imperative, gesture-bound
 *   actions (e.g. `setMuted`) synchronously from a click handler.
 */
export function usePixelGridEngine(
  hostRef: RefObject<HTMLDivElement | null>,
  props: HeroPixelCanvasProps,
): RefObject<PixelGridEngine | null> {
  const engineRef = useRef<PixelGridEngine | null>(null);
  const propsRef = useRef(props);

  // Keep the prop snapshot fresh and stream every change into the live
  // engine (sizing changes trigger an internal re-layout).
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
  }, [hostRef]);

  return engineRef;
}
