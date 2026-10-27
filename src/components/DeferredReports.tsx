import DeferredSection from './DeferredSection';

const load = () => import('./PublicReports');

/** Community feeds need a connection; their optional download cannot hide a saved map. */
export default function DeferredReports(props: {
  stationId?: string;
  routeId?: string;
  onReport?: () => void;
}) {
  return (
    <DeferredSection
      load={load}
      componentProps={props}
      loadingLabel="Abriendo reportes…"
      onRetry={() => location.reload()}
      errorFallback={
        <section className="panel">
          <h3>Reportes de la comunidad</h3>
          <p role="status">
            No pudimos cargar la vista de reportes. Conéctate y recarga la aplicación para
            consultarlos.
          </p>
          {props.onReport && (
            <button type="button" className="text-button" onClick={props.onReport}>
              Reportar una falla aquí
            </button>
          )}
        </section>
      }
    />
  );
}
