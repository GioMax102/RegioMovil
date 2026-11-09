# Continuidad de interfaz y mapas

Fecha: 8 de noviembre de 2026. Rama de trabajo: `codex/ux-reportes-visibles`. Este documento reúne las anotaciones de inicio, reportes, selección de estaciones y guía de trayecto para que la siguiente interacción pueda continuar sin reconstruir el contexto desde capturas.

## Especificación visual

- **Base:** verde Sierra `#006b57` para acciones primarias, texto profundo `#142d36`, fondo cálido `#f4f5f7`, panel `#ffffff`, borde `#d9e0e6` y texto secundario `#52616c`. Usar `src/theme.css` como fuente única de estos tokens.
- **Texto:** Inter Variable para lectura y controles; Montserrat Variable para títulos de marca. Mantener contraste AA y no bajar opacidad del cuerpo para simular jerarquía.
- **Transporte:** insignias sólidas con texto de alto contraste. Metro L1 `#ffbc45`, L2 `#47bd7d`, L3 `#ef6573`, L4 `#b9a1e5`, L5 `#a1d7f0`, L6 `#edb391`; Transmetro `#00756a`, Regio Ruta `#2857aa`, Muevo León `#d3ec58`, Ecovía `#a43e78`, integradas `#7053a4`. Los nombres y el texto siempre acompañan al color.
- **Controles:** objetivos táctiles de al menos 44 px; borde de foco visible; botones de acción agrupados cerca del contenido que afectan. En teléfono, priorizar una fila cuando los controles sean acciones hermanas y permitir desplazamiento horizontal solo en contenido de selección.
- **Tarjetas y conversación:** radios de 12–20 px, bordes finos y sombra leve. Las observaciones usan burbujas alternadas con categoría, estado, título, texto, lugar y fecha. No publicar identidad personal ni simular nombres de autores.
- **Mapas:** base OSM neutra; rutas con colores diferenciados y estaciones legibles según zoom. Ubicación de usuario azul `#1871d8`; halo de precisión y radio de búsqueda de 3 km se distinguen con opacidades diferentes. El radio es búsqueda aproximada, no precisión GPS ni cobertura del servicio.
- **Procedencia:** los corpus sintéticos se identifican con una etiqueta compacta “Visualización / Escenario ilustrativo”. No se les atribuye revisión humana, incidencia real ni resolución institucional.

## Cambios aplicados en este lote

1. En el panel público de reportes se eliminó el aviso grande repetitivo; su procedencia quedó resumida en una etiqueta. Las listas se presentan como burbujas y tienen filtros **Todas**, **Abiertas** y **Resueltas**. El recuento se redujo a tres indicadores y se quitó la lista extensa por categoría.
2. En inicio se eliminó “Ampliar a 3 km”. La búsqueda cercana usa 3 km desde el primer intento; **Cerca de mí/Actualizar cercanos** y **Desactivar cercanía** comparten una fila. La ubicación vive solo en memoria durante la sesión. El mapa la centra y dibuja el radio tenue de búsqueda alrededor del punto azul.
3. El selector de parada de autobús dejó de usar el menú nativo: ahora abre un diálogo con búsqueda, lista acotada y cierre claro, respetando el estilo del producto.
4. La ficha de Metro presenta una línea horizontal desplazable con estaciones anteriores, actual y siguientes en el sentido de la línea. Al centrar o elegir una estación, cambia la ficha y el mapa enfoca esa estación.
5. Los iconos de caminar, transporte y transbordo de la guía usan centrado explícito dentro de su caja.

## Continuidad desde las anotaciones anteriores

Este plan conserva además las solicitudes anteriores: Inicio debe exponer primero la información útil; las rutas y estaciones deben seguir siendo navegables con una mano; el detalle debe conservar acciones de guardar, ubicar, reportar y planear; la guía debe permitir reportar estación, ruta o unidad durante el trayecto; el mapa de red debe ampliar su área útil, ocultar puntos en zoom lejano y poder ocupar toda la pantalla; la selección del mapa debe abrir detalles sin tapar controles; y los trazos pendientes deben priorizarse desde el inventario de fuentes, sin inventar geometrías operativas. Ya se centraron los iconos de caminata, transporte y transbordo en sus contenedores.

