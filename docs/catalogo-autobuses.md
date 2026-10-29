# Catálogo de autobuses: fuentes y alcance

> Registro histórico: conserva el alcance y las cifras de su fecha. Para el estado vigente, consultar el [índice documental](README.md), la [especificación técnica](especificacion-tecnica.md) y la [hoja de ruta](hoja-de-ruta.md).

## Inventario de cobertura — 25 de octubre de 2026

El catálogo local contiene **214 servicios documentados de seis redes**, no 41. Los 41 de la investigación inicial que figura más abajo fueron una primera incorporación y no describen la cobertura actual. Hay **59 servicios con mapa de consulta en su ficha**: tres líneas de Metro y 56 paquetes de autobús. El mapa general y el grafo experimental conservan **54 recorridos y 3,417 puntos**, porque los cinco mapas nuevos se incorporan **sólo para consulta**.

| Red | Catalogados | Mapa de ficha | Mapa general / grafo experimental | Sin mapa importado |
| --- | ---: | ---: | ---: | ---: |
| Metrorrey | 5 | 3 | 3 | 2 |
| Muevo León / urbanas IMA | 152 | 17 | 12 | 135 |
| RegioRuta | 7 | 7 | 7 | 0 |
| Transmetro | 40 | 30 | 30 | 10 |
| Ecovía / GMG | 1 | 1 | 1 | 0 |
| Troncales e integradas | 9 | 1 | 1 | 8 |
| **Total** | **214** | **59** | **54** | **155** |

El [inventario completo por ID](inventario-rutas-2026-10-25.csv) conserva nombre, ramal, estado fechado, fuente, existencia de mapa, pertenencia al grafo y motivo pendiente de cada servicio. Su versión estructurada es [`data/route-coverage-inventory.json`](../data/route-coverage-inventory.json); se regenera sin red mediante `node scripts/prepare-coverage-inventory.mjs`. `--check` comprueba que coincide con los catálogos y el grafo. El inventario no se carga en el cliente y no aumenta la carga inicial de la app.

### Cinco trazos recuperados para consulta

