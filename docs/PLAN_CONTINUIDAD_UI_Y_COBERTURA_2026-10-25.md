# Plan de desarrollo y continuidad — UI y cobertura de RegioMóvil

Fecha: 25 de octubre de 2026. Rama: `fixes`. Base comprobada: `14afba358145f2026e17c6959e6cc73e4310b96d`.

## Acuerdo de esta interacción

Sólo preparar el plan y la memoria. **Los cambios de código empiezan en la siguiente interacción.** No modificar ahora componentes, estilos, catálogos, configuración Android ni artefactos. No hacer push, merge ni despliegue.

La entrega anterior pasó 295 pruebas en 41 archivos y se compiló para web/Android. El APK de este commit ya se instaló mediante `adb install -r` y se abrió en el Xiaomi conectado: `am start -W` devolvió `Status: ok`; la actividad quedó `RESUMED` y visible. Esto confirma instalación/apertura, no GPS en movimiento, TalkBack ni todos los flujos físicos.

## Objetivo y decisiones de diseño

Mantener el mapa como contenido principal, la interfaz breve y los datos reales con procedencia. Ajustar espaciado y jerarquía, recuperar textura en acciones especiales, dar continuidad visual al catálogo y permitir encontrar todos los servicios documentados aunque no tengan un trazo importado.

La petición sobre «padding superior de regioruta» se interpreta a partir de la captura como el **encabezado con la marca RegioMóvil**, no como eliminar el filtro o los corredores RegioRuta. El bloque de marca superior se mostrará sólo en Inicio y ocupará menos altura. En las otras pantallas, las acciones imprescindibles de información/avisos/estado se integrarán en controles compactos del contexto, sin reservar otra franja equivalente. En escritorio, conservar navegación lateral útil; evitar duplicación de marca en el área de trabajo.

La referencia visual sirve para textura sutil, profundidad y botones especiales; se conserva la paleta regional existente, legibilidad y superficies opacas. No copiar fondos pastel de bajo contraste ni aplicar textura a todas las tarjetas.

## Diagnóstico comprobado al leer el código

- `src/mapLayout.css` asigna `background: var(--app-primary)` al CTA después de `product.css`: el shorthand elimina la imagen de fondo de textura definida previamente. Recuperar la textura resolviendo la cascada, sin añadir imágenes pesadas.
- `.app-shell` ya suma `--app-safe-top` y el topbar móvil vuelve a sumarlo en padding/altura. Es un candidato concreto a explicar el espacio de la captura Android; medir el inset real y su tratamiento nativo antes de decidir qué capa debe aplicarlo. No eliminar la protección de la barra de estado.
- El margen de pestañas requiere corregir el selector real `.network-section-tabs`: el override `.map-page main > .network-tabs` no coincide con el JSX actual.
- `NetworkExplorer` busca sólo en `network.routes` (54 recorridos dibujables), mientras `TransitCatalog` consulta el catálogo completo (214 servicios) y muestra inicialmente 24, ampliables. La existencia de un servicio y su presencia en el mapa son estados distintos actualmente poco claros.
- La apertura de `details.network-catalog-sheet` cambia a posición absoluta de inmediato. Falta una transición de apertura/cierre que muestre el origen del panel.
- El diálogo «Conoce esta unidad» conserva colores fijos y estructura antigua en `App.tsx`/`styles.css`; no comparte aún la identidad refinada de las tarjetas.
- `arrival-estimate` usa el acento azul. Se solicita volver al verde existente.
- Los textos en mayúsculas de la barra lateral están escritos así en JSX; no basta quitar `text-transform`.
- `saved-mobility-endpoints` mezcla nodos de texto con SVG y depende de estilos globales. Requiere estructura explícita para origen → destino horizontal.

## Fases y orden de implementación

### Fase 1 — espacio útil y ajustes visuales (prioridad alta)

