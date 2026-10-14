/**
 * Central "feel" knobs for the background's motion. Everything that governs
 * how fast or intense the effects read lives here — tweak freely.
 */
export const TUNING = {
  noise: {
    /** Base ms until a cell re-rolls its gray tone. */
    refreshMin: 700,
    refreshJitter: 2600,
    /** Chance a re-roll becomes a bright accent "hot" pixel. */
    hotChance: 0.004,
    hotHoldMin: 200,
    hotHoldJitter: 300,
  },
  text: {
    /** Breathing cycle rate (cycles per second). */
    breathHz: 0.18,
    breathDepth: 0.15,
    /** Random single-glyph CRT flicker cadence. */
    flickerEveryMin: 1400,
    flickerEveryJitter: 2600,
    /** Glitch behavior for the logo pixels. */
    glitchDropoutChance: 0.03,
    glitchFlashChance: 0.12,
    /** Max horizontal jitter (in cells) per glyph pixel during glitches. */
    glitchJitterCells: 1,
  },
  spectrum: {
    /** Global speed multiplier for the mock signal's phases. */
    timeScale: 0.55,
    walkStep: 0.05,
    /** Smoothing half-life in ms (higher = lazier bars). */
    halfLifeMs: 170,
  },
  glitch: {
    durationMs: 600,
    /** Expanding ring look (one continuous band, easing outward). */
    ringWidth: 2.0,
    ringContinuity: 0.95,
    ringWhiteMix: 0.25,
  },
  roamer: {
    /** Square edge length in grid cells (scales with the responsive grid). */
    sizeCells: 3,
    /** Travel speed in cells per second. */
    speed: 4.5,
    /** Random interval between stop+burst moments. */
    stopIntervalMin: 4000,
    stopIntervalJitter: 5000,
    /** How long it halts before bursting and moving on. */
    stopDuration: 450,
    /** Burst particle count, speed (cells/s), life (ms), and velocity damping. */
    burstCount: 14,
    burstSpeed: 12,
    burstLife: 900,
    burstDamping: 1.0,
    /** Directional nudge applied on each bounce so paths stay organic. */
    bounceNudgeDeg: 4,
  },
} as const;
