# Viajes cotidianos: decisiones de producto

RegioMóvil ayuda a elegir una conexión de transporte y salir con menos dudas. La siguiente mejora se concentra en encontrar un destino, comparar pocas opciones y recuperar un viaje habitual, sin convertir la aplicación en un navegador de propósito general.

## Incluir

- **Lugares como origen y destino.** Aprovechar la búsqueda por nombre ya existente para restaurantes, museos, hoteles, escuelas y otros lugares públicos de la zona metropolitana. La consulta se envía al buscar expresamente; no necesita descargar una base de todos los establecimientos. Conservar también la búsqueda por texto y la lista de estaciones y paradas.
- **Etiquetas para viajes habituales.** Casa, trabajo, escuela o un nombre elegido ayudan a identificar un trayecto. La etiqueta pertenece al viaje guardado y evita buscar el mismo destino de nuevo; no requiere un mapa más pesado ni inventar un punto de interés público.
- **Hasta tres opciones.** Ordenarlas por la prioridad elegida y destacar tiempo estimado y transbordos. Mostrar las opciones distintas que realmente encuentre el motor; si solo existe una conexión documentada, no completar tres tarjetas con duplicados o recorridos fabricados. Son alternativas del modelo experimental, no una garantía de las tres mejores rutas de toda la ciudad.
- **Un mapa en el detalle.** Dibujar cada tramo de autobús y Metro con su geometría disponible, y las conexiones a pie con línea punteada. El origen A y el destino B mantienen la dirección del recorrido. El fondo local de Monterrey se conserva donde existe; fuera de esa extensión el área queda vacía y se indica «Mapa base parcial». No dibujar una cuadrícula como si fueran calles conocidas.
- **Paquete de viaje sin conexión, por decisión del usuario.** Guardar las alternativas encontradas, sus tramos y geometrías junto con la etiqueta y fecha del cálculo. Abrir esas opciones conservadas sin volver a consultar lugares ni pedir GPS; permitir eliminar cada viaje y sus alternativas. Indicar que se consulta una copia guardada, con tiempos y afluencia simulados, y ofrecer actualizar cuando regrese la conexión.

Guardar un viaje con lugares o ubicación conserva coordenadas en el dispositivo. Debe explicarse en el propio control de guardado y ocurrir después de esa acción explícita. Las ubicaciones de una búsqueda no se guardan automáticamente. Sin conexión se pueden recuperar esos viajes; crear consultas nuevas sigue limitado a estaciones y paradas publicadas del grafo local, sin prometer búsqueda mundial ni geocodificación offline.

## Simplificar la interfaz

El flujo principal es **origen y destino → opciones → detalle → guardar**. Mantener visibles los viajes habituales cerca del planificador permite repetirlos con pocos toques. Las tarjetas de opciones necesitan tiempo, modos y transbordos; las fuentes, restricciones y supuestos caben en el detalle o en un desplegable de información. El mapa se carga al consultar el recorrido, para que no compita con la decisión principal ni se repita en cada pantalla.

Usar fondos claros limpios, verdes más saturados y un color de acento para la acción principal. Reservar las superficies coloreadas para la selección, los modos y la información que necesita atención. La menor afluencia debe usar el mismo color en la barra y en su leyenda. Conservar rótulos breves, áreas táctiles amplias y navegación inferior de una sola línea.

## Descartar por ahora

- Un clon completo de Google Maps: navegación para automóvil, catálogo exhaustivo de negocios, reseñas y mapas de gran tamaño distraen del objetivo de transporte y requieren operación adicional.
- Un mapa permanente en el inicio o en cada tarjeta de ruta. El resumen sirve para comparar; el mapa sirve para entender una opción elegida.
- Descargar indiscriminadamente mapas, establecimientos o todas las combinaciones de viaje. Los paquetes de viajes elegidos resuelven el caso cotidiano con menor consumo y control de borrado.
- Presentar todos los servicios del catálogo como trayectos calculables. Solo los recorridos con geometría y puntos publicados participan en el experimento. Los sentidos y el orden de autobús continúan inferidos y deben confirmarse con el operador; las rutas sin cobertura y las obras quedan fuera.

## Siguientes iteraciones: caminar, bicicleta y monopatín

Las caminatas actuales son conexiones estimadas por distancia, no recomendaciones verificadas para peatones. Una futura recomendación modal debe comparar tiempo y esfuerzo, continuidad del recorrido, cruces y banquetas, ciclovías, pendientes, barreras, accesibilidad y normativa local. Para bicicleta y monopatín también hacen falta restricciones por vía y conexiones seguras hasta la parada o destino.

Incorporar primero corredores con evidencia suficiente y permitir elegir o excluir cada modo. No etiquetar un segmento como seguro o accesible solo porque sea corto, ni reutilizar el trazo de un autobús como ruta de bicicleta. Mantener separadas la geometría publicada de transporte, la conexión a pie estimada y una recomendación modal verificada.

## Comprobaciones de esta iteración

El motor conserva hasta tres alternativas distintas y las ordena por el costo de la prioridad elegida, sin las penalizaciones utilizadas para descubrir alternativas. La búsqueda usa costos optimistas del grafo inverso para orientar su presupuesto acotado hacia el destino. Las pruebas cubren la combinación autobús–caminata–Metro, los segmentos separados, los límites de cobertura y caminata, las tres alternativas cuando existen, y la conservación de geometría, color y encuadre por modo en el mapa.


## Verificación de entrega

El 15 de octubre de 2026 (America/Monterrey) pasaron TypeScript, build de producción y las **105 pruebas** del proyecto. Se comprobaron 15 vistas de Inicio, Planear y Guardados entre 320 y 1440 px sin desbordamiento horizontal ni errores JavaScript. En navegador móvil se guardaron dos alternativas distintas de autobús, conexión a pie y Metro hacia un lugar de prueba; tras una recarga completa sin internet, se abrió su mapa, se eliminó una alternativa y luego el paquete restante. La búsqueda de lugares de esa prueba se controló con una respuesta de prueba; el contrato del proxy y sus límites se verificaron por separado en la suite.

La precarga inicial ocupa 606,675 bytes (592.5 KiB), dentro del presupuesto de 600 KiB. Los módulos de planificación y guardados permanecen diferidos y se conservan al abrirlos. El APK debug actualizado ocupa 4,578,897 bytes; sus assets coinciden con el bundle y la firma v2 se verificó. Se conservó la configuración de desarrollo existente, con API en `http://localhost:4173` mediante el procedimiento local descrito en [Android](android.md). No se desplegó una API pública ni se hizo una prueba en un teléfono físico durante esta iteración.
