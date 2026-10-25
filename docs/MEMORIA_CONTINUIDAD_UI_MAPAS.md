# Continuidad de RegioMóvil — mapas y paneles

Actualizado: **25 de octubre de 2026**, America/Monterrey.

## Nueva etapa solicitada: leer primero

El usuario pidió **sólo un plan en esta interacción**, y comenzar el código en la siguiente. El plan activo es [UI, encabezado, textura y cobertura](PLAN_CONTINUIDAD_UI_Y_COBERTURA_2026-10-25.md). Contiene las 12 anotaciones nuevas, archivos implicados, diagnóstico, fases y criterios de aceptación. Todas esas fases están pendientes; no confundirlas con la entrega anterior terminada.

Base actual: `fixes`, commit `14afba3`. El APK de esta entrega **ya se instaló y abrió en el Xiaomi** en la interacción posterior al informe original: instalación `Success`, lanzamiento `Status: ok`, actividad principal visible y `RESUMED`. Sigue pendiente validar los flujos físicos, GPS y accesibilidad. El catálogo local incluye214 servicios; 54 trazos en el mapa y158 autobuses sin geometría importada, además de dos líneas ferroviarias sin mapa operativo en esta versión. La fase4 explica esa diferencia y evita prometer trazos inventados.

## Estado al retomar

La implementación del rediseño solicitado está realizada en **`fixes`**. No reiniciar ni descartar los cambios. La base anterior era `2dab6cfdf827e1e933eccdb65cc5276955c9619e`; comprobar el estado actual con `git status` y `git log`.

**Esta entrega se mantiene local.** No se hizo push, merge ni despliegue de esta UI. La web pública, API y APK público conservan su despliegue anterior. La autorización histórica de publicación no autoriza publicar automáticamente esta tanda.

El usuario solicita una UI limpia y directa, con mapas como contenido principal y búsqueda/resultados/detalle sobrepuestos. Deben conservarse las fuentes, simulaciones, permisos y límites en información plegada; los errores o advertencias relevantes a una acción permanecen visibles.

La evidencia y el estado de validación están en `docs/validacion-ui-mapas-2026-10-25.md` y `output/qa/mapas-paneles-20261025/`. Las capturas de `usabilidad-20261024/` son anteriores al rediseño.

## Implementación consolidada

- **Planear:** un solo `LocationMap` y un `MapSheet` no modal. Formulario, búsqueda, selección del pin, alternativas y detalle cambian dentro del mismo panel. En escritorio es lateral; en móvil se desliza por la manija. También se puede ajustar por botón y teclado.
- **Búsqueda:** sin todas las estaciones al abrir; aparecen tras escribir o buscar explícitamente. Conserva GPS puntual, pin, direcciones, cruces y lugares del servicio existente. Estación exacta antes que coincidencia remota amplia, orden visual y de teclado iguales, sin preview anterior tras editar. Debounce, cancelación, IME y protección contra respuestas tardías preservados.
- **Teclado/viewport:** `useMapWorkspaceHeight` mide encabezado, navegación, áreas seguras y `visualViewport`. Con teclado se oculta navegación inferior y manija; se conserva una franja del mapa y el panel usa el 82% disponible. Corregidos mínimos que desbordaban en horizontal y desbordamientos a 320 px con texto grande.
- **Resultados:** prioridades recalculan sin repetir Buscar; filtros de transporte, tarjetas compactas con nombres de servicios y detalle dentro del panel. Origen/destino editables desde resultados. Guardado explícito y regreso de foco al encabezado tras cerrar su diálogo.
- **Guía:** mapa y siguiente acción, controles manuales «Ya bajé» / «Ya llegué», detener/pausar disponibles; se inicia sólo por acción explícita. Condiciones GPS y ámbito de primer plano conservados; no promete avisos en segundo plano. Al terminar vuelve al botón de inicio.
- **Red:** mapa ocupa el espacio disponible, buscador textual accesible, filtros horizontales, catálogo inicialmente cerrado; tocar el mapa o Enter lo amplía. Sólo un mapa montado. Fichas con datos de unidad/pagos/fuentes plegados.
- **Mapas estandarizados:** `MobilityMap` delega en `LocationMap`, también en guardados. Geometrías completas y segmentos separados, sin unir coordenadas inválidas; zoom mínimo regional adaptable a pantallas estrechas; reencuadre al cambiar tamaño sin deshacer cada desplazamiento manual. Snapshots v1 sin `route.segments` siguen abriendo con la geometría de sus etapas.
- **Metro:** línea a la izquierda, estación a la derecha, sugerencias tras interacción y GPS automático únicamente con permiso previamente concedido. Header pequeño con ojo sólo si existe fotografía documentada, enlace Maps y guardar. Accesibilidad de equipos sin verificar no se presenta como confirmada.
- **Horarios:** Inicio, detalle y kiosco ocultan llegadas simuladas durante cierre; pronóstico horizontal filtra horas cerradas. Horario general publicado de Metrorrey y excepciones en `metroServiceHours.ts`, fuente oficial consultada el 24 de octubre. No equivale a estado operativo en vivo.
- **Inicio:** accesos icono+título de trayectos guardados reales, conectados a `SavedTripPreview`. En la navegación móvil la etiqueta corta es «Viajes».
- **Identidad y accesibilidad:** superficies opacas/neutrales, acentos contrastantes, modo oscuro y movimiento reducido; utilidad `.sr-only` global y foco visible en desplegables. `Dialog` restaura el foco al abrir/cerrar sin interferir con navegación ni otros modales. No se añadieron SDKs, imágenes pesadas, fuentes remotas ni dependencias.

