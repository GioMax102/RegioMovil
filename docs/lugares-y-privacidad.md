# Búsqueda de lugares y privacidad

La rama experimental combina el grafo local de transporte con una búsqueda **explícita por nombre de lugar, local, calle o dirección de la ZMM**. Al pulsar Buscar o Enter, el texto se envía al backend y al proveedor configurado. Las sugerencias locales de estaciones y paradas pueden filtrarse al escribir; el proveedor externo no recibe autocompletado, búsquedas periódicas ni geocodificación inversa. El usuario puede elegir siempre una parada del catálogo sin consultar un proveedor.

La ubicación del dispositivo se obtiene sólo al pulsar su control y el navegador calcula el trayecto localmente. No se guarda automáticamente. Al confirmar «Guardar sin internet», la persona puede conservar localmente los extremos del viaje, incluidas coordenadas de lugares o GPS, y hasta ocho alternativas con geometría. El formulario lo explica antes de guardar; esos datos no se envían al servidor. Cada alternativa y cada paquete se pueden eliminar desde Guardados. El buscador de lugares no recibe el GPS. El servidor tampoco guarda coordenadas, recorridos o historial de consultas en SQLite ni los registra en consola. Si otro cliente usa la API de planificación con coordenadas, éstas sólo viven durante la solicitud y su respuesta es `Cache-Control: no-store`. El backend no incorpora un registro de accesos; cualquier proxy de producción debe omitir las consultas personales y cuerpos de estos endpoints de sus registros.

## Proveedor y límites del experimento

