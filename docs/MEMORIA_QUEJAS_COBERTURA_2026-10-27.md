# Continuidad de quejas y cobertura · 27 de octubre de 2026

> **Entrega del 28 de octubre:** [cambios de producto y evidencia pendiente](ENTREGA_PRODUCTO_2026-10-28.md). T1–T4 están implementados; cobertura 191/209 buses y 18 pendientes; SQLite v3, borradores y recuperación de guía. El texto restante de esta memoria describe la base anterior. Consultar siempre el estado vivo del plan antes de repetir trabajo.

> **Siguiente iteración, sólo planificada:** leer primero [plan de producto y continuidad de las nueve anotaciones](PLAN_PRODUCTO_COMUNIDAD_2026-10-27.md) y [evaluación de comunidad y visión](MODELO_COMUNIDAD_Y_VISION_2026-10-27.md). Incluyen pérdida de borrador al cancelar Archivos, reportes desde ambas guías, mapa como pantalla, densidad por zoom, etapas de trayecto y auditoría de 24 rutas. Estos pendientes no están implementados; la próxima interacción comienza por T1. El APK de la base `82b455d` sí se compiló, instaló y abrió en Xiaomi por USB después de la validación descrita abajo.

Esta memoria actualiza la continuidad de UI/mapas de `fixes`. El trabajo se realiza en `feature/queja`. La entrega inicial `25950bf` partió por error de `main`; el merge `de7338d` incorporó íntegramente `fixes` hasta `60ea3bc`, conservando mapas, interfaz, guardados y validación previa de Android. No volver a partir de `main` para continuar esta iteración.

## Estado implementado

- Red comparte encabezado y posición de pestañas; Metro y Rutas y redes mantienen la misma jerarquía y foco. El botón de punto de partida conserva textura.
- Reportes contextualizados en estación, parada/recorrido o unidad. Selección explícita de ruta y variante; número económico y referencia de lugar separados. No inferir una ruta por un código repetido ni adjuntar automáticamente la estación de Inicio a una unidad.
- Título, descripción, categoría y foto opcional. Procesamiento JPEG con cancelación, límites, vista previa, eliminación/reintento y bloqueo de envío mientras se procesa. El servidor valida y elimina metadatos también para clientes que omiten el procesamiento local.
- SQLite migra transaccionalmente a esquema v2. Pendientes y rechazados privados; publicados y resueltos requieren consentimiento y revisión. Moderación auditada por CLI. Retención 90 días, máximo 5000 reportes y 50 MB de fotos. No borrar evidencia vigente para aceptar nuevos envíos.
- Fichas de estación/ruta muestran reportes y recuentos abiertos/resueltos, con carga, vacío, error y reintento diferenciados. Los conteos son del conjunto, no sólo de los 20 resultados recientes. Una respuesta de envío perdida conserva el borrador y avisa que pudo recibirse.
- El formulario, sus estilos, su API y los reportes públicos se descargan al necesitarlos. Un fallo de ese módulo no debe ocultar un mapa guardado. La consulta básica de Metro y la pantalla de red permanecen en el precache. Reportes/fotos nunca se cachean.

## Cobertura real

Catálogo: 214 servicios = 209 buses + 5 líneas Metro. Hay 185 buses con geometría y 3 líneas Metro en el grafo: 188 recorridos y 10 794 puntos. Las otras 2 líneas están en construcción. Integradas: 8 de 9.

La afirmación de que las rutas faltantes no tenían fuentes fue incorrecta: había enlaces oficiales pendientes de importación. Se revisaron los enlaces My Maps y las páginas dinámicas del portal IMA; el resultado y las cadenas de procedencia están en `data/ima-map-sources.json`, `data/ima-map-browser-evidence.json` y `data/route-geometry-coverage.json`.

