# @brtsml/pixeled-hero

A pixel-canvas hero section in the style of [omarchy.org](https://omarchy.org) —
one 2D `<canvas>` that renders a dithered LED fog field with bitmap-glyph text
in a 5-level palette ramp, plus pointer glow, press→stamp ripples, an optional
audio spectrum and terminal-style reveal animations.

Zero runtime dependencies. React is the only peer.

```
╔══════════════════════════════════╗
║   ░░ ▒▒ ░  ███▄  ▄███  ░ ▒▒  ░   ║  fog: value-noise + ordered dither
║  ▒ ░░  ▒  █     ▌     ▒   ░  ▒   ║  text: pixel font in crest→dim ramp
║ ░  ▒ ░░▒ █ ████ ▌▒▒░░ ▒ ░░  ░ ▒  ║  pointer glow · stamp ripples · audio
╚══════════════════════════════════╝
```

## Install

```sh
npm i @brtsml/pixeled-hero
```

## Quick start

```tsx
import { HeroCanvas } from '@brtsml/pixeled-hero';

export function Landing() {
  return (
    <HeroCanvas
      className="h-[100dvh] w-screen"
      text="brtsml"
      colors={{ preset: 'gruvbox' }}
      reveal={{ effect: 'decrypt', auto: 'mount' }}
    />
  );
}
```

The canvas draws everything — including the text. An invisible sizing anchor
(88 % of the container, capped at 896 px, aspect from the glyph box) defines
the LED cell grid, exactly like omarchy's hidden wordmark div. The component is
a positioned flex box; size it via `className`/`style`.

## How it looks

| layer | what it does |
| --- | --- |
| **field** | every cell gets a static base intensity (elliptical vignette × top fade × "quiet zone" falloff near interactive text), animated by two octaves of seeded 128² value-noise fog + per-cell sparkle, then thresholded by an 8×8 ordered dither → the stable dithered-LED texture |
| **text** | built-in 5×7 "fat pixel" font rasterized at 3 cells per font pixel; rows colored by a canonical 5-level ramp (crest→hover→lit→mid→dim); solid runs when calm, per-cell reactive when touched |
| **pointer** | proximity glow (12-cell reach) that *fades near links/buttons*, plus a drifting ambient glow when idle |
| **press** | hold to charge → release spawns a 15×15 stamp-ring ripple; idle auto-ripples at the ambient light |
| **audio** | optional Web Audio analyser — 32 log bands bump up from the text's bottom edge, bass flux beat inflates the glow |
| **reveal** | `decrypt` / `matrix` / `laser` — the text etches itself in (on mount, on `onGlyphPress`, or via the imperative handle) |

Performance budget: 40 fps cap (25 ms throttle), DPR ≤ 2, integer-snapped rects,
paused when scrolled out of view, single static frame under
`prefers-reduced-motion`, one-shot `onPainted`.

## Configuration

Every group is partial — override only what you need. Defaults match
omarchy.org's shipped engine.

### `colors`

```ts
colors={{ preset: 'tokyoNight', lit: '#9ece6a' }}  // preset + per-level overrides
```

`preset`: `'tokyoNight' | 'gruvbox' | 'catppuccin'` (see `PRESETS`), keys:
`bg, dim, mid, lit, hover, crest`. Or bind live page themes instead:

```ts
cssVars={{ bg: '--t-field-bg', dim: '--t-field-dim', /* … */ }}
```

The engine watches `<html>` attribute mutations and re-reads the vars, so it
tracks site theme switches (optionally re-playing a reveal via
`reveal={{ auto: 'theme' }}`).

### `grid` — cell box derivation

| key | default | |
| --- | --- | --- |
| `cellRatio` | `50/51` | cell height / width |
| `anchorFraction` | `0.88` | anchor width fraction |
| `anchorPadding` | `48` | px subtracted from the container |
| `anchorMaxWidth` | `896` | cap in CSS px |

### `field` — the fog

`enabled`, `noiseSeed`, `sparkleSeed`, `fogScale` (9 cells), `fogMix` (0.6),
`fogDrift`, `sparkle` (0.18), `brightness` (0.62),
`vignette: { squash, inner, span }`, `topFade: { min, offset, height }`,
`dither: { ordered }` (0.78 matrix weight),
`quiet: { selector, distance, exponent }` — interactive elements the field (and
glow) fade around.

### `pointer`

`reachCells` (12), `strength` (0.7), `smoothing`, `ambient`, `beatBoost` (0.84),
`stamps`, `autoRipples`, `chargeSeconds` (1.1), stamp geometry
(`stampBase/Growth/Span/Life`), `rippleDelay/Repeat/Charge`, `crestAt`/`hoverAt`
color thresholds.

### `glyphs`

`pixelScale` (3 — cells per font pixel), `gap` (2 cells between glyphs).
Or bypass the font entirely: `bitmap={['01110…', …]}` — rows of `0`/`1`.

### `audio` / `reveal`

`audio={{ enabled, src, muted, volume, bands, fftSize, range, beat: { … } }}` —
starts muted by design: nothing plays until the user clicks the mute toggle
(autoplay policy). `reveal={{ effect, auto, durationMs }}`.

Also: `maxFps` (40), `dprCap` (2), `warmupMs` (900 fade-in), `reducedMotion`,
`pixelSnapSelector`, `onPainted`, `onGlyphPress`, and a `ref` handle:

```ts
hero.current?.reveal('matrix');
hero.current?.startAudio();
```

## DOM pixel snapping

Like the reference site, the engine publishes a `hero-pixel-grid` event
(`{x, y, cw, ch}` in CSS px) and translates any `[data-px-snap]` element onto
the cell grid — `data-px-snap="x"` snaps horizontally only. On unmount it
emits `hero-pixel-grid-clear` and restores transforms.

## Accessibility

The canvas is `aria-hidden`; the component renders a screen-reader-only span
with the text (or `"Pixel text"` for custom bitmaps — pair `onGlyphPress` with
a real control if the glyph must be actionable). Clicking the wordmark replays
the reveal when no `onGlyphPress` is given.

## Development

```sh
npm run dev          # playground — text/palette/reveal/audio controls
npm run build        # tsc + library ESM (dist/) + type declarations
npm run build:demo   # playground static build (demo-dist/)
npm run lint         # oxlint
npm run typecheck    # tsc -b
```

Publishing: `npm version` → push tag → GitHub release → CI (`release.yml`)
publishes with provenance using `NPM_TOKEN`.

## Credits

Reverse-engineered from the shipped bundle of [omarchy.org](https://omarchy.org)
(their `HeroPixelField` engine) — palette, grid math, dither matrices and
motion constants are theirs; this is a dependency-free TypeScript port with
configurable text, JS reveal effects and a React wrapper. Omarchy is by DHH /
Basecamp. Not affiliated.

## License

MIT © [Samuele Bertocco](https://github.com/sbertocco)
