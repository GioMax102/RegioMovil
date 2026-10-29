# Integración de redes y nuevos servicios

> Registro histórico: conserva el alcance y las cifras de su fecha. Para el estado vigente, consultar el [índice documental](README.md), la [especificación técnica](especificacion-tecnica.md) y la [hoja de ruta](hoja-de-ruta.md).

Consulta de fuentes: **15 de octubre de 2026**. Se incorporan ambas redes solicitadas: autobuses y ampliaciones de Metrorrey. Las fichas de catálogo no equivalen a servicios operando hoy.

## Lo que está integrado

- **207 fichas** en seis grupos de consulta: Metrorrey, Muevo León / urbanas IMA, Troncales e integradas, Transmetro, Ecovía / GMG y RegioRuta. El conteo incluye variantes, registros publicados y dos líneas en construcción; no significa 207 rutas nuevas o activas.
- **12 recorridos de autobús** con geometría publicada y **1,464 puntos de referencia**: RegioRuta A–G y cinco variantes IMA de las rutas 105, 107, 223 y 234.
- Búsqueda combinada por número, ramal y municipio; filtros de red y estado, paginación y consulta de fuentes por servicio.
- Mapas que cargan al abrir una ficha. Se preservan segmentos separados, incluyendo la extensión de RegioRuta E; no se dibujan uniones ficticias.
- **L4 y L6–Aeropuerto** se muestran como **en construcción**, con 7 y 15 referencias del mapa oficial, respectivamente. El boletín estatal del 12 de octubre confirma obras; no se incluyen en llegadas o itinerarios.

En la aplicación: **Estaciones → Rutas y redes**. También existe acceso «Rutas de autobús» desde el planificador. En teléfonos, la pestaña inferior de estaciones se llama «Red».

## Datos y límites

El catálogo IMA conserva registros de corte septiembre de 2025 y añade servicios documentados en publicaciones oficiales de 2025–2026. Transmetro y el corredor antes Ecovía proceden del catálogo STCM de septiembre de 2025. RegioRuta utiliza la página y el mapa público enlazados por el municipio; su fecha de actualización no está indicada y se conserva como desconocida.

Los grupos de consulta no certifican la marca o el equipamiento de cada unidad. «Muevo León / urbanas IMA» reúne publicaciones del IMA; no afirma que todas las rutas utilicen la flota estatal nueva. Los puntos de mapas pueden incluir infraestructura propuesta. No se presenta su existencia física, accesibilidad, sentido de abordaje o funcionamiento como verificados.

La geometría procede de documentos públicos atribuidos; las coordenadas IMA se normalizan a seis decimales, sin interpolar posiciones ni inventar paradas. Ver [fuentes IMA](nuevas-rutas-fuentes.md), [RegioRuta y STCM](catalogo-autobuses.md) y [ampliación Metro](expansion-metrorrey.md). Las fichas conservan sus enlaces y condiciones de reutilización conocidas; una publicación accesible no se etiqueta automáticamente como licencia abierta.

## Itinerarios y predicciones

El cálculo de viajes conserva el grafo verificado de **L1, L2 y L3**. Los nuevos autobuses no tienen todavía una secuencia operativa de paradas, sentidos y transferencias verificada para este motor. Por eso sus mapas son consultables, pero no se fabrican tiempos puerta a puerta ni conexiones al Metro. Las nuevas líneas ferroviarias tampoco participan mientras estén en construcción.

El catálogo permite preparar esa integración sin mezclar fichas con aristas de viaje: solo una ruta con evidencia suficiente podrá habilitarse. Los tiempos, afluencia y condiciones de unidades que ya muestra el piloto continúan siendo simulados.

## Consumo y uso sin conexión

El catálogo y los mapas adicionales se solicitan al consultarlos. El navegador conserva estos documentos públicos cuando permite Cache Storage; si no hay red, usa la copia previamente abierta. Los paquetes tienen revisión SHA-256 por ruta, de modo que una actualización de geometría utiliza una clave diferente. No se guardan reportes personales en esta caché.

El APK incluye los documentos y mapas dentro del paquete, por lo que pueden abrirse localmente desde la primera instalación. La web necesita una primera consulta con conexión para conservar cada documento. La instalación inicial de la PWA mantiene el presupuesto de 600 KiB para sus recursos principales; los recorridos de autobús se cargan por demanda.

## Reproducir la actualización

`pnpm catalog:build` combina los catálogos fuente y genera las instantáneas de `data/transit-catalog.json` y `public/transit-catalog.json`. Comprueba referencias a archivos de mapa y calcula su revisión. `pnpm build` y la compilación Android lo ejecutan automáticamente.

La API expone `GET /api/services` y `GET /api/services/:id`. La consulta admite texto, red y estado; no convierte una ficha en una conexión de transporte. Las pruebas verifican identidad de fuentes, geometrías, caché, filtros y exclusión de las obras del planificador.