1. Medir en web y Android el espacio desde la barra del sistema hasta el primer control. Aplicar la zona segura una sola vez; reducir el padding decorativo del encabezado en Inicio y ocultar el bloque de marca superior en las otras pantallas.
2. Integrar acciones globales necesarias sin duplicar barras. Recalcular altura del mapa con `useMapWorkspaceHeight`; no compensar con márgenes negativos, alturas rígidas ni restas de un encabezado que ya no existe.
3. Separar pestañas Metro/Rutas y redes del borde superior con un margen breve y consistente (guía inicial: 8–12 px fuera de la zona segura), conservando el mapa grande. No interpretar «agregar margen» como recuperar una cabecera vacía.
4. Selector: valor general «Línea» en lugar de «Metro»; mantener opciones Línea 1/2/3 y posibilidad de todas las líneas. Reservar espacio independiente para la flecha, texto y foco, sin recortar en 320 px o con fuente grande. Mantener semántica de select y teclado nativo.
5. Alinear título, distintivos y acciones del header de estación con padding lateral uniforme y separación vertical. Dar padding/margen real a «Próximas unidades» respecto de bordes y primera tarjeta; revisar especificidad de reglas globales y lazy CSS.
6. Cambiar «TU MOVILIDAD» a «Tu movilidad» y «HECHO PARA NUEVO LEÓN» a «Hecho para Nuevo León»; revisar rótulos de guía («Paso…», «Trayecto completado») y otros textos equivalentes sin alterar siglas oficiales ni códigos de ruta.
7. Presentar origen → destino de guardados en una sola fila: contenedores `minmax(0, 1fr) auto minmax(0, 1fr)`, flecha estable y truncado de nombres largos. Mantener nombres completos accesibles; ninguna columna vertical accidental ni scroll horizontal de página.

Archivos principales: `App.tsx`, `styles.css`, `mapLayout.css`, `responsive.css`, `MetroStationBrowser.tsx/.css`, `MetroStationDetail.tsx/.css`, `SavedMobilityTrips.tsx`, `savedTrips.css`, `useMapWorkspaceHeight.ts`. Revisar Android únicamente si las mediciones muestran un origen nativo del espacio.

### Fase 2 — textura, tarjetas y continuidad del catálogo

8. Restaurar el CTA «¿A dónde vamos?» con verde y textura estática discreta de curvas/topografía mediante CSS o SVG ligero. Aplicar el mismo lenguaje sólo a otras acciones principales justificadas; contenido de lectura neutral. Mantener textura por debajo de texto/iconos, foco visible y variante oscura. Desactivar decoración en contraste alto/forced colors.
9. Rediseñar «Conoce esta unidad»: línea/dirección, intervalo orientativo dominante, hechos compactos y coherentes con el resto de la app. Identificar de forma visible la simulación; mover explicación extensa del modelo a Info cerrado. Accesibilidad real «Sin verificar» sigue diferenciada. Reutilizar identidad de unidad/pagos sólo si existen datos aplicables; no inventar número, foto o estado de un vehículo real.
10. Recuperar el verde anterior en «Llegada estimada» con tokens del tema y contraste comprobado; no tocar colores oficiales de líneas ni cambiar el significado de afluencia.
11. «Rutas y sistemas» debe deslizarse desde su propia franja inferior hasta ocupar el área principal disponible. Transición de apertura y cierre breve (orientativo: 180–240 ms), sin animación continua; reducir movimiento produce cambio inmediato. Mantener contexto del mapa, buscador/filtros y posición de scroll al volver. No montar un segundo mapa ni cargar todos los paquetes al abrir el catálogo.
12. Definir semántica consistente del panel: si se usa como región sobrepuesta no modal, no aplicar foco atrapado; si se vuelve modal, bloquear fondo y gestionar Escape/foco. Preferencia inicial: panel de la misma pantalla con cierre visible y foco en título/búsqueda al abrir, y retorno a «Rutas y sistemas» al cerrar. Evitar foco en contenido oculto durante ambas transiciones.

Archivos: `product.css`, `mapLayout.css`, tema/appearance, `arrivalCard.css`, `App.tsx` (posible extracción de un detalle de unidad reusable), `NetworkExplorer.tsx`, `networkExplorer.css`, y `MapSheet` sólo si puede reutilizarse sin regresión ni reescritura general.

### Fase 3 — reconocer estaciones durante transbordos

13. Crear/reutilizar una fila compacta de acciones por estación: foto (ojo), Google Maps (pin) y guardar (marcador). Compartir el comportamiento con el header de Metro, no copiar tres implementaciones.
14. Integrarla en cada punto de transbordo del detalle y en el transbordo relevante de la guía activa. Para dos paradas distintas, identificar claramente dónde bajar y dónde abordar; no asumir que comparten coordenadas o fotografías.
15. Resolver estaciones por identificador del paso/grafo, no por coincidencia de nombre. Ojo únicamente cuando existe fotografía documentada. Maps únicamente con coordenadas válidas, apertura explícita y enlace seguro. Si no hay foto, mantener la alternativa Maps sin imágenes falsas.
16. Guardar estación debe reutilizar la persistencia de favoritos existente y actualizar su estado en todas las vistas. Distinguirlo del guardado de un trayecto completo. Mantener una sola acción principal de avance en la guía y no tapar el mapa con las acciones secundarias.
17. Al abrir/cerrar foto o guardar durante la guía, conservar etapa, progreso y estado de pausa; no solicitar GPS ni iniciar/reanudar seguimiento por estos botones.

