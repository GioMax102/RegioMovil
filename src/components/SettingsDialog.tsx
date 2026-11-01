import { useId } from 'react';
import { Check, CloudRain, Info, Leaf, Monitor, Users } from 'lucide-react';
import type { Appearance } from '../appearance';
import type { Scenario } from '../types';
import { AppearanceSettings } from './AppearanceSettings';
import './contextDialogs.css';
import { scenarioLabels } from '../scenarios';

export default function SettingsDialog({
  appearance,
  lockedKiosk,
  largeText,
  contrast,
  lowData,
  scenario,
  kiosk,
  onLargeText,
  onContrast,
  onLowData,
  onScenario,
  onKiosk,
}: {
  appearance: Appearance;
  lockedKiosk: boolean;
  largeText: boolean;
  contrast: boolean;
  lowData: boolean;
  scenario: Scenario;
  kiosk: boolean;
  onLargeText: () => void;
  onContrast: () => void;
  onLowData: () => void;
  onScenario: (scenario: Scenario) => void;
  onKiosk: () => void;
}) {
  const id = useId();
  return (
    <>
      <div className="context-dialog settings-cards">
        {!lockedKiosk && <AppearanceSettings appearance={appearance} />}
        <fieldset className="settings-card">
          <legend>Lectura y accesibilidad</legend>
          <div className="setting-row">
            <span>
              <strong>Texto más grande</strong>
              <small id={`${id}-text`}>Más espacio y mejor lectura.</small>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={largeText}
              aria-label="Texto más grande"
              aria-describedby={`${id}-text`}
              className={`switch ${largeText ? 'on' : ''}`}
              onClick={onLargeText}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <span>
              <strong>Contraste alto</strong>
              <small id={`${id}-contrast`}>Texto y bordes más definidos.</small>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={contrast}
              aria-label="Contraste alto"
              aria-describedby={`${id}-contrast`}
              className={`switch ${contrast ? 'on' : ''}`}
              onClick={onContrast}
            >
              <span />
            </button>
          </div>
        </fieldset>
        <fieldset className="settings-card">
          <legend>Consumo de datos</legend>
          <div className="setting-row">
            <span>
              <strong>Ahorrar datos</strong>
              <small id={`${id}-data`}>
                Mapa local y actualizaciones cada 3 minutos. La búsqueda sigue disponible.
              </small>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={lowData}
              aria-label="Ahorrar datos"
              aria-describedby={`${id}-data`}
              className={`switch ${lowData ? 'on' : ''}`}
              onClick={onLowData}
            >
              <span />
            </button>
          </div>
        </fieldset>
        <fieldset className="settings-card settings-demo">
          <legend>Escenario de demostración</legend>
          <p>
            Este selector cambia las predicciones simuladas. No describe el servicio actual ni
            modifica reportes de la comunidad.
          </p>
          <div className="scenario-grid">
            {(Object.keys(scenarioLabels) as Scenario[]).map((value) => (
              <button
                key={value}
                type="button"
                className={scenario === value ? 'selected' : ''}
                aria-pressed={scenario === value}
                onClick={() => onScenario(value)}
              >
                {value === 'rain' ? (
                  <CloudRain size={18} aria-hidden="true" />
                ) : value === 'peak' ? (
                  <Users size={18} aria-hidden="true" />
                ) : value === 'disruption' ? (
                  <Info size={18} aria-hidden="true" />
                ) : (
                  <Leaf size={18} aria-hidden="true" />
                )}
                {scenarioLabels[value]}
                {scenario === value && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="button" className="primary-button full-width" onClick={onKiosk}>
          <Monitor size={18} aria-hidden="true" />
          {kiosk ? 'Salir del modo parada' : 'Abrir modo parada'}
        </button>
      </div>
    </>
  );
}
