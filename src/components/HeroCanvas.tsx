import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { createHeroField, type HeroFieldHandle } from '../hero/engine';
import { fromBitmap, rasterizeText } from '../hero/glyphs';
import { resolveOptions, type HeroOptionsInput, type RevealEffect } from '../hero/options';

export interface HeroCanvasHandle {
  /** Fire the text reveal (defaults to the configured effect). */
  reveal(effect?: RevealEffect | 'none'): void;
  /** Unmute + start the audio track (must run inside a user gesture). */
  startAudio(): void;
  setMuted(muted: boolean): void;
  hasAudio(): boolean;
}

export interface HeroCanvasProps extends HeroOptionsInput {
  ref?: Ref<HeroCanvasHandle>;
  className?: string;
  style?: CSSProperties;
  /** Class for the invisible sizing anchor (defaults to the 88% centered box). */
  anchorClassName?: string;
  /** Overlay content above the canvas; the wrapper is `pointer-events: none`. */
  children?: ReactNode;
  /** Show the audio mute toggle when `audio.src` is set. @default true */
  showMuteButton?: boolean;
}

/**
 * Omarchy-style pixel-canvas hero: dithered LED fog + bitmap-glyph text with
 * pointer glow, stamp ripples, optional audio and reveal animations.
 * One `<canvas>` draws everything; text lives in a hidden sizing anchor that
 * defines the cell grid (width / columns).
 *
 * ```tsx
 * <HeroCanvas
 *   className="h-[100dvh] w-screen"
 *   text="brtsml"
 *   colors={{ preset: 'gruvbox' }}
 *   reveal={{ effect: 'decrypt', auto: 'mount' }}
 * />
 * ```
 */
export function HeroCanvas({
  className = '',
  style,
  anchorClassName = '',
  children,
  showMuteButton = true,
  ref,
  ...options
}: HeroCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<HeroFieldHandle | null>(null);
  const [muted, setMuted] = useState(options.audio?.muted ?? true);

  const resolved = resolveOptions(options);
  const glyphField =
    resolved.bitmap && resolved.bitmap.length > 0
      ? fromBitmap(resolved.bitmap)
      : rasterizeText(resolved.text, resolved.glyphs);
  const cols = Math.max(1, glyphField.cols);
  const rows = Math.max(1, glyphField.rowsCount);
  // Box aspect: (cols × cw) / (rows × ch), with ch = cw × cellRatio.
  const aspect = cols / (rows * resolved.grid.cellRatio);
  const anchorWidth = `min((100% - ${resolved.grid.anchorPadding}px) * ${resolved.grid.anchorFraction}, ${resolved.grid.anchorMaxWidth}px)`;
  const bg = resolved.cssVars?.bg
    ? `var(${resolved.cssVars.bg}, ${resolved.palette.bg})`
    : resolved.palette.bg;

  const staticMotion =
    resolved.reducedMotion === 'always' ||
    (resolved.reducedMotion === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Engine lifetime = component lifetime; every prop value streams via setOptions.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      engineRef.current = createHeroField(canvas, options);
      if (!staticMotion && resolved.warmupMs > 0) {
        canvas.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: resolved.warmupMs, easing: 'ease-out', fill: 'backwards' },
        );
      }
    } catch (err) {
      console.error('[HeroCanvas] failed to start hero engine:', err);
    }
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
    // Mount-only: engine creation reads this closure's options as the
    // initial snapshot; later changes flow through the streaming effect.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setOptions(options);
  });

  useImperativeHandle(ref, () => ({
    reveal: (effect) => engineRef.current?.reveal(effect),
    startAudio: () => {
      engineRef.current?.startAudio();
      setMuted(false);
    },
    setMuted: (next) => engineRef.current?.setMuted(next),
    hasAudio: () => engineRef.current?.hasAudio() ?? false,
  }));

  const audioButton = resolved.audio.enabled && !!resolved.audio.src && showMuteButton;

  const toggleSound = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (muted) {
      // Inside the click's user-activation window: resume + unmute together.
      engine.startAudio();
      engine.setMuted(false);
      setMuted(false);
    } else {
      engine.setMuted(true);
      setMuted(true);
    }
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
        backgroundColor: bg,
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
      {/* Invisible anchor: its rect defines the LED cell grid, like
          omarchy's hidden wordmark div. */}
      <div
        data-hero-anchor=""
        aria-hidden="true"
        className={anchorClassName}
        style={{
          visibility: 'hidden',
          pointerEvents: 'none',
          width: anchorWidth,
          aspectRatio: aspect.toFixed(6),
        }}
      />
      {/* Accessible name for the canvas-rendered text. */}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {resolved.bitmap ? 'Pixel text' : resolved.text}
      </span>
      {children && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
          {children}
        </div>
      )}
      {audioButton && (
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={!muted}
          aria-label={muted ? 'Play hero music' : 'Mute hero music'}
          style={{
            position: 'absolute',
            right: 16,
            bottom: 16,
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 9999,
            border: '1px solid rgba(255, 255, 255, 0.15)',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            color: '#a3a3a3',
            cursor: 'pointer',
          }}
        >
          {muted ? <IconMuted /> : <IconPlaying />}
        </button>
      )}
    </div>
  );
}

function IconPlaying() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function IconMuted() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}