Archivos: `StationStreetView.tsx`, `MetroStationDetail.tsx`, `MobilityJourneyDetail.tsx`, `ActiveJourney.tsx`, capa existente de favoritos y posibles utilidades compartidas. Contemplar guardados v1 y paradas de autobús con datos incompletos.

### Fase 4 — cobertura y acceso a rutas faltantes

**Inventario local comprobado (catálogo con fecha de consulta 2026-10-16; no auditoría nueva de vigencia):**

| Red | Servicios catalogados | Con trazo importado para mapa | Sin trazo importado |
| --- | ---: | ---: | ---: |
| Metrorrey | 5 | 3 | 2 |
| Muevo León / urbanas IMA | 152 | 12 | 140 |
| RegioRuta | 7 | 7 | 0 |
| Transmetro | 40 | 30 | 10 |
| Ecovía / GMG | 1 | 1 | 0 |
| Troncales e integradas | 9 | 1 | 8 |
| **Total** | **214** | **54** | **160** |

Los tres trazos de Metro provienen de la red base; no de `geometryPack`. Hay 51 paquetes de autobús. Los 160 servicios sin trazo son **158 de autobús**, más L4/L6, registradas como construcción en la versión local. No afirmar que esa condición sigue vigente sin revisar las fuentes en la implementación.

Por qué no están todos dibujados:

- El catálogo conserva nombres, registros y enlaces aunque no haya geometría importada. La razón técnica registrada para 158 autobuses es `no-published-geometry`; significa que el paquete local no dispone de un trazo incorporado, **no demuestra que sea imposible encontrarlo en otra fuente**.
- Los antecedentes de `docs/catalogo-autobuses.md` explican fuentes incompletas, coordenadas ausentes, diferencias entre versiones y sentidos/orden sin verificar. Ese documento es histórico y su conteo inicial de 41 identificadores no describe el catálogo actual de 214: actualizarlo al implementar.
- Hay enlaces oficiales a mapas todavía no importados; revisar acceso, contenido y condiciones de uso individualmente. No rellenar trayectos uniendo municipios, terminales o puntos sueltos.
- RegioRuta A–G ya está incorporada para consulta. El registro IMA «sin asignar» es administrativo y está excluido deliberadamente del catálogo público.
- `planningEligible` del catálogo y las combinaciones experimentales del grafo multimodal no significan lo mismo. No activar todos los autobuses cambiando un booleano. Mantener las advertencias de sentido/orden y los límites experimentales.

Trabajo:

18. Hacer que el buscador y el catálogo permitan encontrar **los 214 servicios documentados**, con código, ramal y nombre; no limitar la búsqueda a las 54 geometrías. Conservar paginación/carga gradual para dispositivos modestos.
19. Si hay trazo, abrirlo. Si no, abrir una ficha útil con nombre/corredor conocido, fuente y acceso oficial, más estado breve «Trazo pendiente». No presentar mapa vacío ni botón de planificación como si hubiera recorrido validado. Mantener la explicación detallada en Info.
20. Generar inventario trazable por ID: encontrado en fuente, geometría disponible, importado, visible, elegible o experimental, pendiente y motivo. Resolver alias/duplicados por ramal e identificador; no fusionar servicios sólo por número.
21. Revisar fuentes oficiales existentes, sus mapas y actualizaciones en lotes; empezar por los servicios buscados sin resultado y por los enlaces públicos importables. Verificar licencia/atribución, fecha, coordenadas ZMM, segmentos discontinuos, origen de marcadores y sentidos. Documentar fallos de acceso o información faltante por ruta.
22. Incorporar geometrías recuperables mediante el pipeline existente, conservando hashes/fechas/atribución y carga diferida. Importar la visualización no equivale a confirmar operación actual ni orden de abordaje.
23. Cerrar con un balance concreto: rutas añadidas, rutas ya accesibles pero difíciles de encontrar y pendientes con motivo verificable. El objetivo es visibilidad de todo el catálogo conocido y aumento justificado de cobertura; no prometer tener todas las rutas actuales de la ZMM sin un inventario oficial completo.

Fuentes de trabajo locales: `data/transit-catalog.json`, `data/ima-services.json`, `data/metrorrey-services.json`, `data/bus-catalog-access.json`, `public/mobility-network.json` (coverage), `public/route-packs/`, `prepare-catalog.mjs`, pipeline de movilidad y scripts de importación. UI: `NetworkExplorer.tsx`, `TransitCatalog.tsx`, API de catálogo.

