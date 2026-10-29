# Guía de revisión técnica

Base documental: **29 de octubre de 2026**, código `cc69761`. Permite reproducir el piloto, evaluar límites y decidir qué falta antes de ampliar operación.

## Recorrido de evaluación

| Área                | Entradas                                                                                                      | Evidencia esperada                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Producto            | [README](../README.md), [propuesta social](propuesta-social.md), [pitch](pitch.md).                           | Capacidades demostrables, simulaciones visibles y promesas pendientes identificadas.  |
| Arquitectura/API    | [Especificación](especificacion-tecnica.md), [API](api.md), `server/app.mjs`, `src/api.ts`.                   | Contrato, validaciones, límites, compatibilidad y errores coincidentes con código.    |
| Datos/algoritmos    | `scripts/prepare-mobility.mjs`, `server/mobility.mjs`, `server/model.mjs`, inventario.                        | Artefactos reproducibles, procedencia, exclusiones y límites de búsqueda.             |
| Reportes/privacidad | `server/storage.mjs`, `server/report-photos.mjs`, `src/reportDraft.ts`, [moderación](quejas-comunitarias.md). | Privacidad por defecto, recuperación, idempotencia y publicación consentida/revisada. |
| Seguridad/operación | [Evaluación](seguridad-y-operacion.md), [SECURITY](../SECURITY.md), Dockerfile y CI.                          | Brechas priorizadas y evidencia antes de declarar requisitos cumplidos.               |
| Entrega/experiencia | [Android](android.md), `tests/`, [publicación](publicacion.md).                                               | Verificación de la misma revisión y pruebas físicas/visuales según alcance.           |

## Reproducir sin datos privados

En un checkout limpio con Node 24+ y pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm docs:check
pnpm build
pnpm test
node scripts/prepare-coverage-inventory.mjs --check
python3 -m unittest discover -s tests -p '*_test.py'
```

Python sólo es necesario para el último comando. Algunas pruebas requieren loopback. No usar la base de un servidor real: las pruebas automatizadas crean bases temporales.

Registrar commit, herramientas, sistema, comando, fecha, resultado y omisiones. Conservar logs saneados en artefactos apropiados; los paths `/tmp` citados en entregas antiguas no son archivos disponibles para otros equipos.

## Condiciones para aprobar una entrega

- [ ] Alcance y limitaciones actualizados; simulaciones distinguibles de reportes reales.
- [ ] Documentación, build y pruebas pertinentes aprobados sobre la candidata.
- [ ] Contratos/esquemas actualizados; migración y recuperación probadas en copia cuando apliquen.
- [ ] Secretos, bases, fotos privadas y llaves fuera del diff y de artefactos públicos.
- [ ] Cobertura derivada del inventario; ninguna ruta fabricada para cerrar pendientes.
- [ ] Pruebas físicas/visuales/accesibilidad registradas según alcance; pendientes explícitos.
- [ ] Identidad de APK, firma, API y revisión coincidentes si se distribuye Android.
- [ ] Riesgos aceptados por responsable antes de ampliar exposición. Un check verde no equivale a aptitud de producción.

La ampliación pública requiere además los entregables de seguridad, persistencia, monitoreo y moderación de la [hoja de ruta](hoja-de-ruta.md). Administración web y detector visual se evalúan con criterios propios.

## Continuidad

Cada lote debe enlazar requisito/anotación, describir entrega, identificar commit, registrar verificación/límites y actualizar el siguiente paso. Conservar el historial fechado y modificar la referencia canónica al cambiar comportamiento. No reutilizar conteos de tests o hashes antiguos como evidencia nueva.

La reorganización documental no publica frontend/API/APK ni modifica reportes. Ver [evidencia documental del 29 de octubre](revision-documental-2026-10-29.md).