El 25 de octubre se descargaron cinco KML públicos enlazados en los registros SETME del IMA. Se conservaron sus LineString por separado y los marcadores publicados, sin crear paradas ni unir calles. El [conjunto SETME](https://catalogodatos.nl.gob.mx/dataset/2024_2025_tpe_publico_setme) sigue describiendo el periodo octubre de 2024–septiembre de 2025 y declara Open Data Commons Attribution License; el KML no declara una licencia individual. Cada paquete conserva esa distinción, atribución y SHA-256 de la descarga original. La consulta de hoy no actualiza la fecha de vigencia del servicio.

| ID exacto del servicio | Trazos | Vértices | Marcadores | Mapa oficial |
| --- | ---: | ---: | ---: | --- |
| `ima-13-remanente-soriana-sendero-lincoln` | 1 | 614 | 128 | [13 Lincoln](https://www.google.com/maps/d/viewer?mid=1jQDzqpCErmQqiYIhUchO7ZFNeSSmfuE) |
| `ima-39-directa-san-bernabe-centro` | 1 | 591 | 195 | [39 San Bernabé–Centro](https://www.google.com/maps/d/viewer?mid=1tqxvKxRLT9Gv4v2P2vZq8ObReJWHeWw) |
| `ima-109-remanente-aeropuerto-y-griega` | 1 | 447 | 96 | [109 Aeropuerto–Y Griega](https://www.google.com/maps/d/viewer?mid=1qixqkTypIZUkUJmCeod-jrYqwxFEmcI) |
| `ima-124-alimentadora-quinta-colonial-ruiz-cortines-por-anillo` | 1 | 560 | 174 | [124 por Anillo](https://www.google.com/maps/d/viewer?mid=1WGmhGxnbDB2h18JzOiSC7heM_FSEEoM) |
| `ima-310-remanente-portal-de-lincoln-estacion-san-bernabe` | 1 | 812 | 130 | [310 Portal de Lincoln–San Bernabé](https://www.google.com/maps/d/viewer?mid=1U9xL8zAwPsLQVBNTZv3nuvLei9yM01w) |

Los conteos y hashes auditables están en [`data/coverage-source-audit-20261025.json`](../data/coverage-source-audit-20261025.json). `scripts/import-ima-view-maps.py` reproduce la descarga, valida coordenadas finitas dentro de la cobertura y exige al menos un trazo y dos marcadores antes de modificar snapshots. Los cinco paquetes suman 723 marcadores y aproximadamente 335 KiB sin compresión; se descargan únicamente al consultar la ficha correspondiente.

Sus marcadores incluyen infraestructura propuesta. `stopOrderVerified: false` y `experimentalRouting: false` evitan que la mera disponibilidad del mapa habilite instrucciones de abordaje. El pipeline registra `visualization-only` como razón de exclusión del grafo. Todos los autobuses conservan `planningEligible: false` en el catálogo; los 51 autobuses anteriores continúan en el experimento documentado de combinaciones, que no equivale a una secuencia validada por el operador.

### Por qué faltan otros recorridos

Antes de esta incorporación faltaban 160 mapas de ficha: 158 de autobús y dos de Metro. Ahora faltan **155: 153 de autobús y dos de Metro**. El inventario distingue razones sin afirmar una auditoría que no se realizó:

- **114 autobuses tienen enlace My Maps en el catálogo, pendiente de descarga y revisión individual en otro lote.** Es trabajo de importación pendiente, no evidencia de que el recorrido no exista. El motivo por ID es `linked-map-not-imported-or-inspected-this-batch`.
- **39 autobuses conservan fuentes administrativas, páginas de índice o boletines sin enlace individual de geometría en su registro local.** El motivo es `metadata-without-individual-geometry-link`. No significa que se haya descartado toda fuente pública posible ni permite reemplazar un ramal con el trazo de otro que comparte número.
- **L4 y L6 mantienen el estado fechado del catálogo local y quedan fuera del grafo.** El sitio oficial consultado enlaza una [noticia sobre un viaje de prueba](https://www.metrorrey.mx/post/primer-viaje-de-prueba-en-l%C3%ADneas-4-y-6); esa evidencia no basta para certificar apertura de servicio regular, horarios, estaciones operativas u orden de abordaje actual. No se cambió su estado operativo a partir de esa noticia.

El [directorio actual de rutas urbanas del IMA](https://www.imanuevoleon.mx/rutasurbanas) ofrece fichas individuales para más servicios. Se consultaron como muestra las fichas de [Pilares Andalucía](https://www.imanuevoleon.mx/rutadirectapilaresandalucia), 39 San Bernabé y 98 Héroes de Capellanía desde sus enlaces oficiales; no se atribuyeron automáticamente sus geometrías a registros de otro corte. La revisión completa de ese directorio y de los 114 enlaces restantes sigue pendiente. Los diez Transmetro sin mapa importado siguen identificados en el inventario; no se los sustituyó por otros ramales de nombre parecido.

### Verificación de este lote

Se comprobó por script: 214 IDs únicos; fuentes resueltas; cinco descargas XML sin DTD/entidades; 723 IDs de marcador únicos dentro de su paquete; coordenadas y vértices finitos en la ZMM; SHA-256 por fuente; 59 mapas de ficha; los cinco IDs nuevos ausentes del grafo; 54 recorridos/3,417 puntos conservados en el grafo. Esto verifica integridad de snapshots y separación entre consulta y planificación; no certifica servicio en vivo, licencia individual del KML, seguridad del acceso peatonal ni sentidos operativos.

## Antecedentes de investigación — 15 y 16 de octubre de 2026

La investigación que sigue es histórica. El catálogo permite descubrir corredores publicados y consultar su cobertura. Un corredor catalogado no implica que el planificador pueda calcular un viaje en él. Los nuevos registros tienen `planningEligible: false` hasta validar sentidos, secuencia de paradas y conexiones.

## Regio Ruta

El [portal del Gobierno de Monterrey](https://www.monterrey.gob.mx/regio-ruta/) publica siete corredores, gratuidad, requisito de registro y horario general: lunes a sábado 05:00–23:00; domingos y festivos 07:00–23:00. Son horarios del servicio, no llegadas a una parada.

Los enlaces F y G llevan al mismo [mapa público municipal](https://www.google.com/maps/d/viewer?mid=1e1JycXnZrFLm5OR0wkNmMxluVo4e_Cw), que contiene capas nombradas para **todas las rutas A–G**. Se extrajeron únicamente los trazos y marcadores de esas capas a `public/route-packs/regioruta-*.json`, sin sesiones, cuentas, API privada ni datos de pasajeros. El HTML público proporciona geometría y marcadores en `_pageData`; cada paquete conserva fuente, fecha de consulta y hash SHA-256 del documento consultado.

| Ruta | Corredor publicado | Marcadores | Segmentos | Vértices |
| --- | --- | ---: | ---: | ---: |
| A | Macroplaza – Mederos – La Rioja | 93 | 1 | 579 |
| B | La Alianza – Talleres – Valle Verde | 113 | 1 | 532 |
| C | Fomerrey 35 – San Bernabé – Tierra y Libertad | 74 | 1 | 157 |
| D | Obispado – Macroplaza – Fundidora | 61 | 1 | 96 |
| E | Macroplaza – Félix U. Gómez – Moderna | 60 | 2 | 158 |
| F | Cedros – Hospital Universitario – Obispado | 58 | 1 | 160 |
| G | Macroplaza – Sierra Ventana – San Ángel | 60 | 1 | 439 |

El conjunto contiene **519 puntos publicados**, 8 segmentos y 2,121 vértices. Los paquetes completos suman unos 182 kB sin compresión y se pueden cargar al abrir una ruta. Las coordenadas del mapa se convierten de `[latitud, longitud]` a `[longitud, latitud]` para dibujar los trazos; los puntos conservan campos explícitos `lat` y `lng`.

Hay diferencias entre versiones públicas: el PDF de A enumera 88 ubicaciones y su mapa individual muestra 88 marcadores; el mapa conjunto muestra 93. Los mapas individuales de B, C y E también difieren del mapa conjunto y de los corredores nombrados en la página. **No se mezclan versiones**: se conserva el mapa conjunto A–G, cuya capa coincide con cada corredor del catálogo municipal. El portal no indica fecha de actualización, por lo que `statusAsOf` permanece `null`; la fecha de consulta no se transforma en fecha de vigencia.

La capa E publica dos trazos separados, uno rotulado «Línea 62». El paquete conserva ambos en `segments` y expone el principal en `coordinates` por compatibilidad. El visor debe dibujar cada segmento por separado. No debe concatenarlos ni inferir un enlace entre ellos.

No se verificaron sentidos de circulación, acceso peatonal, operación actual de cada punto ni correspondencia de su numeración con un orden de abordaje. Por eso `stopOrderVerified` es `false` y `infrastructureStatus` es `unknown`. El portal no declara una licencia abierta para estos mapas: se registra `license: "not-specified"`; no se presentan como un feed abierto autorizado para redistribución comercial. La atribución y los enlaces de consulta se conservan para hacer la procedencia revisable.

## Transmetro y corredor antes Ecovía

[Rutas por Empresa STC Metrorrey](https://catalogodatos.nl.gob.mx/dataset/rutas-por-empresa-stc-metrorrey) publica un [CSV](https://catalogodatos.nl.gob.mx/dataset/cf7095a0-5126-4bad-a046-35d5ba2b7968/resource/48931e85-c95a-42ed-8022-345cdf755592/download/rutaempresa_stcm_2024_2025.csv) con licencia **Creative Commons Attribution**. El periodo es octubre de 2024 a septiembre de 2025; sus 36 registros incluyen 33 corredores Transmetro, García–Monterrey–Guadalupe y dos registros Metro. Se incorporan los **34 corredores de autobús** en `data/metrorrey-services.json`, con su nombre original y una versión legible. `TM` es una etiqueta de red para la interfaz, no un número oficial de ruta.

El [informe financiero Metrorrey del primer trimestre de 2026](https://www.nl.gob.mx/sites/default/files/repositorio/Dependencias/Sistema%20de%20Transporte%20Colectivo%20%28Metrorrey%29/Repositorios/informacion_financiera/cuenta_publica_2026/20260430_iagf_metrorrey_1t_2026.pdf), apartado 11.2, identifica el corredor García–Monterrey–Guadalupe como **antes Ecovía**. El catálogo conserva «Ecovía» como categoría conocida y alias de búsqueda. Esta identificación proviene del informe, porque el diccionario del CSV no explica el código de modalidad `9` de ese registro.

Se conservan horarios, duración, tarifa y unidades registradas dentro de `historicalService` con periodo `2025-09`. No se usan como tarifa, frecuencia, llegada o flota disponible actual. Las estadísticas de pasajeros y kilómetros agregadas no se asignan a rutas con campos vacíos.

El [CSV de Paradas Oficiales STC Metrorrey](https://catalogodatos.nl.gob.mx/dataset/paradas-oficiales-stc-metrorrey) contiene 34 filas de autobús, todas con coordenadas `SIN VALOR` y ubicación `SIN DATO`. Además, la ficha no tiene licencia declarada. No ofrece geometría útil para esos corredores. Dos nombres también discrepan: el catálogo de rutas usa San Bernabé y el de paradas usa Talleres para Julio A. Roca y No Reelección. Se documenta la discrepancia sin suponer equivalencia. Los nombres de municipios del corredor no se transforman en coordenadas ni paradas inventadas.

## Resto de la red y mantenimiento

La auditoría estructurada en `data/bus-catalog-access.json` conserva URLs, recursos, licencia declarada, fechas y limitaciones del catálogo IMA/SETME y STCM. El catálogo estatal consultado publica CSV; no se localizó un GTFS o GeoJSON en la búsqueda del grupo Movilidad y Transporte, la organización Metrorrey y `package_search?q=transporte`. Esto no demuestra que no exista otro feed público.

El Gobierno estatal enlaza [Muevo León para pasajeros](https://pasajero.lowcobalt.com/HPSTrackerV4/Pasajero.html) desde su [boletín de rutas dedicadas](https://nl.gob.mx/es/boletines/llega-sedes-mundialistas-con-rutas-dedicadas-son-gratuitas-y-seguras). El portal devolvió `connection reset` tanto en consulta HTTP/TLS como en navegador. No se validó API pública, licencia ni telemetría; su texto indexado incluye «Información de Demo». No se conecta al prototipo como fuente de datos en vivo.

Para actualizar Regio Ruta: revisar primero la página municipal, seguir el mapa conjunto que conserve capas identificadas y comparar las capas y marcadores con la versión anterior. Para STCM: descargar el CSV y su diccionario desde la ficha, comprobar periodo y anomalías y conservar la procedencia de los campos. Antes de habilitar viajes calculados, verificar por sentido orden de paradas, enlaces peatonales y transferencias con estaciones. La proximidad entre coordenadas no prueba que exista una conexión transitable.

Validación de la primera incorporación del 15 de octubre: 41 identificadores únicos; fuentes resueltas; siete paquetes con 519 identificadores de parada únicos dentro de cada ruta; coordenadas finitas dentro de la ZMM; longitudes de segmentos conservadas; ningún corredor de esa primera incorporación elegible para el grafo en aquel corte. Los conteos actuales están al inicio de este documento.
