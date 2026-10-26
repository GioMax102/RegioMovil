# Continuidad de RegioMóvil — UI, mapas y cobertura

Actualizado: **26 de octubre de 2026**, America/Monterrey.

## Leer primero

El usuario autorizó implementar el [plan de UI y cobertura](PLAN_CONTINUIDAD_UI_Y_COBERTURA_2026-10-25.md), además de **commit y push en `fixes` al cerrar cada interacción**. Las 12 anotaciones y los ajustes adicionales ya están implementados. No reiniciar el plan, descartar trabajo ni pedir otra autorización para commit/push normales a esa rama. Merge a `main`, despliegue web/API y publicación release requieren una petición para esa versión.

El usuario guardó la implementación principal en **`b142460` («Cambios diseño interfaz»)**, posterior a `14afba3`. El cierre conserva ese commit y añade la corrección offline de paradas guardadas, cuatro regresiones y documentación. Consultar `git status`, `git log -5` y `output/android/build-info.json` para identificar el cierre; no copiar hashes antiguos del APK.

Informe vigente: [validacion-pulido-cobertura-2026-10-26.md](validacion-pulido-cobertura-2026-10-26.md). Evidencia: `output/qa/pulido-cobertura-20261025/` (conserva la fecha inicial). Las 295 pruebas y cifras del informe anterior de mapas/paneles son históricas.

## Implementación consolidada

- **Espacio superior:** marca en cabecera sólo en Inicio; altura móvil 60 px, zona segura aplicada una vez por `app-shell`. Otras pantallas usan el control compacto «Información y avisos», con cierre y retorno de foco. Barra lateral de escritorio conservada. Sin cambios nativos ni nuevos permisos.
- **Metro:** margen con el selector real `.network-section-tabs`; select nativo «Línea», chevron independiente/padding; título, acciones y «Próximas unidades» con espacio propio.
- **Identidad:** textura estática ligera en CTA, desactivada en contraste alto/forced colors; estimación verde; `ArrivalDetails` diferido, simulación visible e Info cerrado. Textos de navegación/guía en estilo oración.
- **Guardados:** origen → destino horizontal y nombres completos accesibles. Parada de autobús abre por ID oficial, funciona offline y conserva destino vacío. ID retirado pide elegir otro origen; no sustituye silenciosamente por coordenadas.
- **Transbordos:** `StationActions` compartido con Metro en detalle y guía; resolución por ID y bajada/abordaje distintos. Foto sólo documentada (actualmente Talleres); Maps sólo con coordenadas públicas y apertura explícita. Guardar conserva progreso/pausa/GPS. Favoritos sincronizados entre vistas/pestañas; kiosco desactiva persistencia.
- **Catálogo:** busca los 214 servicios independientemente de los 54 del mapa general. Sugerencias limitadas y paginación; ramales con identidad exacta. Sin geometría abre «Trazo pendiente» y fuente, sin mapa vacío ni planificación ficticia.
- **Panel de rutas:** región no modal, transición de 220 ms desde la franja inferior, inmediata al reducir movimiento. Foco al buscador y retorno al botón al cerrar/Escape. Cerrado `inert`/`aria-hidden`; filtros/búsqueda/scroll preservados; un solo mapa.

Se mantiene la arquitectura anterior: mapa y `MapSheet` en Planear, búsqueda cancelable IME/debounce y alternativas manuales, prioridades/filtros, snapshots v1 compatibles, guía sólo en primer plano y controles manuales. Horario publicado filtra simulaciones cerradas; no confirma operación en vivo. No rehacer el planeador.

## Cobertura exacta

| Concepto | Cantidad |
| --- | ---: |
| Servicios documentados buscables | 214 |
| Fichas con mapa | 59 |
| Recorridos de mapa general/grafo experimental | 54 |
| Puntos del grafo | 3417 |
| Nuevos mapas sólo de consulta | 5 |
| Servicios sin mapa importado | 155 |

Nuevos ramales: 13 Soriana Sendero Lincoln, 39 Directa San Bernabé Centro, 109 Aeropuerto–Y Griega, 124 Quinta Colonial–Ruiz Cortines por Anillo y 310 Portal de Lincoln–Estación San Bernabé. Cinco segmentos, 3024 vértices, 723 marcadores y 342564 bytes sin compresión, diferidos por ficha. **`experimentalRouting:false`**: el generador excluye sus marcadores con motivo `visualization-only`. La regresión ejecuta el generador real en `/tmp` con un control permitido.

Pendientes: **114 autobuses con enlace My Maps aún sin descarga/revisión individual en este lote; 39 con metadatos sin enlace individual; dos líneas ferroviarias sin mapa importado**. No afirmar que no existen otras fuentes, cobertura completa de ZMM o vigencia actual de L4/L6 a partir de estados históricos.

Fuentes revisadas el **25 de octubre**; cierre de software el 26. Mantener esas fechas. Dataset SETME declara ODC; no se identificó licencia individual en KML. Conservar atribución, URLs, hashes y límites. Marcadores publicados no equivalen a infraestructura ni sentido verificados.

