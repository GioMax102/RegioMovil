import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowRight, RefreshCw, Trash2 } from 'lucide-react';
import { loadTransitCatalog, network, sendReport, type ReportCategory } from '../api';
import { prepareReportPhoto } from '../reportPhoto';
import type { TransitCatalogData } from '../types';
import { Dialog } from './Primitives';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export default function ReportDialog({ initialStationId, initialRouteId, onClose, onSent }: {
  initialStationId?: string;
  initialRouteId?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [targetType, setTargetType] = useState<'station' | 'unit' | 'route'>(initialRouteId ? 'route' : 'station');
  const [stationId, setStationId] = useState(initialRouteId ? '' : initialStationId || '');
  const [routeId, setRouteId] = useState(initialRouteId || '');
  const [routeQuery, setRouteQuery] = useState('');
  const [catalog, setCatalog] = useState<TransitCatalogData | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [category, setCategory] = useState<ReportCategory>('infrastructure');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [unitReference, setUnitReference] = useState('');
  const [locationReference, setLocationReference] = useState('');
  const [publicationConsent, setPublicationConsent] = useState(false);
  const [photo, setPhoto] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const sending = useRef(false);
  const photoTask = useRef<{ version: number; controller?: AbortController }>({ version: 0 });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; photoTask.current.controller?.abort(); };
  }, []);
  useEffect(() => {
    if (targetType === 'station' || catalog) return;
    let active = true;
    setCatalogError('');
    loadTransitCatalog().then(result => { if (active) setCatalog(result.data); }).catch(cause => {
      if (active) setCatalogError(cause instanceof Error ? cause.message : 'No pudimos abrir las rutas.');
    });
    return () => { active = false; };
  }, [targetType, catalog, catalogRevision]);

  const selectedStation = network.stations.find(item => item.id === stationId);
  const selectedRoute = catalog?.routes.find(item => item.id === routeId);
  const matchingRoutes = (catalog?.routes || []).filter(route => {
    const label = normalize(`${route.code} ${route.name} ${route.from || ''} ${route.to || ''}`);
    return route.id === routeId || normalize(routeQuery).split(/\s+/).every(term => label.includes(term));
  });

  async function processPhoto(file: File) {
    photoTask.current.controller?.abort();
    const version = ++photoTask.current.version;
    const controller = new AbortController();
    photoTask.current.controller = controller;
    setPhotoFile(file);
    setPhoto('');
    setPhotoError('');
    setProcessingPhoto(true);
    try {
      const result = await prepareReportPhoto(file, controller.signal);
      if (mounted.current && photoTask.current.version === version && !controller.signal.aborted) setPhoto(result);
    } catch (cause) {
      if (mounted.current && photoTask.current.version === version && !controller.signal.aborted) {
        setPhotoError(cause instanceof Error ? cause.message : 'No pudimos procesar la foto.');
      }
    } finally {
      if (mounted.current && photoTask.current.version === version) setProcessingPhoto(false);
    }
  }
  function removePhoto() {
    photoTask.current.version += 1;
    photoTask.current.controller?.abort();
    setPhotoFile(null);
    setPhoto('');
    setPhotoError('');
    setProcessingPhoto(false);
  }
  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void processPhoto(file);
  }
  const validTarget = targetType === 'station' ? !!selectedStation : !!selectedRoute;
  const cannotSubmit = busy || processingPhoto || !!photoError || !validTarget || title.trim().length < 3 || detail.trim().length < 10;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || cannotSubmit) return;
    sending.current = true;
    setError('');
    setBusy(true);
    try {
      await sendReport({
        targetType,
        stationId: targetType === 'route' ? undefined : selectedStation?.id,
        ...(targetType !== 'station' ? { routeId: selectedRoute!.id } : {}),
        ...(targetType === 'unit' ? { unitReference: unitReference.trim() || undefined } : {}),
        ...(targetType === 'route' ? { locationReference: locationReference.trim() || undefined } : {}),
        category, title: title.trim(), detail: detail.trim(), photo: photo || undefined, publicationConsent,
      });
      if (mounted.current) onSent();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'No pudimos enviar el reporte. Tu borrador sigue aquí.');
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Dialog title="Tu experiencia cuenta" onClose={onClose}>
      <p className="dialog-intro">Describe una falla que hayas observado. Se guarda de forma privada para revisión; no se envía a autoridades ni cambia las predicciones.</p>
      <form className="report-form" onSubmit={submit} aria-busy={busy || processingPhoto}>
        <label>
          ¿Dónde ocurrió?
          <select value={targetType} disabled={busy} onChange={event => {
            const next = event.target.value as 'station' | 'unit' | 'route';
            setTargetType(next);
            if (next !== 'station') setStationId('');
            setPublicationConsent(false);
          }}>
            <option value="station">En una estación de Metro</option><option value="route">En una parada o en el recorrido</option><option value="unit">En una unidad</option>
          </select>
        </label>
        {targetType !== 'station' && <>
          <label>Buscar ruta o línea<input type="search" value={routeQuery} disabled={busy || !catalog} placeholder="Código, nombre o terminal" onChange={event => setRouteQuery(event.target.value)} /></label>
          {catalogError ? <div className="inline-error" role="alert"><p>{catalogError}</p><button type="button" className="text-button" onClick={() => setCatalogRevision(value => value + 1)}><RefreshCw size={16} /> Reintentar rutas</button></div> : !catalog ? <p role="status">Cargando rutas y variantes…</p> : <label>
            Ruta o línea observada
            <select value={routeId} required disabled={busy} onChange={event => setRouteId(event.target.value)}>
              <option value="">Selecciona la ruta y variante exactas</option>
              {matchingRoutes.map(route => <option value={route.id} key={route.id}>{route.code} · {route.name} · {catalog.networks.find(item => item.id === route.networkId)?.name || route.networkId}</option>)}
            </select>
            {!matchingRoutes.length && <small>No hay coincidencias. Prueba otro código o nombre.</small>}
          </label>}
          {selectedRoute && <p className="report-target-summary">Ruta seleccionada: <strong>{selectedRoute.code} · {selectedRoute.name}</strong></p>}
          {targetType === 'unit' && <label>Número económico o referencia de la unidad (opcional)<input value={unitReference} maxLength={80} disabled={busy} onChange={event => setUnitReference(event.target.value)} placeholder="Identificador visible en el vehículo" /><small>Este dato identifica el vehículo; la ruta se elige arriba.</small></label>}
          {targetType === 'route' && <label>Parada, cruce o lugar de referencia (opcional)<input value={locationReference} maxLength={120} disabled={busy} onChange={event => setLocationReference(event.target.value)} placeholder="Ej. Av. Universidad y Nogalar, sentido norte" /><small>Ubica dónde falta o está dañada la infraestructura.</small></label>}
        </>}
        {targetType !== 'route' && <label>
          {targetType === 'station' ? 'Estación de Metro' : 'Estación de observación (opcional)'}
          <select value={stationId} required={targetType === 'station'} disabled={busy} onChange={event => setStationId(event.target.value)}>
            <option value="">{targetType === 'station' ? 'Selecciona la estación' : 'No corresponde a una estación de Metro'}</option>
            {network.stations.map(station => <option key={station.id} value={station.id}>{station.name} · {station.municipality}</option>)}
          </select>
        </label>}
        <label>¿Qué observaste?<select value={category} disabled={busy} onChange={event => setCategory(event.target.value as ReportCategory)}><option value="infrastructure">Infraestructura: banca, techo, señalización o parada</option><option value="accessibility">Accesibilidad</option><option value="condition">Daños, limpieza o inundación</option><option value="climate">Aire acondicionado</option><option value="crowding">Saturación de personas</option></select></label>
        <label>Título<input value={title} minLength={3} maxLength={100} required disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="Ej. Falta una banca en el andén" /></label>
        <label>Cuéntanos un poco<textarea value={detail} minLength={10} maxLength={500} required disabled={busy} onChange={event => setDetail(event.target.value)} placeholder="Describe lo que observaste, sin incluir datos personales." rows={4} /><span className="character-count">{detail.length}/500 · Mínimo 10 caracteres</span></label>
        <div className="report-photo-field">
          <label>Foto (opcional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={choosePhoto} /></label>
          <small>Hasta 8 MB. Se reduce a 400 KB y se eliminan los metadatos del archivo original.</small>
          {processingPhoto && <p role="status">Preparando la foto… Espera antes de enviar.</p>}
          {photo && <><img className="report-photo-preview" src={photo} alt="Vista previa de la foto adjunta" /><p>Foto lista para adjuntar.</p></>}
          {photoError && <div className="inline-error" role="alert"><p>{photoError}</p>{photoFile && <button className="text-button" type="button" onClick={() => void processPhoto(photoFile)} disabled={busy}><RefreshCw size={16} /> Reintentar foto</button>}</div>}
          {photoFile && <button className="text-button" type="button" onClick={removePhoto} disabled={busy}><Trash2 size={16} /> Quitar foto</button>}
        </div>
        <p className="subtle">No compartas rostros, placas ni datos personales. La revisión puede rechazar o retirar una publicación.</p>
        <label className="report-consent"><input type="checkbox" checked={publicationConsent} disabled={busy} onChange={event => setPublicationConsent(event.target.checked)} /><span>Acepto que, después de una revisión, el texto y la foto puedan mostrarse públicamente en la {targetType === 'station' ? 'estación' : 'ruta'} seleccionada. Si no acepto, el reporte permanece privado.</span></label>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button className="primary-button full-width" type="submit" disabled={cannotSubmit}>{busy ? 'Enviando…' : 'Enviar reporte al piloto'}<ArrowRight size={17} /></button>
      </form>
    </Dialog>
  );
}