## Archivos de referencia

- `src/mobility/MobilityPlanner.tsx`, `JourneyOptions.tsx`, `MapSheet.tsx`, `mapPlanner.css`, `mapSheet.css`.
- `src/mobility/EndpointPicker.tsx`, `LocationMap.tsx`, `MobilityMap.tsx`, `regionalViewport.ts`.
- `src/components/NetworkExplorer.tsx`, `NetworkMap.tsx`, `TransitCatalog.tsx`.
- `src/components/MetroStationBrowser.tsx`, `MetroStationDetail.tsx`, `metroServiceHours.ts`.
- `src/components/HomeDashboard.tsx`, `StationStreetView.tsx`, `ServiceIdentity.tsx`, `Primitives.tsx`.
- `src/useMapWorkspaceHeight.ts`, `src/mapLayout.css`, `src/theme.css`, `src/App.tsx`.

CSS de componentes antiguos sin uso en el arranque se movió de estilos globales a `route-planning.css`, ahora importado por el componente opcional `StationPicker`. Mantiene su apariencia si se usa y evita exceder el presupuesto inicial. **No volver a importar ese CSS globalmente sin medir tamaño.** No se aumentaron los límites de rendimiento.

## Validación y artefactos

- Suite completa definitiva: **295/295**, 41 archivos, sin fallos ni archivos sin resultados. Incluye cinco regresiones nuevas de foco y una de snapshot antiguo; consultar el informe de validación y `regresiones.json`.
- Recursos iniciales: **606087 bytes** (<600 KiB); CSS inicial comprimido **16239 bytes** (<16 KiB). Margen de CSS reducido: medir al añadir estilos globales.
- Build web/TypeScript y APK debug con API HTTPS pública realizados. `output/android/build-info.json` es la fuente de verdad del commit, fecha, tamaño, hash y huella de assets. No copiar hashes antiguos de esta memoria.
- APK local: `output/android/regiomovil-debug.apk`; Android sincronizado con el mismo `dist`. No es una publicación release.
- QA navegador: Planear, búsqueda, prioridades, filtros, detalle, iniciar/avanzar/terminar guía sin GPS, guardar y reabrir desde Inicio; Red/Metro/fichas; 390×844, 320×740 oscuro+texto grande, 667×375 y 1440×900. Teclado representado reduciendo viewport: **no teclado físico Android**.
- En 320×740, después de corregir: ancho documento320, panel sin scroll horizontal, borde inferior del workspace igual al superior de navegación (670 px).
- **Instalación posterior confirmada en el Xiaomi:** APK de `14afba3`, sin borrar datos, abierto correctamente. No equivale a validación completa de teclado, GPS, lectores de pantalla ni guía en movimiento.