Fuentes de verdad: `data/route-coverage-inventory.json`, `docs/inventario-rutas-2026-10-25.csv`, `data/coverage-source-audit-20261025.json`, `docs/catalogo-autobuses.md`. Pipelines: `scripts/import-ima-view-maps.py`, `scripts/prepare-coverage-inventory.mjs`, `scripts/prepare-mobility.mjs`.

## Verificación y artefactos

- **313/313 pruebas, 43 archivos**, sin fallos ni archivos sin resultados. Runner, `regresiones.json` y TAP por archivo en la carpeta QA indicada. Incluye paradas presentes/retiradas offline y exclusión de los cinco mapas al planear.
- TypeScript, build web y APK debug con API HTTPS correctos. Iniciales **613135 bytes** (<614400), CSS inicial gzip **16375 bytes** (<16384). Sólo **9 bytes** de margen CSS: quitar reglas sin uso/mover estilos opcionales a componentes diferidos. No aumentar presupuestos para ocultar regresiones.
- APK: `output/android/regiomovil-debug.apk`; commit, fecha, SHA-256 y huella del bundle en `build-info.json` y `regiomovil-debug.json`. Android comprueba copia exacta de `dist`. `--skip-web` sólo si producto/dist están congelados e idénticos.
- Navegador: Inicio/textura, Metro/espaciado, unidad oscuro+texto grande, catálogo/foco/Escape, mapa nuevo/ficha sin trazo, guardados horizontales, transbordos y pausa/guardar/avance manual/terminar guía. Responsive 320/390/1440 px. Viewport reducido no equivale a teclado Android real. Favoritos creados en QA retirados y guía terminada; preferencias de prueba restauradas a claro/texto normal/animaciones.
- Revisión React: carga diferida, limpieza de efectos/listeners, IDs estables, persistencia mínima y foco. Revisión concreta de privacidad: sólo metadatos públicos al guardar; sin nuevos SDKs/dependencias/permisos. No es auditoría completa de infraestructura/dependencias.
- **Instalación física actualizada el 26 de octubre:** Xiaomi M2103K19G conectado por USB; `adb install -r` devolvió `Success`, `am start -W` devolvió `Status: ok` y `dumpsys` confirmó `mx.regiomovil.app/.MainActivity` en `RESUMED`. Versión instalada: 1.1.0/code2, APK del commit `d1a7891`. La captura muestra Inicio, textura y parada guardada «San Bernabé»: `output/qa/pulido-cobertura-20261025/instalado-xiaomi-2026-10-26.png`. Se conservaron datos al actualizar. Aún pendientes teclado físico, rotación, TalkBack y pruebas de GPS en movimiento.

## Pendientes al retomar

1. Comprobar rama/remoto; preservar commits del usuario. Commit/push normal a `fixes` autorizado, sin force push.
2. El APK actual ya está instalado/abierto en el Xiaomi; continuar con medición de zona segura en uso, teclado físico, rotación, fuente del sistema, TalkBack y contraste alto.
3. Validar GPS en movimiento/baja precisión/pérdida de señal, negar/revocar permisos, pausa/reanudación de Activity, voz y ahorro de batería. No aceptar permisos por inferencia ni prometer segundo plano.
4. Importaciones por lotes desde inventario, sin activar planificación por booleano ni fusionar ramales por número; mantener fichas aun sin mapa.
5. Publicación futura: autorización concreta, flujo release, firma privada y verificación de web/API/APK. Riesgos previos de reportes/persistencia/cuotas siguen en `docs/seguridad-calidad.md`.

## Entorno reproducible

Repo `/home/magio/giovanni/proyectos/RegioMovil`. Node del sistema12 no sirve; usar Node24:

```bash
export PATH=/home/magio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
node output/qa/pulido-cobertura-20261025/ejecutar-regresiones.mjs
node scripts/prepare-coverage-inventory.mjs --check
VITE_API_BASE_URL=https://regiomovil-api.onrender.com node scripts/android-build.mjs --offline
```

Runner: un archivo JSDOM por proceso con `--test-isolation=none`, tres procesos y TAP con conteos/salida reales. HTTP local puede necesitar escalación de sandbox. Teardown frontend espera trabajo pendiente de React antes de restaurar globals. No usar «una prueba por archivo» del runner Node predeterminado como conteo definitivo.

Desarrollo: `VITE_API_BASE_URL='' DATABASE_PATH=:memory: node scripts/dev.mjs`; web5173/API3001. Comprobar listeners antes de duplicar servidor; las sesiones pueden terminar entre interacciones. IP LAN variable; HTTP LAN no garantiza GPS, preferir APK/HTTPS.

```bash
/home/magio/Android/Sdk/platform-tools/adb devices -l
/home/magio/Android/Sdk/platform-tools/adb install -r output/android/regiomovil-debug.apk
/home/magio/Android/Sdk/platform-tools/adb shell am start -W -n mx.regiomovil.app/.MainActivity
```

`--offline` es resolución Gradle. SDK36/JDK21, appId `mx.regiomovil.app`, versión1.1.0/code2. No imprimir secretos/firma. Skills React y verificación aplicadas. Delegar por archivos; la implementación está en el repo y no requiere recuperar agentes anteriores.
