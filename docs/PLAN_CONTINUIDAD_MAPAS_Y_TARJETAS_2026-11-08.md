# Plan de continuidad: mapas y tarjetas consistentes

**Fecha:** 8 de noviembre de 2026  
**Rama base verificada:** `codex/ux-reportes-visibles`  
**Commit base:** `4a8f2ec` — `Mejora reportes comunitarios y selector de estaciones`  
**Alcance de este documento:** plan y criterios de aceptación. La implementación comienza en una interacción posterior.

## Objetivo

Hacer que el mapa y la información de transporte se comporten y se vean de forma coherente en Inicio, Red, detalle Metro, detalle de rutas, Planear y guía de trayecto. Cada pantalla conserva su propósito: Inicio orienta y permite planear; Red explora sistemas y estaciones; Planear compara alternativas; la guía ayuda a completar un viaje. La estandarización debe compartir diseño, datos y controles comunes, no forzar una única pantalla ni un mapa idéntico en todos los contextos.

## Especificación de identidad visual

- **Marca:** verde profundo para acciones principales y navegación activa; azul petróleo para texto/títulos; fondos gris verdoso muy claros; superficies blancas; bordes suaves y sombras discretas.
- **Jerarquía:** un título de sección, un dato prioritario y una acción primaria por tarjeta. Evitar párrafos grises repetidos, metadatos duplicados y avisos persistentes que compitan con la tarea.
- **Tipografía:** tamaño de lectura mínimo de 14 px en escritorio y 15 px en móvil para contenido; títulos 18–22 px; contraste WCAG AA. Fechas y fuente como metadato secundario, nunca como única indicación de estado.
- **Tarjetas de servicio:** usar el mismo `LineBadge`/identidad de servicio, nombre/destino, intervalo de llegada, afluencia y accesibilidad; orden de lectura estable en cada pantalla. Reusar `HomeDashboard`/`ArrivalCard` según el contexto, sin duplicar el marcado de datos.
- **Acciones:** una acción primaria verde con textura topográfica sutil sólo en acciones clave; botones secundarios con superficie clara y borde verde; controles de icono con área táctil mínima 44×44 px, etiqueta accesible y estado de foco visible.
- **Reportes:** feed como conversaciones/burbujas, alternando ligeramente el tono de superficie, con categoría, título, estado, fecha y texto legibles. Filtros visibles `Todas`, `Abiertas`, `Resueltas`, con conteo y estado seleccionado. Preservar revisión, consentimiento y procedencia: datos sintéticos no se presentarán como hechos reales.
- **Movimiento:** animaciones breves y funcionales (150–220 ms); respetar `prefers-reduced-motion`. No animar el mapa en cada render.

## Contrato común de mapa

Unificar apariencia, capas, atribución y controles entre `LocationMap` y `NetworkMap`, preservando las diferentes capacidades de navegación, selección y planificación.

1. **Fondo cartográfico:** una paleta de bajo contraste, calles visibles sin dominar, parques/zonas verdes diferenciables y etiquetas de lugares sólo cuando aporten orientación. Mantener atribución OpenStreetMap/ODbL visible y legible en cualquier tamaño.
2. **Red de transporte:** trazos con color por línea/sistema, halo claro para separación del fondo y ancho escalado según zoom. En filtros o rutas seleccionadas, priorizar el servicio activo y atenuar el resto sin ocultar contexto necesario.
3. **Puntos:** en vista regional mostrar estaciones importantes/seleccionadas; mostrar todas las paradas sólo al acercar. Evitar rótulos y marcadores que saturen móviles de baja gama.
4. **Ubicación:** mostrar posición del usuario y círculo de búsqueda de 3 km en Inicio; en detalles de Metro, mantener el mismo contexto y centrar el encuadre en la estación seleccionada, sin acercar al usuario. En Planear, el encuadre prioriza origen, destino o tramo activo.
5. **Tarjeta flotante:** un único overlay contextual, anclado dentro del área segura y sin tapar filtros, estación elegida, atribución ni controles. Ofrecer acciones disponibles: detalle (ojo), ubicación externa (Google Maps sólo con coordenadas válidas), guardar y reportar. No renderizar una acción inactiva como si funcionara.
6. **Controles:** zoom y geolocalización en un grupo común, ubicados fuera de controles de búsqueda/filtros. En mapas no interactivos se ocultan controles; en móvil conservar gestos táctiles y botones como alternativa.
7. **Información/ayuda del mapa:** retirar botones de información redundantes y sus popovers en Inicio y Planear. Retirar también el panel informativo de cobertura de `LocationMap`. Mantener atribución y una referencia compacta de fuentes en el cierre de pantalla/detalles de datos, no dentro de un botón que obstruye el mapa.
8. **Rendimiento:** conservar carga diferida, geometría simplificada al alejar, `requestAnimationFrame` para gestos, límites de marcadores y cancelación de trabajo al desmontar. Evitar incorporar un SDK cartográfico pesado sin medición de recursos. Si se añade más detalle de calles/POI, hacerlo por niveles de zoom y con límite de memoria.