Quedan 24 buses: 6 sin página que coincida inequívocamente, 6 páginas sin mapa recuperable, 1 página con error de descarga, 1 identidad contradictoria (38/310 muestra ruta 213) y 10 Transmetro sin enlace geométrico documentado. El listado individual con enlaces está en `docs/cobertura-rutas-2026-10-27.md` y `docs/inventario-rutas-2026-10-27.csv`.

Conservar segmentos separados y excluir marcadores sólo propuestos o a más de 160 m del trazo. No activar `planningEligible` operativo por tener una geometría: los buses participan en un cálculo experimental con orden/sentido inferidos. No afirmar servicio actual ni infraestructura construida.

## Planeación y guardados

La red ampliada agotaba búsquedas representativas. La cota de coste ahora considera esperas de abordaje tras cambiar caminando de servicio y respeta continuidad entre líneas; mantiene límites de 24 000 expansiones totales y 6000 por sondeo. Conservar las regresiones de San Bernabé–Punto Valle, Las Estaciones–Tec y tramos desconectados.

Los paquetes de viaje guardado conservan sus alternativas, paradas y fuentes; no duplican `coverage.excludedStops` ni el grafo/auditoría de toda la ciudad. Mantener compatibilidad con snapshots v1 y el límite de ocho paquetes sin expulsión silenciosa.

El grafo público pesa unos 8,5 MiB (~1 MiB gzip) y se descarga de forma diferida. El servidor admite compresión exclusivamente para ese documento hasta 12 MiB; otros textos conservan 4 MiB y los binarios no heredan la excepción. El precache inicial queda bajo 600 KiB (614 197 bytes en esta compilación); comprobar el presupuesto al modificar código inicial.

## Operación y validación

El sistema incluye Node v12 en PATH, pero el proyecto necesita Node 24. Runtime usado:

`/home/magio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`

La compilación usa ese binario con `node_modules/typescript/bin/tsc -b`, `scripts/prepare-catalog.mjs`, `scripts/prepare-mobility.mjs`, `scripts/prepare-coverage-inventory.mjs --check`, `node_modules/vite/bin/vite.js build` y `scripts/finalize-web.mjs`.

Las pruebas Node se ejecutan con `--import tsx --test --test-concurrency=4 tests/*.test.mjs tests/*.test.tsx`. Las pruebas del importador son `python3 -m unittest discover -s tests -p 'ima_maps_import_test.py'`.

La validación visual recorrió el formulario con una imagen sintética, guardado privado, publicación por revisión y lectura de la foto. Sólo se usó `/tmp/regiomovil-queja-review.sqlite` para esos envíos; no se enviaron quejas reales. La app local final utiliza su base del proyecto. Backend y Vite pueden iniciarse sólo en loopback para revisión; no abrir la red por defecto.

Las instrucciones de moderación, tratamiento de fotos y evaluación de valor público están en `docs/quejas-comunitarias.md`. El aviso público de privacidad está actualizado. Para operación pública se requiere volumen persistente, respaldo y revisión sostenida; no interpretar los conteos como personas únicas o clasificación automática de inversión.

El usuario autorizó commits y push por interacción, y continuar con la validación completa. Un push de esta rama no actualiza por sí solo el backend remoto ni reinstala el APK. No afirmar despliegue o instalación sin hacer y comprobar esas acciones.

### Resultado final de esta validación

- Suite completa: **339/339 pruebas Node/React**, sin fallos, cancelaciones ni omisiones.
- Importador: **4/4 pruebas Python**.
- TypeScript y compilación de producción correctos; inventario generado comprobado con `--check`.
- Rendimiento en nueve consultas: mediana **525,7 ms**, p95 **554,5 ms**, bajo el límite existente de 1500 ms; gzip del grafo **1048,8 KiB**.
- Presupuesto de arranque y recursos locales: **2/2 comprobaciones**, manteniendo el límite de 600 KiB y CSS/JS comprimidos dentro de sus límites.
- Las capturas de la comprobación visual se guardaron en `/tmp/regiomovil-integradas-final.jpg` y `/tmp/regiomovil-queja-final.jpg`; son evidencia local, no activos del producto.
