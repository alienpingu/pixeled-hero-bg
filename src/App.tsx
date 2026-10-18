import { useRef, useState } from 'react';
import { HeroCanvas, type HeroCanvasHandle } from './components/HeroCanvas';
import type { PresetName, RevealEffect } from './hero/options';
import { PRESETS } from './hero/ramp';

/**
 * Playground for the library — exercise the real API.
 * `npm run dev` serves this app; `npm run build` builds the library.
 */
export default function App() {
  const hero = useRef<HeroCanvasHandle>(null);
  const [text, setText] = useState('brtsml');
  const [preset, setPreset] = useState<PresetName>('tokyoNight');
  const [effect, setEffect] = useState<RevealEffect>('decrypt');
  const [audio, setAudio] = useState(false);

  return (
    <HeroCanvas
      ref={hero}
      className="dvh-hero"
      text={text.toUpperCase()}
      colors={{ preset }}
      reveal={{ effect, auto: 'mount', durationMs: 1700 }}
      audio={{ enabled: audio, src: '/song.mp3' }}
    >
      <div className="hud" style={{ pointerEvents: 'auto' }}>
        <label className="hud-row">
          <span>text</span>
          <input
            value={text}
            maxLength={14}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="hud-row">
          <span>palette</span>
          {(Object.keys(PRESETS) as PresetName[]).map((name) => (
            <button
              key={name}
              type="button"
              className={preset === name ? 'on' : ''}
              onClick={() => setPreset(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="hud-row">
          <span>reveal</span>
          {(['decrypt', 'matrix', 'laser'] as const).map((name) => (
            <button
              key={name}
              type="button"
              className={effect === name ? 'on' : ''}
              onClick={() => {
                setEffect(name);
                hero.current?.reveal(name);
              }}
            >
              {name}
            </button>
          ))}
          <button type="button" onClick={() => hero.current?.reveal(effect)}>
            ▶ play
          </button>
        </div>
        <div className="hud-row">
          <span>audio</span>
          <button type="button" className={audio ? 'on' : ''} onClick={() => setAudio((v) => !v)}>
            {audio ? 'song.mp3 on' : 'off'}
          </button>
        </div>
        <p className="hud-hint">move / click + hold / click the wordmark</p>
      </div>
    </HeroCanvas>
  );
}