## Fases de implementación

### Fase 0 — inventario y contrato de UI

- Revisar `HomeDashboard`, `HomeTransportHub`, `HomeTransportMap`, `HomeSelectedRouteMap`, `HomeCommunityFeed`, `MetroStationDetail`, `NetworkMap`, `NetworkExplorer`, `PublicReports`, `LocationMap`, `MobilityPlanner`, `MobilityJourneyDetail` y `ActiveJourney`.
- Definir/reusar primitivas para tarjeta de llegada, tarjeta de estación/parada, tarjeta contextual de mapa, filtros de reportes y tira lineal de paradas. Registrar los contratos de props para evitar componentes paralelos.
- Tomar capturas base en Inicio, Red/Metro, Red/Rutas, Planear y guía en 390×844 y 1440×900; anotar presupuesto inicial de recursos y CSS.

### Fase 1 — Inicio y tarjetas compartidas

- Quitar el rótulo «Llegadas y afluencia simuladas» visible dentro de la tarjeta, pero conservar una explicación discreta en `Datos y fuentes` para no inducir que son datos en tiempo real.
- Quitar `Continuar reporte` y `Guardados` de la fila de acciones de transporte de Inicio. Dar prioridad a «Planear desde aquí» como CTA ancho, con textura topográfica existente y navegación idéntica a Planear.
- Reordenar Inicio: llegadas/afluencia como tarjeta prioritaria, acciones compactas, mapa y secuencia de estaciones, reportes comunitarios filtrables, y `Datos y fuentes` al final.
- Retirar «Compara antes de salir» de la tarjeta de afluencia. Reusar la visualización de afluencia en otras pantallas que tengan el mismo dato.
- Añadir filtros al feed de Inicio y reutilizar la llamada de reporte «Ayuda a mejorar este lugar» de Red. Conservar CTA de reportar y filtros; eliminar la tarjeta/botón genérico duplicado «Crear reporte general» cuando exista contexto de ubicación.
- La tarjeta de próxima llegada definida en Inicio pasa a ser la vista canónica para llegadas Metro y de otros servicios, adaptada sólo cuando los datos disponibles difieran.

### Fase 2 — estación lineal y selección contextual

- Extraer o adaptar la secuencia existente de `MetroStationDetail` como `StopSequence`: estación actual, anteriores y siguientes; scroll horizontal y selección sincronizada con mapa y ficha.
- Mostrar la secuencia sobre el mapa en Inicio por defecto cuando la selección sea Metro. Al pulsar una estación en Red, superponerla al mapa de rutas y conservar las capas visibles de la red.
- Para rutas sin nombres de estaciones, numerar puntos en orden del trazo y mostrar nombre oficial de parada/avenida en la tarjeta al seleccionarlos. No inventar nombres ni orden si la geometría no contiene esa información.
- Usar el mapa estándar, encuadrado en estación/tramo enfocado. La tira de estaciones gobierna selección/encuadre; no sustituir el encuadre por ubicación GPS.
- La tarjeta seleccionada incorpora `Ver detalle` (ojo), `Abrir ubicación` (Maps) con coordenadas válidas, guardar y reportar. Hacer disponibles los controles al usuario sin acciones fantasma.

### Fase 3 — reportes y contenido comunitario

- Unificar feed de Inicio y Red usando `PublicReports`/`HomeCommunityFeed` o primitivas compartidas, con filtro por estado y conteos consistentes.
- Replicar en Inicio la invitación de Red «Ayuda a mejorar este lugar», filtros y feed. En Inicio se omite la tarjeta grande redundante de escenario/información; el consentimiento y la nota de revisión permanecen accesibles en el formulario.
- Convertir la presentación tipo tabla/lista de reportes en tarjetas tipo conversación/burbujas visuales, sin perder orden cronológico, categoría, ubicación, estado y controles de moderación donde corresponda.
- Eliminar texto de baja utilidad/duplicado («datos de visualización», aviso secundario de borrador) conforme a anotaciones sin ocultar al usuario que los datos son simulados cuando aplique ni borrar borradores accidentalmente.

### Fase 4 — normalización del mapa en pantallas

- Adoptar estilos y capas del `LocationMap` en mapas de detalle/preview, rutas de red, mapa Metro y Planear. Mantener la interacción específica de cada pantalla mediante props/slots compartidos.
- Quitar controles `location-map-info` redundantes en Inicio y Planear. En el mapa de Red, quitar el panel de «cobertura/recorridos disponibles» al pulsar `i`; conservar catálogo y búsqueda de rutas en su vista propia.
- Hacer que mapa de Planear y previsualizaciones compartan el mismo fondo cartográfico, color de rutas, selección, marcadores y controles; el origen/destino conserva símbolos A/B y la guía mantiene su tramo activo.
- En Inicio mostrar anillo de búsqueda y posición actual. Al navegar fuera de Metro, adaptar paradas como puntos numerados y tarjeta con nombre de estación o avenida.
- Ajustar selección/mapa para que tarjetas y controles no tapen trazos ni interacción al tamaño móvil, modo apaisado, fuente grande y zonas seguras Android.

