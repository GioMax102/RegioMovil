import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowRight, RefreshCw, Trash2, Camera, ImagePlus, FolderOpen } from 'lucide-react';
import { loadTransitCatalog, network } from '../api';
import { sendReport, type ReportCategory } from '../reportsApi';
import { prepareReportPhoto } from '../reportPhoto';
import {
  clearReportDraft,
  markReportOpen,
  newReportDraftId,
  readReportDraft,
  saveReportDraft,
  REPORT_DRAFT_TTL,
  type ReportContext,
  type ReportDraft,
} from '../reportDraft';
import { listenForRestoredReportPhoto, nativeReportCamera, pickReportPhoto } from '../reportCamera';
import type { TransitCatalogData } from '../types';
import { Dialog } from './Primitives';
import './reports.css';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');

export type ReportDialogProps = {
  initialStationId?: string;
  initialRouteId?: string;
  initialTargetType?: 'station' | 'route' | 'unit';
  initialLocationReference?: string;
  initialStationIds?: string[];
  context?: ReportContext;
  onClose: () => void;
  onSent: () => void;
};
const Required = () => (
  <span className="report-required" aria-hidden="true">
    {' '}
    *
  </span>
);

export default function ReportDialog({
  initialStationId,
  initialRouteId,
  initialTargetType,
  initialLocationReference,
  initialStationIds,
  context,
  onClose,
  onSent,
}: ReportDialogProps) {
  const [targetType, setTargetType] = useState<'station' | 'unit' | 'route'>(
    initialTargetType || (initialRouteId ? 'route' : 'station'),
  );
  const [stationId, setStationId] = useState(
    initialStationIds ? '' : initialRouteId ? '' : initialStationId || '',
  );
  const [routeId, setRouteId] = useState(initialRouteId || '');
  const [routeQuery, setRouteQuery] = useState('');
  const [catalog, setCatalog] = useState<TransitCatalogData | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [category, setCategory] = useState<ReportCategory>('infrastructure');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [unitReference, setUnitReference] = useState('');
  const [locationReference, setLocationReference] = useState(initialLocationReference || '');
  const [publicationConsent, setPublicationConsent] = useState(false);
  const [photo, setPhoto] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [savedElsewhere, setSavedElsewhere] = useState<ReportDraft | null>(null);
  const [draftId, setDraftId] = useState<string>(newReportDraftId);
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + REPORT_DRAFT_TTL);
  const [draftContext, setDraftContext] = useState(context);
  const [storageStatus, setStorageStatus] = useState('');
  const [picking, setPicking] = useState(false);
  const pickerOpen = useRef(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftRef = useRef<ReportDraft | null>(null);
  const completed = useRef(false);
  const closing = useRef(false);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    const inputs = [cameraInput.current, galleryInput.current, fileInput.current];
    const cancelled = (event: Event) => {
      event.stopPropagation();
      pickerOpen.current = false;
      setPicking(false);
    };
    for (const input of inputs) input?.addEventListener('cancel', cancelled);
    return () => {
      for (const input of inputs) input?.removeEventListener('cancel', cancelled);
    };
  }, [ready, savedElsewhere]);
  const mounted = useRef(false);
  const sending = useRef(false);
  const photoTask = useRef<{ version: number; controller?: AbortController }>({ version: 0 });
  function restore(draft: ReportDraft) {
    setAttempted(draft.attempted || false);
    setDraftId(draft.draftId);
    setExpiresAt(draft.expiresAt);
    setDraftContext(draft.context);
    setTargetType(draft.targetType);
    setStationId(draft.stationId);
    setRouteId(draft.routeId);
    setTitle(draft.title);
    setDetail(draft.detail);
    setCategory(draft.category);
    setUnitReference(draft.unitReference);
    setLocationReference(draft.locationReference);
    setPublicationConsent(draft.publicationConsent);
    setPhoto(draft.photo);
  }
  useEffect(() => {
    let active = true;
    void readReportDraft()
      .then((draft) => {
        if (!active) return;
        if (draft) {
          const sameJourney = draft.context?.journeyId === context?.journeyId;
          const sameTarget = initialRouteId
            ? draft.routeId === initialRouteId
            : !initialStationId || draft.stationId === initialStationId;
          if (sameJourney && sameTarget) restore(draft);
          else setSavedElsewhere(draft);
        }
      })
      .catch(() => {
        if (active)
          setStorageStatus('No pudimos guardar en este dispositivo. Mantén abierto el formulario.');
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const draft: ReportDraft = {
    version: 1,
    draftId,
    expiresAt,
    context: draftContext,
    targetType,
    stationId,
    routeId,
    title,
    detail,
    category,
    unitReference,
    locationReference,
    publicationConsent,
    photo,
    attempted,
  };
  draftRef.current = draft;
  useEffect(() => {
    if (!ready || savedElsewhere || completed.current) return;
    markReportOpen(true);
    let active = true;
    void saveReportDraft(draftRef.current!)
      .then(() => {
        if (active) setStorageStatus('Borrador guardado en este dispositivo durante 24 horas.');
      })
      .catch(() => {
        if (active)
          setStorageStatus('No pudimos guardar en este dispositivo. Mantén abierto el formulario.');
      });
    return () => {
      active = false;
    };
  }, [
    ready,
    savedElsewhere,
    draftId,
    expiresAt,
    targetType,
    stationId,
    routeId,
    title,
    detail,
    category,
    unitReference,
    locationReference,
    publicationConsent,
    photo,
    draftContext,
    attempted,
  ]);
  useEffect(() => {
    if (!ready || savedElsewhere) return;
    let remove: (() => void) | undefined;
    let active = true;
    void listenForRestoredReportPhoto(
      draftId,
      (file) => {
        if (active) void processPhoto(file);
      },
      () => {
        if (active)
          setPhotoError('No pudimos recuperar la foto. Tu texto sigue guardado; elígela de nuevo.');
      },
    )
      .then((cleanup) => {
        if (active) remove = cleanup;
        else cleanup();
      })
      .catch(() => {
        if (active)
          setPhotoError(
            'No pudimos recuperar una selección anterior. Tu borrador sigue aquí; puedes elegir un archivo.',
          );
      });
    return () => {
      active = false;
      remove?.();
    };
  }, [ready, savedElsewhere, draftId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      photoTask.current.controller?.abort();
    };
  }, []);
  useEffect(() => {
    if (targetType === 'station' || catalog) return;
    let active = true;
    setCatalogError('');
    loadTransitCatalog()
      .then((result) => {
        if (active) setCatalog(result.data);
      })
      .catch((cause) => {
        if (active)
          setCatalogError(cause instanceof Error ? cause.message : 'No pudimos abrir las rutas.');
      });
    return () => {
      active = false;
    };
  }, [targetType, catalog, catalogRevision]);

  const selectedStation = network.stations.find((item) => item.id === stationId);
  const selectedRoute = catalog?.routes.find((item) => item.id === routeId);
  const matchingRoutes = (catalog?.routes || []).filter((route) => {
    const label = normalize(`${route.code} ${route.name} ${route.from || ''} ${route.to || ''}`);
    return (
      route.id === routeId ||
      normalize(routeQuery)
        .split(/\s+/)
        .every((term) => label.includes(term))
    );
  });

  async function processPhoto(file: File) {
    photoTask.current.controller?.abort();
    const version = ++photoTask.current.version;
    const controller = new AbortController();
    photoTask.current.controller = controller;
    setPhotoFile(file);
    setPhotoError('');
    setProcessingPhoto(true);
    try {
      const result = await prepareReportPhoto(file, controller.signal);
      if (mounted.current && photoTask.current.version === version && !controller.signal.aborted)
        setPhoto(result);
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
    pickerOpen.current = false;
    setPicking(false);
    if (file) void processPhoto(file);
  }
  async function openPhoto(source: 'camera' | 'gallery' | 'file') {
    if (pickerOpen.current) return;
    pickerOpen.current = true;
    setPicking(true);
    try {
      await saveReportDraft(draftRef.current!);
    } catch {
      setStorageStatus('No pudimos guardar en este dispositivo. Mantén abierto el formulario.');
    }
    if (source !== 'file' && nativeReportCamera()) {
      try {
        const file = await pickReportPhoto(source, draftId);
        if (mounted.current && file) await processPhoto(file);
      } catch (cause) {
        if (mounted.current)
          setPhotoError(cause instanceof Error ? cause.message : 'No pudimos abrir la cámara.');
      } finally {
        pickerOpen.current = false;
        if (mounted.current) setPicking(false);
      }
    } else {
      (source === 'camera'
        ? cameraInput
        : source === 'gallery'
          ? galleryInput
          : fileInput
      ).current?.click();
    }
  }
  async function close() {
    if (pickerOpen.current || closing.current) return;
    closing.current = true;
    markReportOpen(false);
    if (ready && !savedElsewhere && !completed.current) {
      try {
        await saveReportDraft(draftRef.current!);
      } catch {
        /* Kept in memory until the caller closes. */
      }
    }
    if (mounted.current) onClose();
  }
  const validTarget = targetType === 'station' ? !!selectedStation : !!selectedRoute;
  const cannotSubmit =
    busy ||
    !ready ||
    picking ||
    !!savedElsewhere ||
    processingPhoto ||
    !!photoError ||
    !validTarget ||
    title.trim().length < 3 ||
    detail.trim().length < 10;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || cannotSubmit) return;
    sending.current = true;
    const submittedDraft = { ...draftRef.current!, attempted: true };
    setAttempted(true);
    setError('');
    setBusy(true);
    try {
      await saveReportDraft(submittedDraft).catch(() => {});
      await sendReport({
        draftId,
        targetType,
        stationId: targetType === 'route' ? undefined : selectedStation?.id,
        ...(targetType !== 'station' ? { routeId: selectedRoute!.id } : {}),
        ...(targetType === 'unit' ? { unitReference: unitReference.trim() || undefined } : {}),
        ...(targetType === 'route'
          ? { locationReference: locationReference.trim() || undefined }
          : {}),
        category,
        title: title.trim(),
        detail: detail.trim(),
        photo: photo || undefined,
        publicationConsent,
      });
      completed.current = true;
      await clearReportDraft(draftId, submittedDraft).catch(() => {});
      if (mounted.current) {
        markReportOpen(false);
        onSent();
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'No pudimos enviar el reporte. Tu borrador sigue aquí.',
        );
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Dialog title="Tu experiencia cuenta" onClose={() => void close()} preventDismiss={picking}>
      <p className="dialog-intro">
        Comparte lo que observaste para mejorar este lugar. Lo recibimos en privado para revisión.
      </p>
      {!ready ? (
        <p role="status">Recuperando tu borrador…</p>
      ) : savedElsewhere ? (
        <div className="report-draft-choice">
          <p>Tienes un borrador de otra estación, ruta o trayecto. ¿Quieres retomarlo?</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              restore(savedElsewhere);
              setSavedElsewhere(null);
            }}
          >
            Retomar borrador
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              void clearReportDraft(savedElsewhere.draftId)
                .then(() => {
                  if (mounted.current) setSavedElsewhere(null);
                })
                .catch(() => {
                  if (mounted.current)
                    setStorageStatus(
                      'No pudimos descartar el borrador anterior. Intenta de nuevo.',
                    );
                });
            }}
          >
            Descartar anterior y empezar aquí
          </button>
        </div>
      ) : (
        <>
          <p className="report-required-note">
            <span className="report-required">*</span> Campo obligatorio
          </p>
          {attempted && !busy && (
            <p className="report-attempt-note">
              Este envío conserva sus datos para que puedas reintentarlo sin duplicarlo. Para crear
              otra observación, descarta este borrador y abre uno nuevo.
            </p>
          )}
          <form className="report-form" onSubmit={submit} aria-busy={busy || processingPhoto}>
            <label>
              <span>
                ¿Dónde ocurrió?
                <Required />
              </span>
              <select
                required
                value={targetType}
                disabled={busy || attempted}
                onChange={(event) => {
                  const next = event.target.value as 'station' | 'unit' | 'route';
                  setTargetType(next);
                  if (next !== 'station') setStationId('');
                  setPublicationConsent(false);
                }}
              >
                <option value="station">En una estación de Metro</option>
                <option value="route">En una parada o en el recorrido</option>
                <option value="unit">En una unidad</option>
              </select>
            </label>
            {targetType !== 'station' && (
              <>
                <label>
                  Buscar ruta o línea
                  <input
                    type="search"
                    value={routeQuery}
                    disabled={busy || attempted || !catalog}
                    placeholder="Código, nombre o terminal"
                    onChange={(event) => setRouteQuery(event.target.value)}
                  />
                </label>
                {catalogError ? (
                  <div className="inline-error" role="alert">
                    <p>{catalogError}</p>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setCatalogRevision((value) => value + 1)}
                    >
                      <RefreshCw size={16} /> Reintentar rutas
                    </button>
                  </div>
                ) : !catalog ? (
                  <p role="status">Cargando rutas y variantes…</p>
                ) : (
                  <label>
                    <span>
                      Ruta o línea observada
                      <Required />
                    </span>
                    <select
                      value={routeId}
                      required
                      disabled={busy || attempted}
                      onChange={(event) => setRouteId(event.target.value)}
                    >
                      <option value="">Selecciona la ruta y variante exactas</option>
                      {matchingRoutes.map((route) => (
                        <option value={route.id} key={route.id}>
                          {route.code} · {route.name} ·{' '}
                          {catalog.networks.find((item) => item.id === route.networkId)?.name ||
                            route.networkId}
                        </option>
                      ))}
                    </select>
                    {!matchingRoutes.length && (
                      <small>No hay coincidencias. Prueba otro código o nombre.</small>
                    )}
                  </label>
                )}
                {selectedRoute && (
                  <p className="report-target-summary">
                    Ruta seleccionada:{' '}
                    <strong>
                      {selectedRoute.code} · {selectedRoute.name}
                    </strong>
                  </p>
                )}
                {targetType === 'unit' && (
                  <label>
                    Número económico o referencia de la unidad
                    <input
                      value={unitReference}
                      maxLength={80}
                      disabled={busy || attempted}
                      onChange={(event) => setUnitReference(event.target.value)}
                      placeholder="Identificador visible en el vehículo"
                    />
                    <small>Este dato identifica el vehículo; la ruta se elige arriba.</small>
                  </label>
                )}
                {targetType === 'route' && (
                  <label>
                    Parada, cruce o lugar de referencia
                    <input
                      value={locationReference}
                      maxLength={120}
                      disabled={busy || attempted}
                      onChange={(event) => setLocationReference(event.target.value)}
                      placeholder="Ej. Av. Universidad y Nogalar, sentido norte"
                    />
                    <small>Ubica dónde falta o está dañada la infraestructura.</small>
                  </label>
                )}
              </>
            )}
            {targetType !== 'route' && (
              <label>
                <span>
                  {targetType === 'station' ? (
                    <>
                      Estación de Metro
                      <Required />
                    </>
                  ) : (
                    'Estación de observación'
                  )}
                </span>
                <select
                  value={stationId}
                  required={targetType === 'station'}
                  disabled={busy || attempted}
                  onChange={(event) => setStationId(event.target.value)}
                >
                  <option value="">
                    {targetType === 'station'
                      ? 'Selecciona la estación'
                      : 'No corresponde a una estación de Metro'}
                  </option>
                  {network.stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name} · {station.municipality}
                    </option>
                  ))}
                </select>
                {initialStationIds?.length && draftContext?.journeyId === context?.journeyId ? (
                  <small>
                    Paradas de este tramo:{' '}
                    {network.stations
                      .filter((station) => initialStationIds.includes(station.id))
                      .map((station) => station.name)
                      .join(' · ')}
                    . Confirma dónde observaste el problema.
                  </small>
                ) : null}
              </label>
            )}
            <label>
              <span>
                ¿Qué observaste?
                <Required />
              </span>
              <select
                required
                value={category}
                disabled={busy || attempted}
                onChange={(event) => setCategory(event.target.value as ReportCategory)}
              >
                <option value="infrastructure">
                  Infraestructura: banca, techo, señalización o parada
                </option>
                <option value="accessibility">Accesibilidad</option>
                <option value="condition">Daños, limpieza o inundación</option>
                <option value="climate">Aire acondicionado</option>
                <option value="crowding">Saturación de personas</option>
              </select>
            </label>
            <label>
              <span>
                Título
                <Required />
              </span>
              <input
                value={title}
                minLength={3}
                maxLength={100}
                required
                disabled={busy || attempted}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej. Falta una banca en el andén"
              />
            </label>
            <label>
              <span>
                Cuéntanos un poco
                <Required />
              </span>
              <textarea
                value={detail}
                minLength={10}
                maxLength={500}
                required
                disabled={busy || attempted}
                onChange={(event) => setDetail(event.target.value)}
                placeholder="Describe lo que observaste, sin incluir datos personales."
                rows={4}
              />
              <span className="character-count">{detail.length}/500 · Mínimo 10 caracteres</span>
            </label>
            <div className="report-photo-field">
              <strong>Foto</strong>
              <div className="report-photo-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || attempted || picking}
                  onClick={() => void openPhoto('camera')}
                >
                  <Camera size={18} />
                  Tomar foto
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || attempted || picking}
                  onClick={() => void openPhoto('gallery')}
                >
                  <ImagePlus size={18} />
                  Elegir de galería
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || attempted || picking}
                  onClick={() => void openPhoto('file')}
                >
                  <FolderOpen size={18} />
                  Elegir archivo
                </button>
              </div>
              <label className="sr-only">
                Tomar foto
                <input
                  ref={cameraInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={choosePhoto}
                  tabIndex={-1}
                />
              </label>
              <label className="sr-only">
                Elegir de galería
                <input
                  ref={galleryInput}
                  type="file"
                  accept="image/*"
                  onChange={choosePhoto}
                  tabIndex={-1}
                />
              </label>
              <label className="sr-only">
                Elegir archivo
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || attempted}
                  onChange={choosePhoto}
                  tabIndex={-1}
                />
              </label>
              {picking && (
                <div role="status">
                  <p>Elige una foto o cancela para volver a tu reporte.</p>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      pickerOpen.current = false;
                      setPicking(false);
                    }}
                  >
                    Volver al formulario
                  </button>
                </div>
              )}
              <small>
                Hasta 8 MB. Se reduce a 400 KB y se eliminan los metadatos del archivo original.
              </small>
              {processingPhoto && <p role="status">Preparando la foto… Espera antes de enviar.</p>}
              {photo && (
                <>
                  <img
                    className="report-photo-preview"
                    src={photo}
                    alt="Vista previa de la foto adjunta"
                  />
                  <p>Foto lista para adjuntar.</p>
                </>
              )}
              {photoError && (
                <div className="inline-error" role="alert">
                  <p>{photoError}</p>
                  {photoFile && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void processPhoto(photoFile)}
                      disabled={busy || attempted}
                    >
                      <RefreshCw size={16} /> Reintentar foto
                    </button>
                  )}
                </div>
              )}
              {(photoFile || photo) && (
                <button
                  className="text-button"
                  type="button"
                  onClick={removePhoto}
                  disabled={busy || attempted}
                >
                  <Trash2 size={16} /> Quitar foto
                </button>
              )}
            </div>
            <p className="subtle">
              No compartas rostros, placas ni datos personales. La revisión puede rechazar o retirar
              una publicación. El reporte no se envía automáticamente a las autoridades.
            </p>
            <label className="report-consent">
              <input
                type="checkbox"
                checked={publicationConsent}
                disabled={busy || attempted}
                onChange={(event) => setPublicationConsent(event.target.checked)}
              />
              <span>
                Acepto que, después de una revisión, el texto y la foto puedan mostrarse
                públicamente en la {targetType === 'station' ? 'estación' : 'ruta'} seleccionada. Si
                no acepto, el reporte permanece privado.
              </span>
            </label>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button full-width" type="submit" disabled={cannotSubmit}>
              {busy ? 'Enviando…' : 'Enviar reporte al piloto'}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="report-draft-status" role="status">
            {storageStatus}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={busy || picking}
            onClick={() => {
              if (closing.current) return;
              completed.current = true;
              closing.current = true;
              void clearReportDraft(draftId)
                .then(() => {
                  if (mounted.current) {
                    markReportOpen(false);
                    onClose();
                  }
                })
                .catch(() => {
                  closing.current = false;
                  completed.current = false;
                  if (mounted.current)
                    setStorageStatus('No pudimos descartar el borrador. Intenta de nuevo.');
                });
            }}
          >
            <Trash2 size={16} />
            Descartar borrador
          </button>
        </>
      )}
    </Dialog>
  );
}
