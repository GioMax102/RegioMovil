# Evaluación web, navegación y eficiencia · 1 de noviembre de 2026

Rama: `codex/evaluadores-optimizacion`, basada en `90b6e5e` de `codex/admin-mapa-reportes`. Este lote prepara revisión; no hace merge a `main` ni acredita una publicación remota o una instalación Android nueva.

## Plan y resultado

| Paso | Entrega | Criterio de aceptación |
| --- | --- | --- |
| 1. Revisar entradas y costes | Auditoría de App, mapas, búsqueda, caché y publicación. | Optimizar operaciones concretas, conservar geometría y controles privados. |
| 2. Abrir el producto a evaluación | Portal `public/acceso.html`, estilos propios y seis accesos a secciones reales. | Adaptable, accesible por teclado, sin iframe, JavaScript ni recursos remotos propios. |
| 3. Completar navegación web | `src/navigation.ts`, enlaces principales reales y URLs por sección. | Entrada directa, recarga, Atrás/Adelante, pestaña Metro, clic modificado y modo parada coherentes. |
| 4. Optimizar | Índice de búsqueda reutilizable; gestos administrativos agrupados por frame; preferencias con inicialización diferida; poda de CSS reemplazado y una acción inalcanzable del kiosco. | Resultados idénticos; conservar último movimiento, cancelar trabajo al salir y mantener descarga inicial bajo 600 KiB. |
| 5. Verificar y entregar | Pruebas de regresión, benchmark, capturas, documentación y PR de revisión. | CI aprobada antes de integrar. Mantener pendientes físicos y remotos identificados. |

La portada explica el propósito social, la cobertura incompleta, la simulación y la revisión de reportes. La descarga Android enlaza a la publicación existente y advierte que puede ser anterior a esta candidata. Administración continúa requiriendo servidor habilitado, cuenta y MFA; una web estática por sí sola no ofrece su API privada.

## Contrato de navegación

| Entrada relativa al directorio publicado | Destino |
| --- | --- |
| `./acceso.html` | Portal de evaluación |
| `./?page=home` | Inicio |
| `./?page=plan` | Planificador |
| `./?page=stations&network=routes` | Rutas y redes |
| `./?page=stations&network=stations` | Metro |
| `./?page=mobility` | Guardados del dispositivo |
| `./?page=home&report=1` | Reporte sin lugar asignado; conserva recuperación de borradores |
| `./admin` | Administración privada del mismo servidor |

Las secciones usan una lista permitida. Las URLs no incorporan coordenadas, texto/fotos del reporte, cuentas ni extremos del trayecto. Se conserva la ruta de alojamiento y la configuración existente de modo parada. Esto no implica compatibilidad nueva de todos los recursos de la app con despliegues en subdirectorios: los datos y el service worker existentes siguen utilizando rutas desde la raíz.

La navegación SPA conserva el comportamiento nativo de enlaces: copiar dirección y abrir en otra pestaña. Cambiar sección desde un mapa ampliado reemplaza su entrada temporal, evitando un Atrás adicional hacia un mapa desmontado. Modo parada y sección se restauran juntos desde el historial; el modo dedicado permanece bloqueado en su vista pública.

Cerrar el reporte elimina `report=1` de la URL después del guardado, sin descartar el borrador. El portal y su CSS quedan fuera del precache; visitarlos no reemplaza la aplicación disponible sin conexión. No se cambia la política que excluye administración, API y reportes privados de la caché pública.

## Evidencia y límites

- Compilación de producción con TypeScript aprobada. Precache: **613 365 bytes**, inferior al límite de **614 400**; margen **1 035 bytes**. Se mantienen los límites por JS/CSS comprimido y los controles de accesibilidad/fuentes disponibles en la primera apertura sin conexión.
- Suite completa Node/React: **469/469** aprobadas, **40.98 s**, concurrencia de cuatro archivos. Importador Python: **4/4** aprobadas. La prueba de medición del gesto espera a que termine la carga inicial para no atribuir su último render al movimiento.
- Comprobación final del empaquetador: **7/7** aprobadas tras hacer obligatorio `acceso.css`; comprueba rechazo si falta y bytes exactos de HTML/CSS dentro del ZIP. Usa fixtures temporales y no publica ni sustituye artefactos reales. Este último caso añade una prueba a las 469 de la pasada anterior.
- Benchmark local con Node **24.22.1**, catálogo real de **214 rutas**, cinco consultas, **5 000 consultas por versión**, mediana de cinco lotes: **0.31583 → 0.01172 ms/consulta**, aproximadamente **27 veces menos CPU de búsqueda**. Construir el índice tomó **1.14 ms**. Resultados idénticos; no mide FPS, batería o memoria en Android.
- La prueba de gestos cuenta commits de React y lecturas de layout después de terminar la carga inicial: diez movimientos antes de un frame generan **un commit y una lectura de dimensiones**. También verifica posición final, puntero ajeno, encuadre y desmontaje. Un commit no equivale a una medición del pintado físico de pantalla.
- Poda de CSS: **66 declaraciones** sustituidas por reglas posteriores del mismo selector/propiedad y cinco reglas de una acción sin consumidores. Reducción de **2 203 bytes minificados** en esas dos hojas, sin retirar fuentes, soporte offline ni aumentar presupuestos.
- Integración DOM: enlaces directos, recarga, historial, modo parada, mapa ampliado → planificador → Atrás, formulario sin estación inventada, cierre y recuperación del borrador. El portal tiene pruebas de recursos, enlaces, semántica y tamaño; el service worker verifica que no sustituya el shell offline.
- Revisión en navegador real: portal de escritorio y viewport móvil **390 × 844**, entrada directa a Metro, Planear, Atrás, recarga y navegación móvil a Viajes y de regreso. Sin desbordamiento horizontal observado en la portada. Es una emulación de tamaño, no una prueba física Android.
- Inventario reproducido: **214 servicios**, **194** con mapa de ficha/red; **20** sin mapa importado, incluyendo 18 variantes de autobús y las dos líneas excluidas según las fuentes fechadas. Este lote no inventa ni añade trazos.

