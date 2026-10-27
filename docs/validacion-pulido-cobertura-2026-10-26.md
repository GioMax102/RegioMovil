# Validación de UI, transbordos y cobertura

Fecha de cierre: **26 de octubre de 2026**, America/Monterrey. Rama `fixes`.

La implementación principal está en el commit del usuario `b142460` («Cambios diseño interfaz»). Este cierre preserva ese commit y corrige el origen de una parada guardada offline, incorpora cuatro regresiones y actualiza la continuidad. El usuario autorizó commit y push a `fixes`; esta entrega no incluye merge, despliegue web/API ni APK release.

## Resultado del plan

| Petición | Resultado |
| --- | --- |
| Espacio superior y marca sólo en Inicio | Cabecera móvil de 60 px; inset una vez. En otras pantallas, menú compacto de información/avisos con gestión de foco |
| Pestañas y selector de Metro | Margen de `.network-section-tabs`, select nativo «Línea», chevron y padding independientes |
| Encabezado de estación y próximas unidades | Padding y separación propios en ambos bloques |
| Catálogo que surge desde abajo | Región no modal con apertura/cierre de 220 ms, sin movimiento al reducirlo; contenido cerrado inaccesible al foco; filtros y scroll preservados |
| Ficha de unidad y llegada verde | Componente diferido, superficie neutral, minutos verdes, simulación visible e información extensa plegada |
| Mayúsculas | «Tu movilidad», «Hecho para Nuevo León», «Paso…» y «Trayecto completado» en estilo oración |
| Acciones en transbordos | Foto documentada, Maps y guardar compartidos con Metro; IDs exactos, bajada/abordaje distintos; sin avance ni GPS por guardar |
| Guardados horizontales | Origen → destino en una fila, truncado visual y nombre completo accesible |
| Textura de CTA | Textura estática CSS, legible en claro/oscuro; sin decoración en contraste alto |
| Acceso a rutas faltantes | Búsqueda sobre 214 servicios; ficha útil sin trazo; cinco mapas oficiales de consulta añadidos e inventario por ID |

## Cobertura verificada

- **214 servicios catalogados y buscables; 59 mapas de ficha; 54 recorridos/3417 puntos en mapa general y grafo experimental.**
- Mapas nuevos: ramales exactos 13 Soriana Sendero Lincoln, 39 Directa San Bernabé Centro, 109 Aeropuerto–Y Griega, 124 Quinta Colonial–Ruiz Cortines por Anillo y 310 Portal de Lincoln–Estación San Bernabé.
- Cinco segmentos, 3024 vértices y 723 marcadores publicados. Los cinco paquetes suman 342564 bytes y se cargan al abrir su ficha, no al iniciar.
- Todos conservan `experimentalRouting:false`; no se añadieron al cálculo de viajes. Importar geometría no verifica sentido, orden de abordaje ni operación actual.
- **155 mapas pendientes:** 114 autobuses con enlace My Maps aún sin inspección individual en este lote, 39 con metadatos sin enlace individual de geometría y dos líneas ferroviarias sin mapa importado. No se afirma cobertura completa de las rutas actuales de la ZMM.

El inventario está en `data/route-coverage-inventory.json` y `docs/inventario-rutas-2026-10-25.csv`; auditoría de cinco fuentes en `data/coverage-source-audit-20261025.json`. La consulta de fuentes de este lote ocurrió el 25 de octubre, no el día de cierre de software. Condiciones/licencias y limitaciones en [catalogo-autobuses.md](catalogo-autobuses.md).

## Pruebas y compilación

**313/313 pruebas en 43 archivos, cero fallos, cero archivos sin resultados.** El runner ejecuta cada archivo en un proceso independiente con Node24, `--import tsx --test --test-isolation=none --test-reporter=tap`, hasta tres procesos simultáneos. Esto evita globals compartidos de JSDOM y valida conteos/salida reales.

Evidencia local en `output/qa/pulido-cobertura-20261025/`:

- `regresiones.json`, `suite-completa.log` y `pruebas/*.tap`.
- `compilacion-android.log`: TypeScript, preparación de catálogo/grafo, build Vite, finalización web, sync Capacitor y Gradle `BUILD SUCCESSFUL`.
- Inventario reproducible: `node scripts/prepare-coverage-inventory.mjs --check` → «214 servicios · 59 mapas de ficha · 54 mapas de red · 155 sin mapa importado».

Las regresiones nuevas del cierre verifican dos comportamientos offline de favoritos (parada actual preservada y retirada con aviso/origen vacío) y dos garantías de cobertura: identidad/procedencia/geometría de los cinco paquetes y exclusión mediante ejecución real de `prepare-mobility.mjs` en `/tmp` con un control positivo. No reescriben datos del repositorio durante la prueba.

La revisión detectó que abrir una parada guardada como coordenadas provocaba que se borrara al estar offline. La corrección preserva `stopId`, lo resuelve contra la red local y mantiene el destino vacío. Si el ID fue retirado muestra «Esta parada guardada ya no está en la red disponible. Elige otro origen»; no lo transforma en otra estación ni consulta lugares.