## Pendientes reales

1. Para la próxima compilación, comprobar conexión con `adb devices -l`, actualizar con `adb install -r` y abrir. La instalación de `14afba3` ya se completó. No desinstalar ni borrar datos para resolver una firma distinta.
2. Validar teclado virtual real, TalkBack, tamaño de fuente del sistema, rotación, áreas seguras y contraste alto. La inspección DOM/contraste de tokens no certifica toda la accesibilidad.
3. Validar GPS en movimiento, precisión baja/pérdida de señal, negar/revocar permiso, pausa/reanudación de Activity, voz y ahorro de batería. No prometer seguimiento en segundo plano.
4. Antes de publicación: revisión del diff/commit y autorización explícita para esta versión; ejecutar flujo release del proyecto, conservar firma privada y verificar web/API/APK publicados. No sustituir un APK release por debug.
5. Riesgos anteriores siguen documentados en `docs/seguridad-calidad.md`: reportes públicos sin moderación, persistencia efímera del piloto, cuotas del proveedor y límites por IP detrás del proxy. Esta tanda no es una auditoría nueva de infraestructura ni de vulnerabilidades de dependencias.

Las sugerencias dependen de cobertura y proveedor: no afirmar que resuelven cualquier expresión ni equivalencia completa con Google Maps. Conservar alternativas manuales por pin/estación y errores claros.

## Entorno y comandos

Repositorio: `/home/magio/giovanni/proyectos/RegioMovil`. Node del sistema12 no sirve; utilizar Node24:

```bash
export PATH=/home/magio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
node node_modules/typescript/bin/tsc -b
node --import tsx --test --test-isolation=none --test-reporter=tap tests/map-sheet.test.tsx
```

Ejecutar un archivo JSDOM por proceso con `--test-isolation=none`; los fixtures alteran globals. El runner guardado en `output/qa/mapas-paneles-20261025/ejecutar-regresiones.mjs` ejecuta todos los archivos con tres procesos separados, registra TAP y detecta archivos sin resultados. Algunas pruebas HTTP requieren autorización del sandbox para abrir servidores locales. Evitar wrappers pnpm que intenten reinstalar otra versión automáticamente.

Servidor de desarrollo dejado activo: `http://localhost:5173/`, API3001; al cierre la dirección LAN era `http://192.168.1.3:5173/`. Revisar que siga vivo antes de iniciar otro:

```bash
VITE_API_BASE_URL='' DATABASE_PATH=:memory: node scripts/dev.mjs
```

La IP LAN puede cambiar; HTTP de LAN no garantiza permisos GPS del navegador. Preferir APK o HTTPS para probar ubicación.

```bash
VITE_API_BASE_URL=https://regiomovil-api.onrender.com node scripts/android-build.mjs --offline
/home/magio/Android/Sdk/platform-tools/adb devices -l
/home/magio/Android/Sdk/platform-tools/adb install -r output/android/regiomovil-debug.apk
/home/magio/Android/Sdk/platform-tools/adb shell am start -W -n mx.regiomovil.app/.MainActivity
```

`--offline` se refiere a resolución Gradle, no a funcionamiento de la app sin internet. `--skip-web` sólo si `dist` corresponde exactamente al código actual. SDK36/JDK21, appId `mx.regiomovil.app`, versión1.1.0/code2. No imprimir secretos/archivos de firma.

## Reglas para seguir

Mantener `fixes`; leer estado y diff antes de editar; no descartar trabajo. Skills de revisión React y verificación ya aplicadas. Delegar por archivos para evitar pisar CSS/App compartidos. Los agentes anteriores no son necesarios para recuperar la implementación: todo está en archivos. Si el usuario señala nuevos problemas, partir de esta entrega comprobada, sin rehacer el planeador.