Capturas: [vista inicial](evidencia/2026-11-01/portal-evaluadores-vista.jpg), [portal de escritorio](evidencia/2026-11-01/portal-evaluadores-escritorio.jpg), [portal móvil](evidencia/2026-11-01/portal-evaluadores-movil.jpg), [navegación móvil de regreso a Metro](evidencia/2026-11-01/navegacion-metro-movil.jpg). Benchmark reproducible: [script](../scripts/benchmark-route-search.mjs).

## Probar esta candidata

Con Node 24+ y pnpm del proyecto, desde la raíz:

```sh
pnpm install --frozen-lockfile
./regiomovil build
./regiomovil start
```

El servidor carga `.env` si existe. En esta computadora está configurado en `http://localhost:4173`: abrir `/acceso.html`, `/` o `/admin`. En otro equipo, el puerto predeterminado es 3001 si no se configura `PORT`. No iniciar una segunda instancia sobre el mismo puerto. La cuenta administrativa ya aprovisionada conserva contraseña/MFA; no volver a crearla para actualizar la interfaz.

Verificaciones reproducibles:

```sh
pnpm docs:check
node --import tsx --test --test-concurrency=4 tests/*.test.mjs tests/*.test.tsx
node --import tsx scripts/benchmark-route-search.mjs
node scripts/prepare-coverage-inventory.mjs --check
python3 -m unittest discover -s tests -p '*_test.py'
```

Para actualizar Android de pruebas por USB después de revisar la candidata:

```sh
./regiomovil android --dev-local-api
adb reverse tcp:4173 tcp:4173
adb install -r output/android/regiomovil-debug.apk
adb shell am start -n mx.regiomovil.app/.MainActivity
adb shell am start -a android.intent.action.VIEW -d http://localhost:4173/admin
```

`--dev-local-api` es sólo para debug por túnel USB; consultar [Android](android.md) para requisitos. No desinstalar ni borrar datos para actualizar. Este registro no afirma que esos comandos Android se hayan ejecutado en este lote.

## Continuidad y paso a main

1. Revisar el PR de este lote contra `codex/admin-mapa-reportes`, con CI aprobada y evidencia anterior. Registrar comentarios por archivo y resultado esperado.
2. Revisar los PR apilados anteriores y su orden de integración; no fusionar sólo esta rama aislada ni omitir los cambios de administración/ciberseguridad de los que depende. La decisión de merge queda para la siguiente interacción.
3. Hacer pruebas físicas de cámara, retorno del selector, guía y gestos en el APK de la misma revisión; medir memoria, frame time y consumo en el equipo de destino antes de prometer mejoras generales de fluidez.
4. Validar las variantes de ruta pendientes con fuentes verificables. Conservar [auditoría del 31 de octubre](auditoria-pendientes-2026-10-31.md), procedencia, sentidos y reglas de exclusión.
5. Preparar la publicación con frontend, API y APK compatibles según [publicación](publicacion.md). El push/PR no actualiza automáticamente el antecedente de Cloudflare Pages de carga directa. Verificar HTTPS, origen administrativo, persistencia y moderación antes de ampliar exposición.
6. Continuar [P1–P10](PLAN_PRODUCTO_COMUNIDAD_2026-10-31.md), [entrega previa](ENTREGA_PRODUCTO_2026-10-31.md), [hoja de ruta](hoja-de-ruta.md) y [matriz OWASP](matriz-owasp.md). Las encuestas VDP, el detector de visión y una auditoría OWASP externa siguen siendo trabajos con sus propios criterios de aceptación.
