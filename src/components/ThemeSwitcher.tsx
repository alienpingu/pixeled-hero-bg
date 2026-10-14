import { useEffect, useRef, useState } from 'react';
import { THEMES, type Theme, type ThemeId } from '../themes';

interface ThemeSwitcherProps {
  theme: Theme;
  onSelect: (id: ThemeId) => void;
}

function Swatch({ colors }: { colors: readonly string[] }) {
  return (
    <span className="flex shrink-0 gap-1">
      {colors.map((color) => (
        <span key={color} className="h-2.5 w-2.5" style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}

export function ThemeSwitcher({ theme, onSelect }: ThemeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const select = (id: ThemeId) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute top-4 right-4 z-50 md:top-6 md:right-10"
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${theme.name}`}
        onClick={() => setOpen((prev) => !prev)}
        className="flex cursor-pointer items-center gap-3 border px-4 py-2 text-xs tracking-[0.3em] uppercase transition-colors"
        style={{
          borderColor: `${theme.accent}99`,
          color: theme.accent,
          backgroundColor: `${theme.background}cc`,
        }}
      >
        <Swatch colors={THEMES.map((entry) => entry.accent)} />
        <span>{theme.name}</span>
        <span aria-hidden="true" className="text-[10px]">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <ul
          role="menu"
          aria-label="Select theme"
          className="absolute right-0 mt-2 min-w-48 border py-1 backdrop-blur-sm"
          style={{ borderColor: `${theme.accent}4d`, backgroundColor: `${theme.background}f2` }}
        >
          {THEMES.map((entry) => {
            const active = entry.id === theme.id;
            return (
              <li key={entry.id} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => select(entry.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-2.5 text-left text-xs tracking-[0.2em] uppercase transition-colors"
                  style={{
                    color: active ? entry.accent : theme.text,
                    backgroundColor: active ? `${entry.accent}1a` : undefined,
                  }}
                  onMouseEnter={(event) => {
                    if (!active) event.currentTarget.style.backgroundColor = `${entry.accent}14`;
                  }}
                  onMouseLeave={(event) => {
                    if (!active) event.currentTarget.style.backgroundColor = '';
                  }}
                >
                  <span className="flex items-center gap-3">
                    <span aria-hidden="true" style={{ color: entry.accent }}>
                      {active ? '▶' : ' '}
                    </span>
                    {entry.name}
                  </span>
                  <Swatch colors={[entry.background, entry.accent, entry.text]} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
