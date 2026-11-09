# Guía de revisión técnica

Base documental: **29 de octubre de 2026**, código `cc69761`. Permite reproducir el piloto, evaluar límites y decidir qué falta antes de ampliar operación.

## Recorrido de evaluación

Para probar el producto ejecutable, iniciar el servidor y abrir `/acceso.html`. La [entrega de evaluación web del 1 de noviembre](ENTREGA_EVALUADORES_2026-11-01.md) documenta enlaces directos, navegación, pruebas y límites de la candidata. El recorrido ciudadano no solicita cuenta; la administración sigue siendo privada y exige MFA.

Recorrido de interfaz actualizado el **6 de noviembre de 2026** para Inicio contextual:

1. Abrir Inicio. Metro muestra la estación conservada, las próximas llegadas por sentido y su afluencia simulada sin esperar ubicación, catálogo o mapa. En intercambios, cambiar la línea mediante el control compacto. Fuera del horario general se muestra la próxima apertura.
2. Tocar el vehículo del **selector circular**. Buscar una estación o una ruta de autobús, filtrar por sistema, elegir y confirmar. Cancelar conserva el transporte anterior. Las flechas o el deslizamiento del selector recorren las opciones disponibles; el círculo no inicia un viaje.
3. Elegir manualmente un autobús y una variante concreta. Consultar su mapa y seleccionar una parada cuando haya puntos elegibles. Una ficha sin trazo sigue disponible; no se inventan paradas, llegadas ni afluencia de autobús. Ampliar abre esa selección en Red y permite volver al contexto de Inicio.
4. Probar «Cerca de mí» sólo si se desea ordenar opciones por ubicación. La distancia es en línea recta y puede ser aproximada; no confirma acceso a pie ni vehículos cercanos. La selección manual sigue disponible sin conceder el permiso.
5. Usar **«Planear desde aquí»** para abrir Planear con la estación o parada canónica confirmada como origen y el destino vacío. Si sólo se eligió una ruta, sin parada válida, se solicita el origen. Buscar el destino, comparar alternativas y abrir el detalle o la guía como acciones separadas.
6. Usar **«Reportar aquí»** para abrir el formulario contextual, o «Crear reporte general» para no asignar un transporte. Un borrador existente ofrece «Continuar reporte» y conserva su contexto; tocar el acceso no envía nada. Las observaciones públicas de la estación o variante se muestran tras consentimiento y revisión, con sus límites visibles.
7. Abrir Guardados para retomar viajes reales del dispositivo. El mapa de Metro y el pronóstico aparecen desplegados al iniciar desde el 8 de noviembre; ajustes, fuentes y pronóstico permanecen accesibles.

Esta guía describe el comportamiento que debe revisarse; no acredita pruebas físicas, resultados de CI ni una nueva publicación de web o Android. No hay calificaciones ni estrellas agregadas en este lote.

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
