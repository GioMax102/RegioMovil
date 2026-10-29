# Modelo experimental de movilidad

> Registro histórico: conserva el alcance y las cifras de su fecha. Para el estado vigente, consultar el [índice documental](README.md), la [especificación técnica](especificacion-tecnica.md) y la [hoja de ruta](hoja-de-ruta.md).

Esta rama permite comparar recorridos que combinan Metro y los autobuses con geometría oficial publicada. Es un grafo geográfico de referencia con búsqueda limitada, no un sistema conectado a despachos, horarios, GPS de unidades o conteos de pasajeros. La geometría de autobús procede de los mapas publicados; sus sentidos y secuencia operativa todavía no están verificados.

## Cobertura del artefacto

`scripts/prepare-mobility.mjs` genera copias idénticas en `data/mobility-network.json` y `public/mobility-network.json`. Usa `data/network.json`, el catálogo canónico y 51 paquetes de recorridos de autobús. Las importaciones manuales de fuentes oficiales están en `scripts/import-ima-coverage.py` y `scripts/import-metrorrey-maps.py`; el build ordinario no consulta proveedores. El artefacto se descarga bajo demanda y queda fuera del precache inicial.

| Dato | Cobertura actual (16 de octubre de 2026) |
| --- | --- |
| Metro | L1, L2 y L3, con 38 estaciones únicas |
| RegioRuta | A–G: siete rutas |
| Urbanas IMA | Trece recorridos: 105, 107, tres ramales 130, 201, dos ramales 214, dos ramales 223, dos ramales 224 y 234 |
| Transmetro | Treinta recorridos con geometría y marcadores publicados por Metrorrey; incluye tres San Bernabé, San Agustín, Chipinque y Cabezada |
| GMG / antes Ecovía | Corredor Lincoln–Ruiz Cortines: 39 estaciones publicadas y dos trazos conservados por separado |
| Total | 54 líneas/recorridos; 3,417 puntos contando identificadores propios de cada ruta |
| Marcadores excluidos | 1,054 con nota solo «PROPUESTA» sin «EXISTE»; 3 a más de 160 m del trazo |
| Segmentos independientes | 56; se conservan los segmentos separados de RegioRuta E y GMG |
| Artefacto | 2059.3 KiB de JSON; 267.0 KiB con gzip |

Los identificadores del autobús llevan un namespace de ruta para evitar confundir códigos o números repetidos. `official: true` significa que el punto procede de una publicación oficial; no certifica una parada construida, un acceso funcional ni una autorización de embarque actual. Los marcadores retenidos tienen `infrastructureStatus: 'unknown'`. En mapas Transmetro con paradas numeradas se conserva «Parada 1», etc., sin inventar direcciones.

La ampliación resuelve la falta de cobertura de San Pedro: los KML oficiales de Ruta 130 Alameda y Juárez publican un parabús existente en Gómez Morín y Río Missouri, a unos 164 m geodésicos de Punto Valle. Esa distancia es una referencia aproximada, no una caminata validada. La búsqueda debe combinar servicios documentados y los accesos dentro del límite configurado.

Las rutas que aún carecen de geometría o paradas no generan aristas y se registran en `coverage.excludedRoutes`. El mapa oficial Alimentadora Gómez Morín–San Agustín contiene trazo pero cero marcadores de parada: se excluye del cálculo, sin transformar sus vértices en paradas ficticias. L4 y L6 siguen como construcción y fuera del grafo. Que un servicio esté en el catálogo no garantiza que el modelo pueda calcular su recorrido.

Las fuentes, los 32 enlaces oficiales consultados y los límites están en [cobertura-autobuses-20261016.md](cobertura-autobuses-20261016.md), `data/metrorrey-map-sources.json` y `sources` del artefacto. Los mapas de Metrorrey no publican fecha de actualización: la consulta del 16 de octubre de 2026 no acredita una inauguración ni operación actual. Los datos históricos SETME conservan su corte de septiembre de 2025.

## Cómo se construye el grafo

Para Metro se conserva la secuencia oficial. La geometría une coordenadas de estaciones mediante segmentos rectos: representa conexiones, no un levantamiento exacto de las vías. Se conserva la continuidad L2–L3 en Zaragoza sin contar un transbordo de tren.

