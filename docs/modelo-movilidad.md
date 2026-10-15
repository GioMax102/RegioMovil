# Modelo experimental de movilidad

Esta rama permite comparar recorridos que combinan Metro y los autobuses con geometría oficial publicada. Es un grafo geográfico de referencia con búsqueda limitada, no un sistema conectado a despachos, horarios, GPS de unidades o conteos de pasajeros. La geometría de autobús procede de los mapas publicados; sus sentidos y secuencia operativa todavía no están verificados.

## Cobertura del artefacto

`scripts/prepare-mobility.mjs` genera copias idénticas en `data/mobility-network.json` y `public/mobility-network.json`. Usa `data/network.json`, el catálogo canónico y los doce paquetes de geometría existentes. El artefacto registra fuentes, exclusiones y supuestos; se carga cuando se utiliza el experimento y no debe añadirse al precache inicial de la aplicación.

| Dato | Cobertura actual |
| --- | --- |
| Metro | L1, L2 y L3, con 38 estaciones únicas |
| Autobús | RegioRuta A–G; 105 San Martín–Metropolitano; 107 García–Obelisco; 223 Teófilo Salinas–Eloy Cavazos; 223 Teófilo Salinas–Gine; 234 García–Ruiz Cortines–Centro |
| Paradas publicadas incluidas | 1,054, contando identificadores propios de cada ruta |
| Marcadores excluidos | 447 con nota exclusivamente «PROPUESTA» sin «EXISTE», y uno a más de 160 m del trazo publicado |
| Segmentos independientes | 16 entre las 15 líneas y recorridos; RegioRuta E conserva dos segmentos separados |
| Artefacto | 641.0 KiB de JSON; 85.6 KiB con gzip en la verificación local |

Los identificadores del autobús llevan un namespace de ruta para evitar confundir códigos municipales repetidos. `official: true` significa que el punto procede de una publicación oficial: no certifica una parada construida, un acceso funcional ni una autorización de embarque actual. Los marcadores retenidos siguen teniendo `infrastructureStatus: 'unknown'`.

Las rutas sin geometría no generan aristas: se registran individualmente en `coverage.excludedRoutes`, incluido Transmetro y Ecovía/GMG. L4 y L6 se registran en `coverage.excludedRailRoutes` como construcción y no participan en el grafo. Que un servicio esté en el catálogo no significa que el modelo pueda calcular su recorrido.

Las fuentes y fechas de la integración están en [integracion-rutas.md](integracion-rutas.md), [nuevas-rutas-fuentes.md](nuevas-rutas-fuentes.md) y en `sources` de cada artefacto. La instantánea local de mapas se verificó el 15 de octubre de 2026; esa fecha no actualiza por sí misma la vigencia operativa de los servicios.

## Cómo se construye el grafo

Para Metro se conserva la secuencia oficial. La geometría une coordenadas de estaciones mediante segmentos rectos: representa conexiones, no un levantamiento exacto de las vías. Se conserva la continuidad L2–L3 en Zaragoza sin contar un transbordo de tren.

En autobuses, cada marcador se proyecta sobre el segmento publicado más cercano. Se ordena por su posición fraccional sobre ese segmento y se conectan posiciones consecutivas. Las geometrías de los pasos devueltos conservan los vértices publicados entre las proyecciones. No se concatenan segmentos discontinuos ni se crea un puente entre los dos trazos de RegioRuta E.

Este orden espacial es una hipótesis para experimentar. La red conserva `stopOrderVerified: false` y `directionVerified: false` en autobuses. Se exploran ambos sentidos geométricos, sin afirmar que exista servicio en ambos. Los bucles, avenidas con sentidos opuestos y puntos cercanos a dos partes del mismo trazo pueden producir una secuencia que requiera revisión. Antes de orientar viajes de producción se necesitan recorridos por sentido y secuencias de embarque validadas por el operador.

Se añaden conexiones entre paradas de rutas distintas cuando la caminata estimada no supera 350 m. Una cuadrícula espacial evita comparar todos los pares de puntos. La distancia a pie es la distancia geodésica multiplicada por 1.25; su geometría es un conector recto identificado como estimado. No describe banquetas, cruces, barreras, puentes ni entradas reales. Una caminata no puede encadenarse inmediatamente con otra para inventar un corredor peatonal de alcance ilimitado.

