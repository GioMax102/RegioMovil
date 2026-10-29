# Cobertura de trazos · 27 de octubre de 2026

Informe histórico. La [auditoría del 28 de octubre](auditoria-pendientes-2026-10-28.md) recupera seis mapas oficiales y actualiza la cobertura a **191 de 209 rutas de autobús**, con 18 pendientes individualizadas. Los datos y motivos de abajo describen la consulta del día 27.

El catálogo contiene 214 servicios: 209 rutas de autobús y cinco líneas Metro. Se incorporan al mapa y al planificador experimental 185 rutas de autobús y las tres líneas Metro en servicio publicado: 188 recorridos, con 10 794 puntos publicados. Las líneas 4 y 6 en construcción se mantienen fuera del cálculo. La versión anterior del grafo sólo tenía 51 rutas de autobús.

| Red | Trazos de autobús importados | Rutas registradas |
| --- | ---: | ---: |
| Muevo León / urbanas IMA | 139 | 152 |
| Troncales e integradas | 8 | 9 |
| Transmetro | 30 | 40 |
| RegioRuta | 7 | 7 |
| Ecovía / GMG | 1 | 1 |

## Fuentes y criterio de integración

Se importaron los enlaces My Maps documentados y se recuperaron mapas adicionales de páginas públicas del [portal IMA](https://www.imanuevoleon.mx/rutasurbanas), contrastando código, variante y título. La cadena de página, recurso, mapa, fecha y hash está en [auditoría de mapas IMA](../data/ima-map-sources.json); las comprobaciones de páginas dinámicas están en [evidencia de navegador](../data/ima-map-browser-evidence.json).

Los segmentos publicados se conservan separados. Para el grafo se proyectan los marcadores sobre su segmento y se excluyen los que sólo describen una propuesta o están a más de 160 metros. En esta versión se excluyeron 11 093 propuestas y 13 marcadores alejados del trazo. Los cinco paquetes que antes eran sólo consultables se evalúan con el mismo criterio experimental que los demás.

Un trazo publicado no verifica operación actual, infraestructura construida, secuencia de abordaje o sentidos permitidos. El planificador conserva esa incertidumbre: las secuencias y sentidos de autobús se infieren, y tiempos y afluencia son simulados. La procedencia se conserva por paquete; la licencia del catálogo no se atribuye automáticamente al mapa vinculado.

## Rutas pendientes

Quedan 24 rutas de autobús sin geometría importable confirmada. Las fichas siguen disponibles; no generan trayectorias. No se dibujaron trazos para suplir estas fuentes.

| Ruta y variante | Motivo | Fuente revisada |
| --- | --- | --- |
| Ruta 128 Remanente Ermita – Cananea – Centro | Sin página de mapa que coincida inequívocamente con esta variante. | [Consultar fuente](https://www.nl.gob.mx/es/boletines/renueva-samuel-garcia-con-30-nuevas-unidades-las-rutas-227-y-128) |
| Ruta 218 Directa Santa Maria Rosita Fleteros | Página oficial con título correcto, sin mapa recuperable tras renderizarla. | [Consultar fuente](https://www.imanuevoleon.mx/copy-2-of-projects-4/enchanted-echoes) |
| Ruta 218 Directa Santa Maria Rosita Plutarco E. Calles | La página oficial documentada devolvió un error de descarga (404). | [Consultar fuente](https://www.imanuevoleon.mx/copy-2-of-projects) |
| Ruta 223 Directa Hector Caballero | Página oficial con título correcto, sin mapa recuperable tras renderizarla. | [Consultar fuente](https://www.imanuevoleon.mx/copy-9-of-projects-2-1/enchanted-echoes) |
| Ruta 226 Alimentadora Palmiras – Estación Sendero | Página oficial con título correcto, sin mapa recuperable tras renderizarla. | [Consultar fuente](https://www.imanuevoleon.mx/copy-18-of-projects-2-1-1/enchanted-echoes) |
| Ruta 227 Remanente Clouthier | Sin página de mapa que coincida inequívocamente con esta variante. | [Consultar fuente](https://www.nl.gob.mx/es/boletines/renueva-samuel-garcia-con-30-nuevas-unidades-las-rutas-227-y-128) |
| Ruta 227 Remanente Emiliano Zapata | Sin página de mapa que coincida inequívocamente con esta variante. | [Consultar fuente](https://www.nl.gob.mx/es/boletines/renueva-samuel-garcia-con-30-nuevas-unidades-las-rutas-227-y-128) |
| Ruta 228 Remanente Santa Isabel Estacion Felix U. Gomez | Página oficial con título correcto, sin mapa recuperable tras renderizarla. | [Consultar fuente](https://www.imanuevoleon.mx/copy-18-of-projects-2-1-1-1/enchanted-echoes) |
| Ruta 233 Remanente Raul Salinas Fome 35 UANL | Página oficial con título correcto, sin mapa recuperable tras renderizarla. | [Consultar fuente](https://www.imanuevoleon.mx/copy-21-of-projects-2-1-1-1/enchanted-echoes) |
| Ruta 38/310 Troncal Lincoln Ruiz Cortines Centro | La página identificada como 38/310 muestra la ruta 213; no se reutiliza ese mapa. | [Consultar fuente](https://www.imanuevoleon.mx/projects/enchanted-echoes) |
| Ruta 405 Alimentadora Félix U. Gómez – Estanzuela | Sin página de mapa que coincida inequívocamente con esta variante. | [Consultar fuente](https://www.nl.gob.mx/es/boletines/entrega-gobernador-nuevas-unidades-de-transporte-fortalece-sectores-en-el-sur-de) |
| Ruta 5 Remanente Estanzuela – Los Cristales | Sin página de mapa que coincida inequívocamente con esta variante. | [Consultar fuente](https://www.nl.gob.mx/es/boletines/entrega-gobernador-nuevas-unidades-de-transporte-fortalece-sectores-en-el-sur-de) |
| Ruta 50 Más Palomas – San Ángel | Sin página de mapa que coincida inequívocamente con esta variante. | [Consultar fuente](https://www.nl.gob.mx/es/boletines/entrega-samuel-garcia-nuevas-unidades-la-ruta-50-mas-palomas-que-restructura-su-recorrido) |
| Ruta 527 Alimentadora Mision de San Javier San Pablo | Página oficial con título correcto, sin mapa recuperable tras renderizarla. | [Consultar fuente](https://www.imanuevoleon.mx/copy-33-of-projects-2-1-1-1-1-1/enchanted-echoes) |
| Exposición – Juárez – Valle del Roble | El registro oficial consultado no proporciona un enlace geométrico de esta ruta. | [Consultar fuente](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) |
| Félix U. Gómez – Monte Cristal | El registro oficial consultado no proporciona un enlace geométrico de esta ruta. | [Consultar fuente](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) |
| Garza Sada – Carretera Nacional | El registro oficial consultado no proporciona un enlace geométrico de esta ruta. | [Consultar fuente](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) |
| Hospital Metropolitano – Prados del Nogalar | El registro oficial consultado no proporciona un enlace geométrico de esta ruta. | [Consultar fuente](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) |
| Mederos – El Uro | El registro oficial consultado no proporciona un enlace geométrico de esta ruta. | [Consultar fuente](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) |
| Palmiras – Buenavista / Villas San Francisco | El registro oficial consultado no proporciona un enlace geométrico de esta ruta. | [Consultar fuente](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) |
| Sendero – Buenavista | El registro oficial consultado no proporciona un enlace geométrico de esta ruta. | [Consultar fuente](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) |
| Sendero – Fernando Amilpa | El registro oficial consultado no proporciona un enlace geométrico de esta ruta. | [Consultar fuente](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) |
| Universidad – Asarco – Nuevo Sur – Mederos | El registro oficial consultado no proporciona un enlace geométrico de esta ruta. | [Consultar fuente](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) |
| Y Griega – Dos Ríos | El registro oficial consultado no proporciona un enlace geométrico de esta ruta. | [Consultar fuente](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) |

El [inventario CSV](inventario-rutas-2026-10-27.csv) y la [auditoría de cobertura](../data/route-geometry-coverage.json) incluyen cada servicio y su estado. La ausencia de paquete local no se presenta como prueba de que nunca haya existido una fuente pública.

## Rendimiento y uso sin conexión

El grafo ampliado se descarga al abrir mapas o planificación, fuera del precache inicial. Pesa unos 8,5 MiB sin comprimir y aproximadamente 1 MiB con gzip; el servidor permite gzip y Brotli para este archivo hasta 12 MiB. Los reportes y fotos permanecen fuera del caché. Los viajes guardados conservan exclusivamente sus alternativas, paradas y procedencia, sin duplicar la auditoría de toda la ciudad en cada paquete.