## Correspondencia con las 12 anotaciones

| Anotación | Trabajo | Fase |
| --- | --- | --- |
| 1 | Margen de pestañas tras compactar encabezado | 1 |
| 2 | Selector «Línea» y espacio para flecha | 1 |
| 3 | Espaciado de Próximas unidades | 1 |
| 4 | Catálogo que emerge/desliza desde la franja inferior | 2 |
| 5 | Identidad y jerarquía del detalle de unidad | 2 |
| 6–7 | Textos en estilo oración | 1 |
| 8 | Margen de título, distintivos y acciones de estación | 1 |
| 9 | Foto/Maps/guardar en estaciones de transbordo | 3 |
| 10 | Llegada estimada en verde | 2 |
| 11 | Guardados: origen → destino en una fila | 1 |
| 12 | Textura del CTA de Inicio | 2 |

Las dos consideraciones adicionales quedan cubiertas por el encabezado sólo en Inicio (fase1) y la auditoría/visibilidad de rutas (fase4).

## Criterios de aceptación y verificación futura

- Sin franja blanca decorativa encima de marca; sin duplicar el inset del sistema. Marca superior sólo en Inicio; controles de Red con separación breve. Medir en el Xiaomi, no sólo en el navegador.
- Pestañas, selector, header de estación, primera unidad y fila de guardados legibles en 320/390/926 px; escritorio ancho y orientación horizontal. Fuentes grandes sin cortar flecha/texto, ni scroll horizontal de página.
- CTA texturizado en claro/oscuro con texto nítido; contraste alto sin decoración. El verde de llegada conserva contraste.
- Apertura/cierre del catálogo muestra su procedencia y respeta movimiento reducido; foco, Escape, teclado y scroll previsibles. La búsqueda conserva resultados y filtros al volver.
- Un transbordo con foto documentada y otro sin foto funcionan; guardar desde guía no cambia progreso/GPS y Maps no abre automáticamente.
- Una ruta conocida con geometría y otra sin ella aparecen en búsquedas. Buscar un ramal no devuelve un servicio distinto con el mismo número. No activar L4/L6 ni estados pendientes sin fuente nueva.
- Mantener funcionamiento offline, atribución OSM/fotos, límites, búsquedas cancelables, guía manual y snapshots antiguos. No agregar permisos ni credenciales al cliente.
- Pruebas significativas de flujos anteriores: foco/animación reducida, persistencia de favoritos en transferencias, búsqueda de catálogo completo y ramas sin geometría. Después TypeScript, suites afectadas, build/presupuesto y regresiones completas al consolidar.
- Presupuestos existentes: recursos iniciales <600 KiB y CSS gzip por archivo <16 KiB. Baseline: 606087 bytes iniciales /16239 bytes CSS inicial gzip; margen CSS pequeño, preferir estilos diferidos y sustituir reglas antiguas a acumular overrides.
- Capturar antes/después de Inicio, Red, Metro, catálogo abierto, detalle de unidad, transbordo y guardados. Compilar/sincronizar Android con código final, reinstalar preservando datos y revisar el espacio superior en teléfono. No publicar automáticamente.

## Reanudación práctica

1. Leer este archivo y la memoria principal; `git status`/diff y confirmar `fixes`. Los cambios de esta interacción deben ser únicamente documentos.
2. Comenzar por la fase1, midiendo encabezado y áreas seguras. Después textura/tarjetas/catálogo, transferencias y cobertura. La auditoría de fuentes puede avanzar como trabajo independiente de UI sin pisar archivos.
3. Registrar resultados y pendientes por fase en esta sección, con evidencia; no sustituir un pendiente por una afirmación de cobertura completa.
4. Al finalizar cada entrega, actualizar memoria e informe y conservar commits locales. Publicación sólo tras petición para la versión concreta.

Estado inicial de todas las fases: **pendiente de implementación**. No se ejecutaron pruebas, builds ni modificaciones de producto durante la preparación de este plan.

Referencias visuales proporcionadas:

- `/tmp/codex-clipboard-cedbaf27-a8db-47e2-a93a-d9ed45409944.png`: espacio superior real en Android.
- `/tmp/codex-clipboard-36f5f8e4-4f22-49aa-ad0a-9fd83a1c3cb4.png`: textura/profundidad de referencia, adaptada a RegioMóvil.
- Anotaciones del navegador 1–12 incluidas en la conversación; conservar su correspondencia de la tabla.
