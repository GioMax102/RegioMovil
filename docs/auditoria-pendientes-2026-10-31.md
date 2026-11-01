# P3 · Seguimiento de fuentes pendientes · 31 de octubre de 2026

No se recuperó una geometría nueva en esta revisión dirigida. El inventario local permanece en **191/209 autobuses con trazo y 18 pendientes**, además de las dos fichas Metro sin mapa habilitado. Son las cifras del inventario del 28 de octubre; este seguimiento no certifica la vigencia operativa de todas las rutas hoy.

El [registro estructurado](../data/route-pending-review-2026-10-31.json) conserva consultas, hashes, límites y los 18 identificadores pendientes, con referencia a la [auditoría anterior](auditoria-pendientes-2026-10-28.md). No se modificaron catálogo, paquetes ni grafo, ni se sustituyó un servicio por otro de nombre parecido.

## Comprobaciones nuevas

| Fuente consultada el 31 de octubre | Evidencia y decisión |
| --- | --- |
| [Página enlazada de 218 Plutarco E. Calles](https://www.imanuevoleon.mx/copy-2-of-projects) | La apertura web devuelve HTTP 404. No se sustituye por 218 Fleteros ni se interpreta el error como inexistencia del servicio. |
| [Página enlazada de 38/310](https://www.imanuevoleon.mx/projects/enchanted-echoes) | El encabezado visible sigue identificando Ruta 213 Directa Soriana Sendero Quinta Colonial. Se rechaza como evidencia del recorrido 38/310. |
| [CSV STCM](https://catalogodatos.nl.gob.mx/dataset/cf7095a0-5126-4bad-a046-35d5ba2b7968/resource/48931e85-c95a-42ed-8022-345cdf755592/download/rutaempresa_stcm_2024_2025.csv) | Descarga directa HTTP 200: 4.654 bytes, 36 filas y 15 columnas; sigue declarando septiembre de 2025. Hash idéntico al 28/10. Los diez nombres Transmetro pendientes están presentes, pero no hay coordenadas ni enlaces geométricos. Eso no acredita vigencia ni equivalencia con otros mapas. |
| [KML candidato de Ruta 50](https://www.google.com/maps/d/kml?mid=1jKAR-OjeaEvt9VqKcAYCZ5jJYJO3fn0&forcekml=1) | HTTP 200: título «Ruta 50 Remanente Mas Palomas», 1 segmento, 2 marcadores publicados y 290 vértices. Hash y límites idénticos al 28/10; los vértices no son paradas. No se incorpora como extensión San Ángel. |
| [Anuncio de extensión Ruta 50](https://www.nl.gob.mx/es/boletines/entrega-samuel-garcia-nuevas-unidades-la-ruta-50-mas-palomas-que-restructura-su-recorrido) | La página legible por la herramienta web, publicada el 21/11/2025, describe ampliación hasta San Ángel; no proporciona una secuencia georreferenciada. El anuncio y el candidato anterior siguen sin demostrar que sea el mismo recorrido ampliado. |
| [Anuncio de 128 y 227](https://www.nl.gob.mx/es/boletines/renueva-samuel-garcia-con-30-nuevas-unidades-las-rutas-227-y-128) | La página legible, publicada el 09/09/2026, distingue Ermita–Cananea–Centro, Clouthier y Emiliano Zapata. Aporta identidad del anuncio, sin geometría suficiente para dibujar los tres recorridos. |
| [Referencia de 5/405](https://www.nl.gob.mx/es/boletines/entrega-gobernador-nuevas-unidades-de-transporte-fortalece-sectores-en-el-sur-de) | La apertura devolvió HTTP 403. Su contenido no fue revalidado; el error no demuestra ausencia de información pública. |
| [Anuncio Garza Sada y Mederos–El Uro](https://beta.nl.gob.mx/es/boletines/inicia-gobernador-operaciones-de-la-ruta-transmetro-garza-sada-carretera-nacional) | La página legible, publicada el 08/05/2025, distingue ambos circuitos y enumera avenidas. No resuelve todos los giros, paradas, sentidos ni equivalencias con el CSV histórico. |
| [Convocatoria STCM-25-2024](https://nl.gob.mx/es/licitacion-publica-de-metrorrey-no-stcm-25-2024-daf) | La página sin `www` permite recuperar el enlace exacto de la [ficha técnica](https://nl.gob.mx/sites/default/files/repositorio/Dependencias/Sistema%20de%20Transporte%20Colectivo%20%28Metrorrey%29/Convocatorias/STCM_25_2024/20241128_ficha_tecnica_stcm25.pdf). La descarga directa de esa ficha devuelve HTTP 403; su contenido permanece sin inspeccionar. La convocatoria no acredita por sí sola operación actual. |

Las páginas legibles se consultaron mediante el servicio web, que puede servir contenido indexado; no se generó un hash nuevo de su HTML. Los hashes nuevos reproducibles corresponden a las descargas directas CSV y KML. Se revisaron dos páginas IMA concretas, sin volver a auditar íntegramente el índice IMA ni todos los mapas dinámicos de Metrorrey. Las demás dependencias siguen descritas en el informe anterior y requieren evidencia individual antes de cerrarse.

## Continuidad para una entrega real

1. Obtener enlaces corregidos de **218 Plutarco E. Calles** y **38/310**; rechazar el mapa 213 como sustituto de este último.
2. Obtener mapas exactos de las siete urbanas pendientes, incluida la extensión San Ángel de 50. Conservar separadas las variantes 227 y la identidad IMA 405 respecto del Transmetro.
3. Recuperar una copia accesible de STCM-25-2024 y confirmar vigencia/equivalencia de cada uno de los diez nombres históricos Transmetro. El registro mantiene su fila CSV, sin declararlos automáticamente activos.
4. Solicitar por variante identificador, fecha de vigencia, KML/GeoJSON/GTFS o plano georreferenciado, paradas, sentidos, orden, cambios de operador y derechos de reutilización. La solicitud queda **preparada, no enviada**.
5. Revisar identidad y geometría antes de importar; habilitar el planificador sólo con evidencia suficiente de sus puntos y conexiones. Una fuente parcial permite informar el pendiente, no inventar calles ni completar huecos.

Aceptación pendiente de P3: fuente suficiente por variante, importación revisada, mapa visible y grafo apropiado. La cobertura no aumenta por ocultar la tarjeta de pendientes ni reducir el denominador. Esta revisión cierra la investigación dirigida de la presente entrega; **no cierra P3**.