## Búsqueda, alternativas y límites

`server/mobility.mjs` funciona en Node y navegador sin acceso a archivos ni dependencias externas. La red se recibe como argumento. El grafo se conserva en una `WeakMap` para reutilizarlo mientras se mantenga la misma referencia al objeto; un worker debe recibir la red una sola vez y conservarla.

Se utiliza Dijkstra con un montículo mínimo. El estado incluye parada, última línea, caminata previa, presupuesto de caminata y número de cambios, de modo que cambiar de línea tenga coste explícito. Se conserva la frontera de Pareto de coste y caminata: una llegada algo más costosa con menos metros a pie puede ser la única que permita completar el último enlace dentro del presupuesto. El presupuesto global de una consulta es de 24,000 expansiones, incluso cuando se buscan alternativas. Se admiten hasta cuatro transbordos y 1,200 m de caminata total, sumando accesos, salidas y conexiones.

Las alternativas se buscan con penalizaciones progresivas a aristas ya usadas; se eliminan duplicados y desvíos excesivos. Su puntuación conserva el coste original exacto del objetivo de búsqueda, sin penalizaciones de diversificación ni redondeo de los minutos mostrados. Se devuelven hasta tres opciones dentro del presupuesto. No se garantiza enumerar todos los caminos ni calcular los tres caminos más cortos exactos. `diagnostics.truncated` informa cuando se agota el límite. No encontrar conexión devuelve una lista vacía y un mensaje: no se dibuja una ruta ficticia hasta otro servicio.

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

Sin conexión, ambos extremos deben ser identificadores de paradas publicadas presentes en el artefacto. Se admiten también los identificadores históricos de Metro, por ejemplo `universidad`. Se rechazan ubicaciones GPS, coordenadas y lugares, aunque sus coordenadas estuvieran guardadas antes. El cliente debe haber descargado la red para poder calcular localmente.

Con conexión se admiten también `{kind: 'location' | 'place', lat, lng, name}`. `kind: 'coordinate'` y `label` son alias admitidos por la API. Las coordenadas deben ser números finitos y encontrarse dentro de la envolvente de la ZMM del artefacto. Además deben existir paradas cercanas y un recorrido documentado dentro del presupuesto de caminata; pertenecer a esa envolvente no garantiza cobertura.

La búsqueda de lugares obtiene sus resultados del servicio en línea documentado en [lugares-y-privacidad.md](lugares-y-privacidad.md). El motor no geocodifica cadenas de texto ni envía coordenadas a un proveedor. La ubicación del usuario se suministra al cálculo solo cuando el cliente tiene autorización del dispositivo para obtenerla.

Cada respuesta contiene origen y destino resueltos, revisión de red, advertencias, alternativas, pasos con geometría y diagnóstico de expansiones. Los errores de validación son `RangeError` con `code`: `INVALID_ENDPOINT`, `OFFLINE_STOP_ONLY`, `OUTSIDE_COVERAGE`, `UNKNOWN_STOP`, `INVALID_PREFERENCE`, `INVALID_SCENARIO` o `INVALID_DATE`.

## Verificación reproducible

```sh
node scripts/prepare-catalog.mjs
node scripts/prepare-mobility.mjs
node --test --test-isolation=none tests/mobility.test.mjs
```

Las nueve pruebas verifican la evidencia conservada, exclusiones, namespace de identificadores, cruce RegioRuta A desde Mederos a L2 Universidad, conectores limitados, rechazo de lugares sin conexión, validación de coordenadas, prioridades, coherencia de puntuación y búsqueda, conservación de llegadas con menor caminata, segmentos discontinuos y límite de búsqueda.

El benchmark hace nueve consultas: tres repeticiones de Mederos–Universidad, Exposición–Hospital Metropolitano y Talleres–Zaragoza, con red y fecha fijas. Una ejecución con Node 24.19.0 en Intel i7-13620H obtuvo mediana de 36.0 ms y p95 de 45.9 ms. Esto mide el motor en esa computadora, sin red ni renderizado; no establece el rendimiento de un teléfono modesto. La prueba tiene un techo amplio de 1,500 ms para detectar regresiones descontroladas sin confundir variación del equipo con rendimiento de producción. Se requiere medir la interacción y el consumo de memoria en dispositivos Android reales antes de habilitar el experimento por defecto.