### Fase 5 — verificación y continuidad

- Pruebas de sincronía: slider → estación → mapa; estación elegida en Red → tira + tarjeta; ruta no Metro → puntos numerados; botón Maps condicionado a coordenadas; filtros de reportes y retorno desde detalle.
- Regresión de planificación/guía: encuadre A/B, trazo activo, selección de parada, ubicación y GPS no cambian al filtrar reportes o abrir tarjetas.
- Rendimiento móvil: prueba con 320/360/390 px, throttling CPU/red, gestos y memoria observada; validar render con muchos trazos y que la carga diferida no dispare dos mapas simultáneos.
- Accesibilidad: teclado/foco, TalkBack, contraste, áreas táctiles, lector de estados/filtros, reduced motion y zoom/fuente Android.
- Ejecutar tipos, suite enfocada, regresiones completas y build web; medir presupuesto inicial, CSS gzip, transferencia y conteo de geometrías. Instalar APK debug actualizado para inspección física cuando el dispositivo esté conectado.
- Capturar evidencias antes/después y actualizar memoria de continuidad, este plan y cifras de cobertura. Commits/pushes sólo cuando cada bloque esté probado y limpio; no merge a `main` ni despliegue productivo sin solicitud concreta.

## Matriz de anotaciones → cambios

| # | Cambio verificable | Fase |
|---:|---|---|
| 1 | Quitar rótulo de simulación dentro de tarjeta; conservar procedencia en fuentes | 1 |
| 2 | Eliminar botones «Continuar reporte» y «Guardados» de acciones de Inicio | 1 |
| 3 | Hacer «Planear desde aquí» protagonista y restaurar textura | 1 |
| 4 | Retirar botón/popup de información del mapa de Inicio; la secuencia de paradas toma su lugar | 4 |
| 5 | Añadir ver/mapa externo a tarjeta de ubicación seleccionada | 2 |
| 6 | Quitar botón de conteo/cobertura del mapa, preservar atribución | 4 |
| 7 | Usar secuencia Metro en los mapas; numeración para rutas sin nombre de parada | 2 |
| 8 | Reutilizar mapa de Inicio con foco Metro, sin acercar GPS | 2 / 4 |
| 9 | Reusar tarjeta de próximas llegadas de Inicio | 1 |
| 10 | Presentar reporte individual como burbuja, coherente con el feed de Inicio | 3 |
| 11 | Replicar en Inicio CTA, filtros y feed de Red; omitir tarjeta explicativa redundante | 3 |
| 12 | Quitar etiqueta gris de simulación en tarjeta de llegada | 1 |
| 13 | Quitar «Compara antes de salir» y estandarizar pronóstico de afluencia | 1 |
| 14 | Mover «Datos y fuentes» al final de Inicio | 1 |
| 15 | Añadir visualizador interactivo/lineal de estaciones de Red en Inicio | 2 |
| 16 | Añadir filtros de reportes en Inicio, iguales a Red | 3 |
| 17 | Sustituir «Crear reporte general» por CTA contextual de Red | 3 |
| 18 | Aplicar las mejoras de Inicio a buses/RegioRuta/transporte alternativo con datos adecuados | 1–4 |
| 19 | Estandarizar fondos, trazos, controles y tarjetas de mapas de Planear con `LocationMap` | 4 |
| 20 | Retirar botón/panel informativo de `LocationMap` en Planear; mantener atribución/fuentes | 4 |

## Criterios de salida

- Los mapas conservan lectura cartográfica en gama baja: calles y áreas verdes visibles, trazos contrastantes y pocos puntos a zoom regional.
- En cada pantalla hay un solo CTA principal coherente con su tarea; las tarjetas de llegada y reporte no cambian de estructura sin razón de datos/contexto.
- En Inicio Metro se identifica estación actual y sentido; cambiar la estación mueve el encuadre. En rutas sin nombres, el orden numérico y los nombres de paradas/avenidas son claros y no fabricados.
- Seleccionar un punto revela acciones funcionales de detalle, ubicación externa, guardar y reportar; ninguna tarjeta cubre la estación activa o los controles.
- Filtros de reporte funcionan igual en Inicio y Red y muestran resultados/conteos correctos por estado.
- No quedan botones de información de mapa señalados en anotaciones; atribución de mapa continúa visible.
- Llegadas/afluencia conservan una nota de simulación en fuentes y no se presentan como datos en vivo.
- Suite y build pasan; no suben recursos iniciales ni memoria del mapa sin justificación medida; Android se revisa en teléfono.

## Inicio de la siguiente interacción

1. Comprobar `git status`, rama y commits; conservar trabajo del usuario.
2. Leer este plan y `docs/MEMORIA_CONTINUIDAD_UI_MAPAS.md`; cotejar anotaciones con componentes actuales antes de modificar.
3. Implementar Fase 1 en un bloque revisable y probar Inicio móvil; continuar con Fases 2–4 en bloques dependientes.
4. Cerrar cada interacción con pruebas relevantes, actualización de continuidad y, si está validado, commit/push normal en la rama de trabajo.
