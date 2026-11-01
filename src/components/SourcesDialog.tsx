import { ExternalLink, Flag, ShieldCheck, Sparkles } from 'lucide-react';
import { network, type Transport } from '../api';
import type { Scenario } from '../types';
import './contextDialogs.css';
import { scenarioLabels } from '../scenarios';

export default function SourcesDialog({
  transport,
  scenario,
}: {
  transport: Transport;
  scenario: Scenario;
}) {
  return (
    <>
      <div className="context-dialog">
        <p className="dialog-intro">
          RegioMóvil es un piloto independiente. No es una aplicación oficial.
        </p>
        <div className="data-cards">
          <section className="data-card" aria-label="Red documentada">
            <ShieldCheck size={22} aria-hidden="true" />
            <h3>Red documentada</h3>
            <p>
              Nombres, conexiones y coordenadas de fuentes públicas. La publicación de un trazo no
              confirma la operación actual.
            </p>
          </section>
          <section className="data-card data-card-demo" aria-label="Operación simulada">
            <Sparkles size={22} aria-hidden="true" />
            <h3>Operación simulada</h3>
            <p>
              Llegadas, afluencia y condiciones de unidad son ejemplos calculados con datos
              sintéticos, sin información en vivo.
            </p>
          </section>
          <section className="data-card" aria-label="Observaciones comunitarias">
            <Flag size={22} aria-hidden="true" />
            <h3>Observaciones comunitarias</h3>
            <p>
              Los reportes aprobados comparten experiencias; no son avisos oficiales ni una
              confirmación técnica. No alimentan la simulación.
            </p>
          </section>
        </div>
        <details className="source-disclosure">
          <summary>Fuentes de la red</summary>
          <div className="source-list">
            {network.sources.map((source) => (
              <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                <span>
                  <strong>{source.title}</strong>
                  <small>
                    {source.verifiedAt
                      ? `Verificación: ${source.verifiedAt}`
                      : 'Fuente pública de consulta'}
                  </small>
                </span>
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            ))}
          </div>
        </details>
        <details className="source-disclosure">
          <summary>Cómo se hacen las predicciones</summary>
          <div className="methodology">
            <p>
              Dos modelos de regresión regularizada estiman tiempo de llegada y ocupación con
              variables de horario, intervalos, centralidad, lluvia y disrupciones. Se entrenan y
              evalúan con muestras sintéticas reproducibles.
            </p>
            <p>
              Los rangos se calculan a partir del error de calibración sintético. Su desempeño no
              demuestra precisión en las calles de Nuevo León. Hace falta validar con datos
              operativos antes de usarlo para decisiones reales.
            </p>
            <p>
              <strong>Situación elegida:</strong> {scenarioLabels[scenario]} ·{' '}
              <strong>Cálculo:</strong>{' '}
              {transport === 'api' ? 'API del piloto' : 'En este dispositivo, sin servidor'}.
            </p>
            <p>
              El planificador combina Metro, Transmetro, RegioRuta, Ecovía/GMG y rutas urbanas con
              puntos y trazos documentados. En autobuses, el orden y los sentidos se infieren del
              mapa y siguen sin validación operativa. En Rutas y redes puedes consultar la fecha y
              fuente de cada servicio. Las líneas en construcción y los servicios sin geometría
              suficiente quedan fuera del cálculo. No hay tráfico en vivo, tarifas integradas, pagos
              ni navegación peatonal.
            </p>
          </div>
        </details>
      </div>
    </>
  );
}