Presupuestos conservados: **613135 bytes iniciales** frente a 614400; CSS inicial gzip **16375** frente a 16384. Todas las pruebas de assets pasan. El margen CSS es sólo 9 bytes; preferir estilos opcionales diferidos y retirar reglas antiguas. Sin dependencias ni permisos nuevos.

## Recorrido de navegador y flujo de datos

Historia verificada: Inicio/Red/guardados → APIs y snapshots locales → render de llegadas, catálogo y paquetes diferidos → ficha/guía → favorito local y retorno al origen de navegación.

| Frontera | Evidencia |
| --- | --- |
| App y API locales | Servidor Vite5173/API3001; Inicio muestra «En línea» y llegadas simuladas |
| Catálogo → sugerencias | Buscar 39 distingue sus cinco ramales; la directa San Bernabé–Centro abre su propia ficha, las otras muestran «Trazo pendiente» |
| Paquete → mapa | Ficha de 39 renderiza trazo y 195 puntos de referencia; mapa base local servido HTTP200 `image/svg+xml` |
| Ruta sin paquete → ficha | Pilares Andalucía UTE muestra «Trazo pendiente» y fuente oficial, sin mapa vacío |
| Catálogo → foco | Abre con foco al buscador; Escape vuelve a «Rutas y sistemas», contenido cerrado `aria-hidden=true` |
| Favorito → estado | Guardar Cuauhtémoc durante pausa conserva «En pausa» y Paso1; avance manual pasa a Paso2; terminar vuelve al inicio del trayecto |
| Guardados → lectura | Origen y destino comparten coordenada vertical; flecha intermedia; sin desbordamiento horizontal de página |

QA visual: 390×844 claro y oscuro con texto grande; Metro en1440×900; 320×740 oscuro/texto grande y panel con movimiento reducido en la sesión previa de esta misma entrega. En320, ancho de documento320 y borde inferior de workspace igual al inicio de navegación (670 px). El teclado simulado reduciendo viewport no valida el teclado físico Android.

Durante QA terminó una sesión del servidor local y quedaron recursos de mapa sin cargar. Se reinició en PTY, se verificó respuesta HTTP200 del SVG, se volvió a abrir la ficha y se capturó con calles renderizadas. No se cambió la geometría para compensar la interrupción. Desde la reconexión final no se registraron errores nuevos en consola; el error HMR previo corresponde al servidor detenido.

Capturas: `inicio-textura.jpg`, `metro-espaciado.jpg`, `metro-escritorio.jpg`, `unidad-oscuro-texto-grande.jpg`, `catalogo-abierto.jpg`, `ruta-39-nueva.jpg`, `ficha-trazo-pendiente.jpg`, `acciones-transbordo.jpg`, `guia-transbordo.jpg`, `guardados-horizontal.jpg`. Favoritos de prueba retirados; guía terminada; preferencias de QA restauradas a claro/texto normal/animaciones.

## APK y pendientes físicos

APK debug: `output/android/regiomovil-debug.apk`, appId `mx.regiomovil.app`, versión1.1.0/code2, API `https://regiomovil-api.onrender.com`. `build-info.json` y `regiomovil-debug.json` registran commit, fecha, SHA-256 y manifiesto de recursos; la compilación verifica igualdad exacta entre `dist` y assets Android. Después del commit documental de cierre se actualiza esa procedencia con el mismo bundle congelado mediante `--skip-web --offline`.

Tras cerrar build y suite, se conectó por USB el Xiaomi M2103K19G. `adb install -r` respondió `Success`; `am start -W` devolvió `Status: ok`; Android registró `mx.regiomovil.app/.MainActivity` como `RESUMED`. Se conservó la parada guardada «San Bernabé» y la captura muestra la textura del CTA en el dispositivo: `output/qa/pulido-cobertura-20261025/instalado-xiaomi-2026-10-26.png`. Esta es validación física de instalación, apertura e Inicio. Siguen pendientes teclado físico, rotación, TalkBack, contraste alto y GPS en movimiento/precisión/permisos/Activity/ahorro de batería. No se aceptaron permisos nuevos.

La revisión de componentes no encontró otros problemas concretos de privacidad/foco/listeners: favoritos guardan metadatos públicos bajo acción explícita, enlaces Maps sin referer, fotos con fuente histórica y kiosco sin persistencia. No equivale a auditoría completa de infraestructura o dependencias. Riesgos anteriores siguen en [seguridad-calidad.md](seguridad-calidad.md).

Continuidad operativa en [MEMORIA_CONTINUIDAD_UI_MAPAS.md](MEMORIA_CONTINUIDAD_UI_MAPAS.md). Siguiente trabajo independiente: pruebas físicas y ampliación de cobertura por lotes, conservando identificación de ramales y procedencia.
