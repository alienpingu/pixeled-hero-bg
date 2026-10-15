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
    /** Accent dots seeded per beat edge (0 disables the rhythm reaction). */
    beatSpawn: 6,
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
    /** Beat reaction (subtle): white mix + alpha lift at pulse peak. */
    beatWhiteMix: 0.25,
    beatAlphaLift: 0.1,
  },
  spectrum: {
    /** Global speed multiplier for the mock signal's phases. */
    timeScale: 0.55,
    walkStep: 0.05,
    /** Envelope half-life while a bar RISES — tiny for the instant spike attack. */
    attackHalfLifeMs: 24,
    /** Envelope half-life while a bar FALLS — long, lazy decay. */
    releaseHalfLifeMs: 280,
    /** Half-life of the white peak-cap falling down after a spike. */
    peakFallHalfLifeMs: 420,
  },
  audio: {
    /** Output volume when unmuted (mute is a GainNode on the output only). */
    volume: 0.55,
    /** Analyser smoothing time constant (0..1, lower = snappier bins). */
    smoothing: 0.6,
    /** Magnitude floor subtracted before renormalizing — kills room tone. */
    floor: 0.1,
    /** Byte-magnitude gamma (>1 keeps mids dim so peaks punch up). */
    gamma: 0.85,
    /** Fraction of spectrogram columns (from the bass edge) the beat pumps. */
    pulseBandFraction: 0.25,
    /** Extra energy multiplier on those columns at pulse peak. */
    pulseGain: 0.4,
    /** Pulse decay half-life in ms. */
    pulseHalfLifeMs: 140,
    /** Low-frequency bin count used for spectral-flux beat detection. */
    fluxBassBins: 10,
    /** Running-average half-life for the flux baseline (ms). */
    fluxAvgHalfLifeMs: 400,
    /** Flux must exceed baseline × this factor to count as a beat. */
    fluxThreshold: 1.5,
    /** Absolute flux floor so near-silence never triggers a "beat". */
    fluxMin: 0.04,
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
