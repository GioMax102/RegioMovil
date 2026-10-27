import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import SectionLoading from './SectionLoading';

/** A failed optional download must leave the application's navigation usable. */
export default function DeferredSection<P extends object>({
  load,
  componentProps,
  loadingLabel,
  fallback,
  onRetry,
}: {
  load: () => Promise<{ default: ComponentType<P> }>;
  componentProps: P;
  loadingLabel: string;
  fallback?: ReactNode;
  onRetry: () => void;
}) {
  const [result, setResult] = useState<{ component: ComponentType<P> } | { failed: true } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    setResult(null);
    Promise.resolve()
      .then(load)
      .then(
        (module) => {
          if (active) setResult({ component: module.default });
        },
        () => {
          if (active) setResult({ failed: true });
        },
      );
    return () => {
      active = false;
    };
  }, [load]);
  if (!result) return <SectionLoading label={loadingLabel} />;
  if ('component' in result) {
    const Section = result.component;
    return <Section {...componentProps} />;
  }
  return (
    <section className="panel deferred-section-error" aria-label="Red no disponible">
      <h2>No pudimos abrir las redes</h2>
      <p role="alert">
        Revisa tu conexión y vuelve a intentar. Puedes seguir usando la aplicación.
      </p>
      <button type="button" className="primary-button" onClick={onRetry}>
        Volver a intentar
      </button>
      {fallback}
      <details>
        <summary>¿Sigue sin abrir?</summary>
        <p>
          Si la app se actualizó, recárgala para obtener la versión nueva. Tus guardados se
          conservan.
        </p>
        <button type="button" className="text-button" onClick={() => location.reload()}>
          Recargar aplicación
        </button>
      </details>
    </section>
  );
}