En autobuses, cada marcador se proyecta sobre el segmento publicado más cercano. Se ordena por su posición fraccional sobre ese segmento y se conectan posiciones consecutivas. Las geometrías de los pasos devueltos conservan los vértices publicados entre las proyecciones. No se concatenan segmentos discontinuos ni se crea un puente entre los dos trazos de RegioRuta E.

Este orden espacial es una hipótesis para experimentar. La red conserva `stopOrderVerified: false` y `directionVerified: false` en autobuses. Se exploran ambos sentidos geométricos, sin afirmar que exista servicio en ambos. Los bucles, avenidas con sentidos opuestos y puntos cercanos a dos partes del mismo trazo pueden producir una secuencia que requiera revisión. Antes de orientar viajes de producción se necesitan recorridos por sentido y secuencias de embarque validadas por el operador.

Se añaden conexiones entre paradas de rutas distintas cuando la caminata estimada no supera 350 m. Una cuadrícula espacial evita comparar todos los pares de puntos. La distancia a pie es la distancia geodésica multiplicada por 1.25; su geometría es un conector recto identificado como estimado. No describe banquetas, cruces, barreras, puentes ni entradas reales. Una caminata no puede encadenarse inmediatamente con otra para inventar un corredor peatonal de alcance ilimitado.

## Búsqueda, alternativas y límites

`server/mobility.mjs` funciona en Node y navegador sin acceso a archivos ni dependencias externas. La red se recibe como argumento. El grafo se conserva en una `WeakMap` para reutilizarlo mientras se mantenga la misma referencia al objeto; un worker debe recibir la red una sola vez y conservarla.

Se utiliza A* con un montículo mínimo y costes restantes optimistas calculados sobre el grafo inverso. El estado incluye parada, última línea, caminata previa, presupuesto de caminata, modos utilizados y número de cambios, de modo que cambiar de línea tenga coste explícito. Se conserva la frontera de Pareto de coste y caminata: una llegada algo más costosa con menos metros a pie puede ser la única que permita completar el último enlace dentro del presupuesto. El presupuesto global de una consulta es de 24,000 expansiones, incluso cuando se buscan alternativas. Se admiten hasta cuatro transbordos y 1,200 m de caminata total, sumando accesos, salidas y conexiones. Los accesos exploran hasta 32 puntos con diversidad de servicios; elegir una estación como origen también permite alcanzar una parada cercana de autobús.

Las alternativas comienzan con sondeos independientes de la red completa, Metro, autobuses y la combinación de ambos. Se omiten los sondeos cuya composición ya está representada. La búsqueda combinada evita volver a una misma parada para agregar un modo de transporte artificialmente. También se explora llegar mediante cada servicio publicado cerca del destino: esto permite comparar, por ejemplo, Chipinque, San Agustín y Ruta 130 al buscar Punto Valle. Después se penalizan aristas utilizadas y se prueban exclusiones de servicios para descubrir otros corredores. Se deduplican secuencias de servicios, de modo que pequeños cambios en la parada de embarque no ocupen todas las tarjetas. Su puntuación conserva el coste original exacto del objetivo de búsqueda, sin penalizaciones de diversificación ni redondeo de los minutos mostrados. Se devuelven hasta ocho opciones relevantes dentro del presupuesto, con hasta dieciséis sondeos acotados. No se garantiza enumerar todos los caminos ni calcular los ocho caminos más cortos exactos. `diagnostics.truncated` informa cuando un sondeo agota su presupuesto. No encontrar conexión devuelve una lista vacía y un motivo en `diagnostics.reason`: falta de paradas cercanas, discontinuidad documentada o límite de búsqueda.

`transport: 'all'` es el valor predeterminado. `transport: 'metro'` permite consultar la misma dirección o lugar limitando los servicios utilizados a Metro; el filtro nunca convierte los extremos en estaciones ni reemplaza sus coordenadas. Cada alternativa identifica `modes` y `serviceIds`. La respuesta incluye `coverage` con redes, servicios disponibles, límites y `exhaustive: false`: una coincidencia de lugar no implica que todas las rutas metropolitanas estén documentadas.

Ningún sondeo puede volver a una parada ya visitada ni al origen, incluso cuando el primer paso es una caminata a otra parada. Al alcanzar el destino seleccionado se deja de expandir ese camino. Esto evita añadir viajes de ida y vuelta en autobús para satisfacer una composición o un servicio de llegada. Si dos puntos publicados coinciden geográficamente, el enlace de cero metros conserva los identificadores del origen y destino elegidos.

