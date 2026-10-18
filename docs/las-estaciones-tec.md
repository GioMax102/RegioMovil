# Colonia Las Estaciones → Tec de Monterrey

Verificación: 17 de octubre de 2026. Red experimental existente: 54 servicios, 3,417 registros de puntos. No se añadieron rutas ni paradas para hacer pasar este caso y se conserva el máximo de 1,200 m de caminata total.

## Qué fallaba

La consulta real al servidor `/api/places?q=Colonia%20Las%20Estaciones` devolvía una lista vacía, mientras `Las Estaciones` sí devolvía el área residencial `way/665361279` de OpenStreetMap. Añadir solamente «Nuevo León» no solucionaba ese prefijo.

Además, `Tec de Monterrey` devolvía un local homónimo de OpenStreetMap (`way/668717880`, Avenida Revolución 2703), a aproximadamente 1.3 km al este del campus. No había paradas del grafo dentro del alcance de ese destino erróneo. El campus correcto aparece en OpenStreetMap como `relation/21104322`, nombre «Tecnológico de Monterrey» y `alt_name=Campus Monterrey`.

Se incorporaron referencias exactas con nombres, coordenadas y fuentes, para que ambas búsquedas devuelvan el lugar público correcto incluso cuando el proveedor externo esté ocupado. La coincidencia conserva «Monterrey» cuando forma parte del nombre; las consultas con otro campus, sector o municipio no se sustituyen por estas referencias. La consulta de otros lugares continúa usando el buscador geográfico. Su único reintento permite retirar «colonia», «col.» o «fraccionamiento» sin perder número, sector ni municipio.

## Lugares y precisión

| Lugar | Coordenadas del punto publicado | Identificación y fuente |
| --- | --- | --- |
| Colonia Las Estaciones, Monterrey, zona Lincoln / No Reelección | 25.7661587, -100.4008005 | [OSM way 665361279](https://www.openstreetmap.org/way/665361279), área `landuse=residential`, nombre Las Estaciones. [Congreso de Nuevo León, Decreto 194](https://hcnl.gob.mx/trabajo_legislativo/leyes/pdf/Dec.%20194%20Valores%20mONTERREY.pdf), página 95 del PDF, reconoce Colonia Las Estaciones, región 88, folio 8813. |
| Tec de Monterrey · Campus Monterrey | 25.6507267, -100.289319 | [OSM relation 21104322](https://www.openstreetmap.org/relation/21104322), `amenity=university`, nombre y alias Campus Monterrey. El [sitio oficial del campus](https://tec.mx/es/monterrey) publica Eugenio Garza Sada 2501, Monterrey, Nuevo León, y un mapa centrado en 25.65142, -100.290328 dentro de la misma zona. |

Las coordenadas son los centroides que publica el buscador para esas áreas, no accesos peatonales verificados. En una colonia o campus grande, el usuario puede precisar su punto en el mapa. El domicilio oficial del Tec reemplaza la calle periférica que el geocodificador asignaba al centroide. No se utiliza la coordenada genérica del centro de Monterrey que aparece en algunos directorios de códigos postales.

## Conexiones que devuelve el modelo

Con los puntos anteriores, prioridad «más rápido» y fecha de prueba fija, se obtienen tres secuencias diferentes de servicio:

1. Transmetro San Bernabé – No Reelección → Metro L1 San Bernabé a Félix U. Gómez → Transmetro Félix U. Gómez – Carretera Nacional – La Estanzuela, bajando en Garza Sada / Fernando García Roel. Caminata estimada total: 655 m.
2. Transmetro San Bernabé – No Reelección vía Mármol → la misma conexión L1 y Transmetro al Tec. Caminata estimada total: 655 m.
3. Transmetro No Reelección → L1 → L3 hasta Santa Lucía → RegioRuta G, bajando en Eugenio Garza Sada – Tecnológico de Monterrey. Caminata estimada total: 590 m.

Los trazos y marcadores Transmetro proceden de los [mapas publicados desde Metrorrey](https://www.metrorrey.mx/): [No Reelección](https://www.google.com/maps/d/viewer?mid=158b0mrgZ83t425h9sdO4BrngkGE2jWY), [vía Mármol](https://www.google.com/maps/d/viewer?mid=1PMsEcdqKxf17KiDnaf4R2B7VDsHKjbQ) y [Félix U. Gómez – La Estanzuela](https://www.google.com/maps/d/viewer?mid=19agPE-_QOH380jlCWjrioqlnffCHmNc). RegioRuta G procede del [portal oficial de Monterrey](https://www.monterrey.gob.mx/regio-ruta/). Los paquetes y su procedencia ya estaban integrados antes de esta corrección; véase [cobertura de autobuses](cobertura-autobuses-20261016.md).

La regresión de `tests/mobility.test.mjs` resuelve los mismos textos mediante las referencias, calcula contra la red real del repositorio, comprueba ambas familias de conexión y verifica que los extremos no se sustituyen por estaciones y que la caminata y expansiones siguen acotadas. `tests/places.test.mjs` comprueba alias, domicilio oficial y rechazo de sustituciones de campus/municipio. No se requieren llamadas externas durante las pruebas.

Los minutos, esperas y afluencia continúan simulados. Los sentidos y el orden de autobuses siguen inferidos del trazo publicado y requieren validación con los operadores; estas alternativas no son una garantía de operación actual. La exploración tiene un presupuesto de 24,000 expansiones y ocho alternativas como máximo, por lo que no afirma enumerar todos los itinerarios existentes.
