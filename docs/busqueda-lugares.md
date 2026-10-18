# Búsqueda de lugares y direcciones en la ZMM

El autocompletado usa Photon, que admite búsqueda mientras se escribe, tolerancia a
errores y direcciones estructuradas. Las consultas llevan un rectángulo fijo ZMM
`[-100.9,25.35,-99.8,26.1]` y país MX; no llevan el GPS ni la IP del dispositivo.
La cuota es global al proceso (una consulta por segundo), con caché de 200 consultas
durante una hora y una pausa de 60 segundos ante HTTP 429. No se envían consultas
de autocompletado a Nominatim público. El endpoint explícito anterior conserva su
proveedor separado y sólo puede usarse como búsqueda enviada por la persona.

Photon documenta búsqueda libre y `/structured?street=...&housenumber=...&city=...`:
https://github.com/komoot/photon/blob/master/docs/api-v1.md
Se contrastó el endpoint público `/structured` el 18 de octubre de 2026 con una
dirección pública de San Pedro; devolvió calle y número, no sólo el centro de una calle.
Si una búsqueda con número no devuelve un domicilio coincidente, se hace como
máximo una consulta estructurada adicional respetando la misma cuota y el límite
total de seis segundos. Una calle sin número comprobado se marca `precision: street`;
no se le agrega el número solicitado ni se interpola una vivienda. Esas opciones
deben confirmarse o ajustarse en el mapa.

Las abreviaturas comunes (Av., Blvd., Gral., Dr., Ote., Pte., etc.) se expanden antes
de consultar; se conservan números, sectores y municipios. Las referencias propias
ignoran acentos y artículos, admiten prefijos y errores cortos en palabras largas,
pero no descartan un campus, número o municipio incompatible. Se combinan con
otras respuestas del proveedor; no sustituyen todo el directorio externo.
Para consultas de intersección, las respuestas externas deben contener términos
de **ambas calles** en su nombre y dirección. Un local cuyo nombre coincide sólo
con una calle, pero está en otra zona, no aparece como alternativa a ese cruce.

El demo de Photon permite proyectos con un volumen razonable, puede limitar el
tráfico y no ofrece garantía de disponibilidad ni cobertura completa:
https://github.com/komoot/photon#demo-server
Política de Nominatim: https://operations.osmfoundation.org/policies/nominatim/
No debe habilitarse Nominatim público como proveedor de autocompletado.

## Intersecciones

`data/street-junctions.json` es un índice exclusivo del servidor: 376,692 bytes,
1,543 nombres de calles, 4,327 vértices compartidos y 790 cruces geométricos de
referencia. Se carga sólo cuando una consulta contiene dos calles, con sintaxis
`A y B`, `A con B`, `A esquina B`, `A esq. con B` o `A & B`.
El cliente Android no descarga ese índice y no ejecuta consultas Overpass.

Se generó desde el mismo extracto público OSM del mapa de contexto, del 17 de
octubre de 2026, cuyo checksum y fecha exacta se conservan en el JSON. Consulta,
licencia y alcance de la extracción: [mapa de Monterrey](../src/data/monterrey-map.md).
El extracto incluye vías principales y terciarias; **no comprende todas las calles
residenciales ni todos los cruces de la ZMM**. Los intentos de ampliación en los
servidores públicos de Overpass devolvieron errores y no se incorporaron respuestas
parciales ni coordenadas inventadas. No se anuncia cobertura de Google Maps.

El importador `scripts/import-street-junctions.py` trabaja sin red y puede recibir
uno o varios extractos OSM explícitos `out body geom` o `out tags geom`:

```sh
python3 scripts/import-street-junctions.py /ruta/extracto.json
```

Un vértice idéntico compartido por dos calles a niveles compatibles da una opción
`resultType: intersection`, `precision: exact`; significa coordenada del vértice,
no que el paso peatonal o la entrada estén verificados. Los cruces de trazos sin
nodo compartido se precalculan con una cuadrícula espacial durante la importación,
se marcan `precision: approximate` y muestran **“Cruce de referencia · verifica los
accesos en el mapa”**. No se añaden conexiones al grafo de transporte ni se afirma
que dos vías a distinto nivel se puedan transitar entre sí. Ejemplo: Garza Sada y
Luis Elizondo. No se calcula el supuesto cruce como promedio de los centros de dos
calles. La selección queda en manos de la persona y puede ajustarse en el mapa.

Modelo de nodos y geometría OSM:
https://dev.overpass-api.de/overpass-doc/en/full_data/osm_types.html
Datos © OpenStreetMap contributors, ODbL 1.0:
https://www.openstreetmap.org/copyright

## Referencia de la Procuraduría de las Mujeres

El Gobierno de Nuevo León anunció el 22 de enero de 2026 el cambio de domicilio
vigente desde el 27 de enero a **Washington 539 Ote., planta baja del Edificio
Elizondo Garza, Centro, Monterrey**:
https://www.nl.gob.mx/es/boletines/anuncia-cambio-de-domicilio-de-la-procuraduria-de-la-defensa-de-los-derechos-de-las

La referencia admite el nombre oficial, “procuraduría de la mujer”, “procuraduría
de la protección del derecho de la mujer”, “defensa derechos mujer” y el domicilio.
La coordenada es una **referencia aproximada del edificio**, no una entrada
certificada. Se contrastó el domicilio oficial con la huella abierta del edificio
de ocho niveles en OSM: https://www.openstreetmap.org/way/450490465
La geometría se obtuvo mediante una consulta mínima del API OSM el 18 de octubre:
`https://api.openstreetmap.org/api/0.6/map?bbox=-100.3105,25.6739,-100.3099,25.6744`.
La referencia usa el promedio de los vértices de la huella (sin repetir el cierre),
latitud 25.67435574, longitud -100.31020416. La asociación de huella y domicilio es
una inferencia geográfica y por eso mantiene `precision: approximate`. No se copian
coordenadas ni directorios propietarios de Google o Waze.

Sin internet, las búsquedas de la interfaz usan estaciones precargadas y lugares
guardados en el dispositivo. El índice adicional de cruces pertenece al servidor;
no amplía de forma encubierta el directorio offline del dispositivo.