El proveedor predeterminado es Nominatim público de OpenStreetMap, elegido para este experimento acotado de movilidad. Su [política oficial de uso](https://operations.osmfoundation.org/policies/nominatim/) exige búsquedas iniciadas por usuarios, identificación de la aplicación, atribución, caché y un máximo agregado de **una solicitud por segundo**. Prohíbe el autocompletado y las consultas sistemáticas. No debe convertirse en un servicio genérico de geocodificación; el piloto sólo consulta lugares para preparar trayectos en la ZMM. El servicio público tiene capacidad limitada y no garantiza disponibilidad. Para una aplicación pública con tráfico significativo se necesita proveedor propio o contratado y revisar sus términos.

El proxy usa HTTPS, `User-Agent` identificable, México como país y la caja `[-100.9, 25.35, -99.8, 26.1]`. Acepta nombres de locales y direcciones completas con número. Devuelve como máximo seis resultados, con su dirección y municipio cuando el proveedor los aporta, y vuelve a comprobar coordenadas y contenido. Una respuesta vacía puede provocar un único segundo intento añadiendo «Nuevo León, México», dentro de la misma cuota global de una solicitud por segundo y del plazo total de seis segundos. No hay una segunda consulta si el texto ya incluía Nuevo León, si el proveedor falla o si vence ese plazo. Respuestas superiores a 128 KiB se rechazan. No admite URL de proveedor enviada por el cliente, redirecciones, correo electrónico ni pares de coordenadas en la búsqueda de texto. No envíes información personal o confidencial en la dirección buscada.

Un pequeño índice de referencias públicas verificadas complementa la cobertura del proveedor. Resuelve directamente «Punto Valle», sus alias y «Río Missouri 555», además de «Colonia Las Estaciones» y «Tec de Monterrey» para el Campus Monterrey verificado; no sustituye un directorio general ni transforma resultados parciales en una ubicación supuesta. La [fuente oficial de Punto Valle](https://puntovalle.com/concierge) confirma Río Missouri 555, Del Valle, 66220, San Pedro Garza García. La coordenada `25.6590567, -100.3545702` procede del [objeto OpenStreetMap 682039730](https://www.openstreetmap.org/way/682039730), consultado el 16 de octubre de 2026. Es la referencia del recinto, no un acceso peatonal confirmado. Estas coincidencias exactas se devuelven sin consumir cuota externa e incluyen las fuentes en la respuesta. La disponibilidad de una dirección en el buscador no confirma que tenga transporte cercano: el cálculo informa por separado de la cobertura de la red.

La cuota y la caché son globales **al proceso del backend**, compartidas por sus instancias de aplicación y usuarios. No se acumula una cola: otra consulta sin caché recibe `429` con `Retry-After`. Las respuestas `429` del proveedor activan una pausa de un minuto. La caché LRU sólo conserva hasta 200 textos de lugares y sus resultados durante una hora en memoria; no contiene GPS del dispositivo ni se escribe en disco. Una respuesta externa fallida nunca se guarda. Las respuestas HTTP de búsqueda son `no-store`, para evitar que otras capas guarden los términos.

Este backend se despliega como **un solo proceso** con el proveedor público. Varias réplicas necesitan una cuota y caché compartidas en un proxy único o un proveedor con un límite adecuado antes de activarse: las cuotas de cada proceso no satisfacen por sí solas el límite agregado de Nominatim.

Puedes cambiar el servicio sin actualizar Android configurando en el servidor:

```dotenv
PLACES_PROVIDER_URL=https://nominatim.openstreetmap.org/search
PLACES_USER_AGENT=RegioMovil/1.0 (https://github.com/GioMax102/RegioMovil)
```

La URL debe apuntar a una API HTTPS compatible con `search` de Nominatim, sin credenciales, parámetros ni fragmento. Las credenciales de otro servicio necesitan un adaptador propio; nunca se incorporan al cliente. Las respuestas incluyen `© OpenStreetMap contributors`, enlace a [atribución y licencia ODbL](https://www.openstreetmap.org/copyright). La interfaz conserva esa atribución junto a sus resultados.

## API experimental

`GET /api/places?q=Macroplaza` acepta un único texto de 3 a 120 caracteres. También admite una dirección como `Río Missouri 555, Del Valle` o el nombre de una calle. Devuelve `{places: [{id, name, address, displayName, lat, lng, kind: "place", resultType: "address" | "street" | "place"}], provider, attribution: {text, url, license}, cached}`. Las referencias verificadas agregan `source`, `coordinateSource` y `verifiedAt`. `address` usa los datos publicados y no inventa números ni accesos. Un texto no válido da `400`; saturación da `429`; fallo externo da `502` y plazo agotado da `504`. El cliente sólo debe invocarlo al confirmar una búsqueda. La cobertura de OpenStreetMap puede ser incompleta para algunos comercios; una respuesta vacía debe explicarse como ausencia de resultados del proveedor y permitir corregir dirección o colonia.

`GET /api/mobility/network` devuelve el artefacto público de red para cálculo local; es lo único de estos endpoints con caché pública de una hora. Si no está construido, responde `503 MOBILITY_UNAVAILABLE`, manteniendo disponible el planificador original de Metro.

`POST /api/mobility/plan` acepta JSON de hasta 4096 bytes:

```json
{"from":{"id":"padre-mier"},"to":{"kind":"place","name":"Macroplaza","lat":25.669,"lng":-100.31},"preference":"fastest","scenario":"normal","offline":false}
```

También acepta `kind: "location"` para una ubicación autorizada del dispositivo, aunque el cliente principal la calcula localmente. `offline: true` sólo admite extremos identificados por ID del catálogo público del artefacto. Los lugares arbitrarios no se guardan como paradas oficiales. Preferencias: `fastest`, `comfortable`, `accessible`; escenarios: `normal`, `peak`, `rain`, `disruption`. La respuesta y los errores usan `no-store`. La simulación no confirma operación actual, accesibilidad, sentido de embarque ni infraestructura peatonal segura.

## Consulta sin conexión

Los paquetes guardados incluyen etiqueta (Casa, Trabajo, Escuela o personalizada), fecha de cálculo, prioridad y las alternativas distintas encontradas, hasta ocho. No requieren búsqueda de lugares, GPS, descarga de red ni un cálculo nuevo para abrir el mapa. Una búsqueda nueva sin internet sigue limitada a paradas y estaciones oficiales. Recalcular un lugar requiere recuperar la conexión. Los guardados anteriores basados en IDs se conservan y pueden volver a planearse para obtener un mapa completo.

## Calles visibles en el mapa

Con conexión, el selector de puntos solicita únicamente los mosaicos visibles a OpenStreetMap, con la caché HTTP del navegador y atribución. Ese proveedor puede conocer aproximadamente la zona explorada; no recibe el texto buscado ni un endpoint de GPS mediante esta carga. No se ofrecen descargas ni paquetes offline de esos mosaicos. Sin conexión se usa el mapa vectorial local y sólo se confirman paradas oficiales. [Detalles de la selección y sus límites](mapa-y-planear-20261017.md).
