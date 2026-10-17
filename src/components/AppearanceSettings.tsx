import { useId } from 'react';
import type { Appearance, ThemePreference } from '../appearance';

export function AppearanceSettings({ appearance }: { appearance: Appearance }) {
  const id = useId();
  return (
    <fieldset className="appearance-settings">
      <legend>Apariencia</legend>
      <div className="setting-row">
        <label htmlFor={`${id}-theme`}>
          <strong id={`${id}-theme-label`}>Tema</strong>
          <small id={`${id}-theme-description`}>Elige cómo prefieres ver tu camino.</small>
        </label>
        <select
          id={`${id}-theme`}
          aria-labelledby={`${id}-theme-label`}
          aria-describedby={`${id}-theme-description`}
          className="appearance-theme-select"
          value={appearance.theme}
          onChange={(event) => appearance.setTheme(event.target.value as ThemePreference)}
        >
          <option value="system">Del sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </div>
      <div className="setting-row">
        <span>
          <strong>Animaciones</strong>
          <small id={`${id}-motion`}>
            {appearance.systemReducedMotion
              ? 'Tu dispositivo solicita menos movimiento. Lo respetamos.'
              : 'Transiciones suaves y confirmaciones al guardar.'}
          </small>
        </span>
        <button
          type="button"
          role="switch"
          aria-label="Animaciones"
          aria-describedby={`${id}-motion`}
          aria-checked={appearance.animations}
          className="appearance-animation-switch"
          onClick={() => appearance.setAnimations(!appearance.animations)}
        >
          <span className="appearance-switch-track">
            <span />
          </span>
        </button>
      </div>
    </fieldset>
  );
}
