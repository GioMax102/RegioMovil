# Catálogo de autobuses: fuentes y alcance

Verificado el **15 de octubre de 2026**. El catálogo permite descubrir corredores publicados y consultar su cobertura. Un corredor catalogado no implica que el planificador pueda calcular un viaje en él. Los nuevos registros tienen `planningEligible: false` hasta validar sentidos, secuencia de paradas y conexiones.

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

Validación realizada: 41 identificadores únicos; fuentes resueltas; siete paquetes con 519 identificadores de parada únicos dentro de cada ruta; coordenadas finitas dentro de la ZMM; longitudes de segmentos conservadas; ningún corredor nuevo elegible para el grafo.