Siguen pendientes de lotes previos: conservar el borrador cuando se abre o cancela la cámara/selector de archivos; ofrecer cámara, galería y archivos en una única acción que respete las opciones del dispositivo; mantener las marcas rojas sólo en campos obligatorios; simplificar el segundo paso de confirmación para descartar un borrador y quitar su texto gris repetido; evitar que los puntos de estación saturen el mapa cuando se aleja; y completar, con fuentes auditables, los trazos aún ausentes. Estas tareas no se consideran resueltas por este lote.

Los reportes de comunidad son aportaciones públicas moderadas por contenido, no alertas oficiales ni prueba técnica. El panel administrativo debe ser quien permita revisar, resolver y analizar la concentración geográfica. Las métricas de calidad de servicio/NPS, alertas urgentes y visión computacional siguen siendo etapas propuestas y requieren gobernanza, consentimiento, retención, verificación y revisión legal antes de usar datos identificables o publicar inferencias.

## Plan técnico y criterios de aceptación

| Fase                      | Trabajo                                                                                                                                    | Criterio de salida                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX móvil inmediata        | Cerrar regresiones de reportes, búsqueda de paradas, controles cercanos y centrado de iconos.                                              | Textos completos a 360–390 px, botones táctiles, filtros con `aria-pressed`, diálogo cerrable y sin overflow horizontal del documento.                            |
| Mapa y estaciones         | Mantener sincronizados carrusel lineal, estación seleccionada, ficha y cámara; mostrar ubicación y radio de 3 km solo tras consentimiento. | Al cambiar estación, el nombre y el encuadre coinciden; al desactivar cercanía se quitan punto y radio; ningún permiso aparece al abrir inicio.                   |
| Integridad de datos       | Terminar trazos solo desde geometría y paradas trazables; declarar sentido y orden pendiente.                                              | El catálogo muestra la cobertura real, rutas sin geometría no generan trayectos y cada alta registra fuente, fecha y versión.                                     |
| Calidad comunitaria       | Revisar publicación, deduplicación, retiro, filtros y reportes durante guía.                                                               | Estados abiertos/resueltos consistentes entre usuario y administrador; reportes pendientes no son públicos; conjunto sintético siempre se marca como ilustrativo. |
| Rendimiento y continuidad | Medir carga del mapa, listas y fotos; paginar grandes historiales; evitar recalcular proyecciones y rutas en cada render.                  | Presupuesto de carga y memoria acordado, pruebas con corpus grande y actualización de `docs/ENTREGA_UI_REPORTES_2026-11-08.md` por cada entrega.                  |

## Verificación de este lote

Verificado en esta rama: `./regiomovil build` (600 KiB de recursos iniciales, dentro del presupuesto de 600 KiB); suite completa (566 pruebas aprobadas); `pnpm docs:check` (74 archivos, 493 enlaces locales); `git diff --check`; revisión responsive a 390 × 844 y selección de Félix U. Gómez sincronizada entre carrusel, ficha y mapa. APK debug compilado, instalado y abierto en el Android conectado; la actividad principal quedó en primer plano y ADB mantiene el túnel a localhost:4173. Artefacto: `output/android/regiomovil-debug.apk` (SHA-256 `0be3a92c9d4dadc24ec9a63ae861a333b8e003cab5fb6b2ce74638b34c366aa7`). No hacer merge a `main` desde esta rama: conservar el PR apilado y registrar cada resultado antes de integrarlo.

## Próxima interacción

1. Revisar visualmente Inicio y Red en viewport móvil; validar el selector de parada y el mapa de estación con la API local activa.
2. Corregir cualquier desborde o conflicto con modo oscuro/alto contraste.
3. Ejecutar la suite completa y la comprobación documental; registrar cifras finales.
4. Construir e instalar APK de depuración si el dispositivo sigue conectado; anotar hash y commit en la entrega, sin sobrescribir base de reportes ni credenciales.
5. Actualizar la entrega y continuar en el PR actual. Mantener las capturas locales en `output/qa`, fuera de Git.
