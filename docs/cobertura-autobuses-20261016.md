# Cobertura de autobuses para búsqueda de trayectos · 16 de octubre de 2026

La aplicación ahora usa 51 recorridos de autobús además de las tres líneas de Metro. Todos los trazos y marcadores proceden de publicaciones oficiales: siete RegioRuta, trece IMA, treinta Transmetro y GMG/antes Ecovía. El modelo contiene 3,417 puntos con IDs por servicio. No son 3,417 paradas físicas distintas y no se garantiza representar toda la red metropolitana.

## Cómo se obtuvieron los datos

El [sitio oficial de Metrorrey](https://www.metrorrey.mx/) tiene la sección **Rutas Transmetro**. Cada icono abre un cuadro con un mapa Google My Maps incrustado y autor público Metrorrey. Se leyeron los enlaces de esos mapas desde su interfaz pública y se descargó su KML de exportación. Esos datos fueron publicados por Metrorrey, no son rutas deducidas de Google Maps ni una copia de rutas de otro operador. No se utilizaron trazos de otro servicio para afirmar equivalencias.

`data/metrorrey-map-sources.json` conserva los 32 enlaces identificados. `scripts/import-metrorrey-maps.py` crea los paquetes de `public/route-packs/`, conserva el SHA-256 original del KML, nombre del mapa, nombres de marcadores, coordenadas a seis decimales y cada LineString por separado. De los 32 mapas, 31 contienen trazo y al menos dos marcadores de parada; el alimentador Gómez Morín–San Agustín tiene cero marcadores y queda excluido. Se conservan las etiquetas numéricas de parada sin inventar calles.

Las ocho nuevas fichas IMA con geometría son los tres ramales 130 (Alameda, Juárez y Hospital), 201 Fleteros, los dos 214 San Pedro (Ocampo y Tapia) y los dos 224 (Lomas Valle Condesa y Cometas). Son los KML enlazados por las fichas SETME oficiales del IMA: [referencias geográficas y paradas SETME](https://catalogodatos.nl.gob.mx/dataset/89f1df19-85d2-4ac7-8239-dd2a852c7bb0/resource/9e424286-f05e-4b8c-a687-15685af39ba9/download/2024_2025_paradas_tp.csv). `scripts/import-ima-coverage.py` permite repetir la descarga. No se añadieron los marcadores exclusivamente propuestos como puntos operativos del grafo.

## San Bernabé a Punto Valle

Los KML oficiales 130 Alameda y 130 Juárez publican una parada en **Av. Manuel Gómez Morín / Río Missouri**, con nota de parabús existente. Está aproximadamente a 164 m en línea recta del polígono de Punto Valle. [El domicilio publicado por Punto Valle](https://puntovalle.com/concierge) es Río Missouri 555, Del Valle, San Pedro Garza García. La combinación documentada puede usar L1 y Ruta 130; la secuencia exacta depende de la preferencia, conexiones y límite de caminata. No se promete que todos los trayectos deban usar Transmetro.

También se incorporaron los marcadores oficiales Transmetro **San Bernabé–Julio A. Roca**, **San Bernabé–No Reelección** y **vía Mármol**. El mapa identifica expresamente la parada Estación San Bernabé, por lo que reemplaza la limitación de la fuente histórica CSV que tenía coordenadas SIN VALOR. Esos tres ramales alimentan la zona de San Bernabé; no se los presenta como un autobús directo a San Pedro.

## Mapas oficiales consultados

| Servicio publicado | Mapa Metrorrey | Resultado |
| --- | --- | --- |
| Cuauhtémoc – San Agustín – Gómez Morín | [Mapa](https://www.google.com/maps/d/viewer?mid=1VS_KrIdfH7d3Dd95vsEz_drNYf_AIRE) | 38 marcadores publicados |
| San Bernabé – Julio A. Roca | [Mapa](https://www.google.com/maps/d/viewer?mid=13TfLrdgRRJkbdiuQZrZHJ7J51iB7z4s) | 24 marcadores publicados |
| San Bernabé – No Reelección | [Mapa](https://www.google.com/maps/d/viewer?mid=158b0mrgZ83t425h9sdO4BrngkGE2jWY) | 27 marcadores publicados |
| San Bernabé – No Reelección (Vía Mármol) | [Mapa](https://www.google.com/maps/d/viewer?mid=1PMsEcdqKxf17KiDnaf4R2B7VDsHKjbQ) | 38 marcadores publicados |
| Cuauhtémoc – Centro – Chipinque | [Mapa](https://www.google.com/maps/d/viewer?mid=1SiRAwsb7r_4J7o9KJrbjW5aLXpwoYRE) | 33 marcadores publicados |
| Cuauhtémoc – Centro – Chipinque (Directo) | [Mapa](https://www.google.com/maps/d/viewer?mid=1w3-G4XB-D-ubHukBaMhSHv3rbJ78u80) | 27 marcadores publicados |
| Alimentadora Gómez Morín – San Agustín | [Mapa](https://www.google.com/maps/d/viewer?mid=19a0L_2utmHeK-9zgCi2gaWsmGbcO2sA) | Excluido: sin marcadores de parada |
| Talleres – Cabezada – La Alianza | [Mapa](https://www.google.com/maps/d/viewer?mid=1YiGZZU_EPm6vnzV27c5t-rFOpf_LgvE) | 42 marcadores publicados |
| Alameda – Praderas | [Mapa](https://www.google.com/maps/d/viewer?mid=1WfqI1ayUqs1Wl4NRb71gLUPeIYBKigE) | 175 marcadores publicados |
| Félix U. Gómez – Dos Ríos | [Mapa](https://www.google.com/maps/d/viewer?mid=1zvQRiqtpQhktJpJXXIN1L-j6-D4zM4g) | 108 marcadores publicados |
| Exposición – Pablo Livas | [Mapa](https://www.google.com/maps/d/viewer?mid=1-AOrLDXxPoJwrhc-X8NGvaxouYe8eRc) | 17 marcadores publicados |
| Exposición – Col. Zaragoza – 21 de Enero | [Mapa](https://www.google.com/maps/d/viewer?mid=1JTgMhFAcMvoMod2SRvKAnWh-iQnP7RY) | 40 marcadores publicados |
| Exposición – San Cristóbal | [Mapa](https://www.google.com/maps/d/viewer?mid=1jQZbnYwahIOQSBb4FLsGUJHqRh-g41I) | 168 marcadores publicados |
| Alimentadora Los Cristales – La Estanzuela | [Mapa](https://www.google.com/maps/d/viewer?mid=1C3DKzjYUgt2IWGbt8V1zRymZQhh3Vb4) | 50 marcadores publicados |
| Félix U. Gómez – Carretera Nacional – La Estanzuela | [Mapa](https://www.google.com/maps/d/viewer?mid=19agPE-_QOH380jlCWjrioqlnffCHmNc) | 42 marcadores publicados |
| García – Monterrey – Guadalupe | [Mapa](https://www.google.com/maps/d/viewer?mid=1lKh6m1HsGuhjFalhIou2eHPmhWp_-aw) | 39 marcadores publicados |
| Hospital Metropolitano – Anillo Eléctrico (Directo) | [Mapa](https://www.google.com/maps/d/viewer?mid=1-qdasexvl-Xp3d6l5L4YZS79kHcsrfA) | 34 marcadores publicados |
| Hospital Metropolitano – Anillo Eléctrico (U. Laboral) | [Mapa](https://www.google.com/maps/d/viewer?mid=1NoEk1lfGg5cbrcQ1MPw7ofuCeuaXDfU) | 51 marcadores publicados |
| Hospital Metropolitano – Casa Blanca | [Mapa](https://www.google.com/maps/d/viewer?mid=1P1nUsBD-N1xRbIt2r1758KyVEiqNNxY) | 47 marcadores publicados |
| Hospital Metropolitano – Diego Díaz de Berlanga | [Mapa](https://www.google.com/maps/d/viewer?mid=1PcQc3zS8KRoVprlEVv6vIkhYJoNuEcs) | 59 marcadores publicados |
| Hospital Metropolitano – Rómulo Garza | [Mapa](https://www.google.com/maps/d/viewer?mid=1HafEQ8lkxxdfwmlms8ipsyOaAaYAUgI) | 67 marcadores publicados |
| Mitras – Villas de San Francisco | [Mapa](https://www.google.com/maps/d/viewer?mid=1bPhuGxL9wPGVy2ogTfYbVKKOQkvmQAo) | 114 marcadores publicados |
| Sendero – Casco – Pedregal | [Mapa](https://www.google.com/maps/d/viewer?mid=1Crezt6oW2plXA7pr_SBStbxOLW4Pk_k) | 48 marcadores publicados |
| Sendero – Fomerrey 9 | [Mapa](https://www.google.com/maps/d/viewer?mid=16TaHWoT-tFlQ158bsHCaBtiBdCF8tYc) | 39 marcadores publicados |
| Sendero – Metroplex | [Mapa](https://www.google.com/maps/d/viewer?mid=1AQHcEtIvN8D59ViI14gwXnpc3e2UVCM) | 52 marcadores publicados |
| Sendero – Miravista | [Mapa](https://www.google.com/maps/d/viewer?mid=1Nm-PFuuB0cTfEj5WEXRWhhc63aUvutI) | 44 marcadores publicados |
| Sendero – Monterreal | [Mapa](https://www.google.com/maps/d/viewer?mid=1I8Eux8bKoijRn7iphuX25mI95k7W1gE) | 30 marcadores publicados |
| Sendero – San Nicolás – Apodaca | [Mapa](https://www.google.com/maps/d/viewer?mid=1r8EoXv22nAO913eOWJI1pfTPOckM8M0) | 39 marcadores publicados |
| Universidad – Arboledas San Jorge – Hospital Metropolitano | [Mapa](https://www.google.com/maps/d/viewer?mid=15daNDj7MWmmRINrptcbvYwZ3w3VlGzY) | 46 marcadores publicados |
| Universidad – Las Puentes | [Mapa](https://www.google.com/maps/d/viewer?mid=1RSTDaNdd-mHq-rf2KFNeQ1oedvqVKQY) | 31 marcadores publicados |
| Universidad – Santo Domingo | [Mapa](https://www.google.com/maps/d/viewer?mid=10NE6Cuzfg1vL3ZFDez4I-yyrLyj0NOw) | 35 marcadores publicados |
| Universidad – Emiliano Zapata – Cumbres | [Mapa](https://www.google.com/maps/d/viewer?mid=1U7wqHEcBXBZwwzVEbIzwRPU8Oq8GesE) | 49 marcadores publicados |

## Límites

Se ha ampliado la cobertura geográfica verificable. Los sentidos y el orden operativo de los buses siguen sin validación de operador; se infieren por proyección sobre el trazo publicado y se muestra esa condición. El motor explora ambos sentidos geométricos como hipótesis experimental. Los mapas no aportan fecha de actualización ni garantizan servicio hoy. La consulta del 16 de octubre no se usa como fecha de puesta en operación.

Las caminatas son conectores aproximados; no prueban banquetas ni cruces peatonales. Los tiempos, frecuencias y aforo son simulados. No hay GTFS de horarios ni GPS de unidades, y no se pueden garantizar todas las combinaciones de todos los operadores. Los servicios todavía sin paradas/geometría suficiente y las líneas 4/6 en construcción quedan excluidos. El mapa de GMG se mantiene con sus dos LineStrings separados y los marcadores se asignan al trazo más cercano.

Sin internet solo se admiten puntos oficiales incluidos en el modelo. Con internet se pueden consultar direcciones y lugares reales; que un lugar se encuentre no implica que haya transporte documentado dentro del límite de caminata.