La preferencia rápida compara tiempo y cambios. La cómoda añade una penalización por ocupación sintética; la accesible penaliza más los cambios y las caminatas, pero conserva `accessibility: 'unknown'`. Ninguna preferencia confirma accesibilidad operativa.

Los tiempos usan velocidades ilustrativas de 32 km/h en Metro y 18 km/h en autobús, tiempos de detención y esperas fijas, modificados por el escenario. El aforo es una función determinista del identificador y escenario, con una etiqueta explícita de simulación. El intervalo mostrado es ilustrativo; no tiene calibración ni cobertura estadística sobre viajes reales. Este motor no utiliza como precisión validada el modelo ridge sintético anterior.

## Endpoints y modo sin conexión

```js
import { planMobility } from './server/mobility.mjs';

const result = planMobility(network, {
  from: { id: 'regioruta-a:regioruta-a-a33' },
  to: { id: 'metro:universidad' },
  preference: 'fastest',
  scenario: 'normal',
  offline: true,
  date: '2026-10-15T12:00:00.000Z',
});
```

Sin conexión, ambos extremos deben ser identificadores de paradas oficiales publicadas presentes en el artefacto (`official: true`). Los puntos comunitarios documentados, cuando están incluidos, pueden participar en el cálculo y elegirse con conexión, pero no son extremos admitidos sin conexión. Se admiten también los identificadores históricos de Metro, por ejemplo `universidad`. Se rechazan ubicaciones GPS, coordenadas y lugares, aunque sus coordenadas estuvieran guardadas antes. El cliente debe haber descargado la red para poder calcular localmente.

Con conexión se admiten también `{kind: 'location' | 'place', lat, lng, name}`. `kind: 'coordinate'` y `label` son alias admitidos por la API. Las coordenadas deben ser números finitos y encontrarse dentro de la envolvente de la ZMM del artefacto. Además deben existir paradas cercanas y un recorrido documentado dentro del presupuesto de caminata; pertenecer a esa envolvente no garantiza cobertura.

La búsqueda de lugares obtiene sus resultados del servicio en línea documentado en [lugares-y-privacidad.md](lugares-y-privacidad.md). El motor no geocodifica cadenas de texto ni envía coordenadas a un proveedor. La ubicación del usuario se suministra al cálculo solo cuando el cliente tiene autorización del dispositivo para obtenerla.

Cada respuesta contiene origen y destino resueltos, revisión de red, advertencias, alternativas, pasos con geometría, fuentes y diagnóstico de expansiones. Los errores de validación son `RangeError` con `code`: `INVALID_ENDPOINT`, `OFFLINE_STOP_ONLY`, `OUTSIDE_COVERAGE`, `UNKNOWN_STOP`, `INVALID_PREFERENCE`, `INVALID_SCENARIO`, `INVALID_TRANSPORT` o `INVALID_DATE`.

## Verificación reproducible

```sh
node scripts/prepare-catalog.mjs
node scripts/prepare-mobility.mjs
node --test --test-isolation=none tests/mobility.test.mjs
```

Las pruebas verifican la evidencia conservada, exclusiones, namespace de identificadores, cruce RegioRuta A desde Mederos a L2 Universidad, conectores limitados, rechazo de lugares sin conexión, validación de coordenadas, prioridades, coherencia de puntuación y búsqueda, conservación de llegadas con menor caminata, segmentos discontinuos y límite de búsqueda. También comprueban la diversidad Metro/autobús/combinado para los mismos lugares, ocho servicios distintos, el filtro de Metro y la ausencia de ciclos creados únicamente para agregar un autobús.

El benchmark hace nueve consultas: tres repeticiones de Mederos–Universidad, Exposición–Hospital Metropolitano y Talleres–Zaragoza, con red y fecha fijas. Una ejecución con Node 24.19.0 en Intel i7-13620H obtuvo mediana de 128.6 ms y p95 de 145.1 ms. Esto mide el motor en esa computadora, sin red ni renderizado; no establece el rendimiento de un teléfono modesto. La prueba tiene un techo amplio de 1,500 ms para detectar regresiones descontroladas sin confundir variación del equipo con rendimiento de producción. Se requiere medir la interacción y el consumo de memoria en dispositivos Android reales para evaluar el uso cotidiano del planificador experimental.
