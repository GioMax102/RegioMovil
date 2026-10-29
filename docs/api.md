# Referencia de la API

Contrato revisado contra `server/app.mjs`, `server/storage.mjs`, `server/mobility.mjs` y los proveedores de lugares el **29 de octubre de 2026**. La API pertenece al piloto 1.1.0; sus rutas aún no llevan un prefijo de versión. Cambios incompatibles deberán versionarse y probarse antes de una publicación posterior.

Las llegadas, ocupación, condiciones de unidades y tiempos de viaje son simulados. Los reportes son observaciones comunitarias, separadas de esas simulaciones. Un reporte revisado no constituye una inspección física ni un aviso del operador.

## Ejecución y convenciones

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
# En otra terminal:
curl --fail http://127.0.0.1:3001/api/health
```

Node.js 24 o posterior; configuración en [.env.example](../.env.example) y [especificación técnica](especificacion-tecnica.md). `pnpm dev` inicia API en 3001 y Vite en 5173 con proxy `/api`. `pnpm start` carga `.env`; `pnpm dev` y `pnpm dev:api` no la cargan automáticamente. Para desarrollo con variables personalizadas, expórtalas en la terminal.

Salvo la descarga de fotografías, las respuestas son JSON UTF-8. Los errores usan `{"error":{"code":"INVALID_JSON","message":"…"}}`. Por defecto se envía `Cache-Control: no-store`; las excepciones de lectura pública se indican abajo. No existe autenticación de usuarios ni un API HTTP de administración. CORS restringe orígenes de navegador y **no autentica** a una persona o cliente.

| Límite por proceso y dirección IP del socket                    | Valor                          |
| --------------------------------------------------------------- | ------------------------------ |
| Solicitudes a `/api` y `/api/*`                                 | 180 por ventana de 60 segundos |
| Planificación Metro y multimodal, presupuesto compartido        | 20 por ventana de 60 segundos  |
| Nuevos reportes                                                 | 12 por ventana de 60 segundos  |
| Intentos de envío de reportes, incluidos inválidos y reintentos | 120 por ventana de 60 segundos |
| JSON de planificación multimodal                                | 4096 bytes                     |
| JSON de reporte, incluida foto en base64                        | 600000 bytes                   |

`429` incluye `Retry-After`; el limitador general indica 60 segundos y los proveedores pueden indicar otra espera. No se confía en `X-Forwarded-For`: detrás de un proxy las personas pueden compartir el presupuesto de su IP. Las cuotas en memoria no se coordinan entre réplicas ni sobreviven a un reinicio.

`OPTIONS` responde `204` para un origen permitido, anuncia `GET, HEAD, POST, OPTIONS` y permite `Content-Type`. Los endpoints de API implementan los métodos que se enumeran a continuación; `HEAD` se implementa para archivos estáticos, no como sustituto general de `GET` en la API. Método incompatible: `405 METHOD_NOT_ALLOWED`. Ruta desconocida: `404 NOT_FOUND`. Origen ajeno a la configuración: `403 ORIGIN_NOT_ALLOWED`.

## Estado, catálogo y simulación

| Método y ruta           | Entrada                                                                     | Respuesta y caché                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`       | Ninguna                                                                     | `{status:"ok", service:"RegioMovil", version:"1.1.0", mode:"simulation", generatedAt}`. Indica respuesta del proceso; no comprueba proveedor externo, espacio libre ni restauración de SQLite. |
| `GET /api/network`      | Ninguna                                                                     | Red base: `sources`, `lines`, `stations`, `places`, `throughServices`. Caché pública 86400 s; `ETag` y `If-None-Match` permiten `304`.                                                         |
| `GET /api/services`     | `q`, `network`, `status`, opcionales                                        | Catálogo `{version, verifiedAt, networks, sources, routes, total}` y revisiones de geometría cuando están disponibles. Caché pública 3600 s.                                                   |
| `GET /api/services/:id` | ID canónico del servicio                                                    | Objeto de servicio; caché pública 3600 s. `404 SERVICE_NOT_FOUND`; ID mal codificado o inválido: `400 INVALID_SERVICE_ID`.                                                                     |
| `GET /api/board`        | `station`, predeterminada `padre-mier`; `scenario`, predeterminado `normal` | Panel simulado `{stationId, generatedAt, mode, scenario, arrivals, forecast, advice, alerts}`.                                                                                                 |
| `GET /api/plan`         | `from`, `to`, obligatorios; `preference`, `scenario`, opcionales            | Hasta tres alternativas de Metro: `{journeys, mode:"simulation", generatedAt, preference}`; puede incluir un mensaje y lista vacía.                                                            |
| `GET /api/model`        | Ninguna                                                                     | Ficha del modelo, variables, semilla, particiones, métricas y limitaciones. Caché pública 3600 s.                                                                                              |

Las estaciones aceptan ID, nombre o alias normalizado. Estación desconocida: `404 STATION_NOT_FOUND`. `scenario`: `normal|peak|rain|disruption`. `preference`: `fastest|comfortable|accessible`. Un valor inválido produce `400 INVALID_SCENARIO` o `INVALID_PREFERENCE`; omitir extremos en `/api/plan` produce `400 MISSING_STATIONS`.

En `/api/services`, `q` admite hasta 160 caracteres sin controles, ignora acentos y mayúsculas y exige que coincidan todas sus palabras. `network` debe existir en el catálogo; `status` admite `published|construction|announced|operational`. Parámetros desconocidos, repetidos o inválidos producen `400 INVALID_SERVICE_FILTER`. Las demás consultas históricas no comparten necesariamente esta validación estricta de parámetros adicionales: los consumidores deben enviar solo los campos documentados.

Un servicio incluye `id`, `code`, `name`, `networkId`, `mode`, `status`, `statusAsOf`, `municipalities`, `from`, `to`, `via`, `sourceIds`, `officialUrl`, `planningEligible`, `geometryPack` y `notes`; puede incluir `stationNames`, `stationIds` y `geometryRevision`. Fechas, extremos o geometría desconocidos pueden ser `null`. `published` significa publicación en una fuente y no operación confirmada. `verifiedAt` fecha la consulta del catálogo, no la inauguración ni vigencia del servicio.

`arrivals` contiene `id`, `lineId`, `lineName`, `direction`, `etaMinutes`, `etaRange`, `occupancy`, `occupancyLabel`, `climate`, `accessible`, `condition`, `confidence`, `source`; una continuidad puede añadir `via` y `continuesAsLineId`. Afluencia: `Baja` <45, `Media` 45–74, `Alta` ≥75. Clima: `working|unknown|unavailable`; condición: `good|reported`; accesibilidad: `unknown`. Todos son estados de demostración. `confidence` no es una probabilidad de puntualidad validada. La simulación se mantiene determinista por estación, escenario y bloque de cinco minutos, con horas de `America/Monterrey`.

Las alternativas de Metro incluyen duración, caminata, transbordos, puntuación interna, pasos por línea, intervalos ilustrativos y estaciones. La preferencia `accessible` aplica penalizaciones, pero mantiene `accessibility:"unknown"`: no garantiza una ruta accesible. Mismo origen y destino, o falta de conexión, devuelven `200` con `journeys:[]` y explicación. L4 y L6 en construcción no producen viajes. La continuidad L2–L3 documentada en Zaragoza no agrega un cambio de tren.

```bash
curl --fail 'http://127.0.0.1:3001/api/services?network=regioruta'
curl --fail 'http://127.0.0.1:3001/api/board?station=padre-mier&scenario=normal'
curl --fail 'http://127.0.0.1:3001/api/plan?from=padre-mier&to=universidad&preference=fastest'
```

## Planificación multimodal

### `GET /api/mobility/network`

Devuelve el grafo público versionado: `version`, `revision`, `mode`, `verifiedAt`, `bounds`, `limits`, `stops`, `routes`, `throughServices`, `sources`, `coverage`, `assumptions`. Caché pública 3600 s. Si falta el artefacto: `503 MOBILITY_UNAVAILABLE`. Una ruta presente en el catálogo puede estar excluida del grafo; revisar `coverage.excludedRoutes` y `excludedRailRoutes`.

### `POST /api/mobility/plan`

`Content-Type: application/json`; campos permitidos:

```json
{
  "from": { "id": "padre-mier" },
  "to": { "id": "universidad" },
  "preference": "fastest",
  "scenario": "normal",
  "transport": "all",
  "offline": true
}
```

| Campo                      | Contrato                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `from`, `to`               | Objetos obligatorios. Parada: `{id}` o `{id,kind:"stop"}`. Lugar: `{kind:"place"\|"location"\|"coordinate",lat,lng,name?}`; `label` es alias de nombre y `address` es un texto admitido. No combinar ID con coordenadas. |
| `id`                       | Hasta 160 caracteres, sin controles; debe resolver a una parada del artefacto o ID histórico de estación Metro.                                                                                                          |
| `lat`, `lng`               | Números finitos dentro de `network.bounds`, solo para extremos de lugar/ubicación/coordenada.                                                                                                                            |
| `name`, `label`, `address` | Hasta 500 caracteres cada uno, sin controles.                                                                                                                                                                            |
| `preference`               | `fastest\|comfortable\|accessible`; predeterminado `fastest`.                                                                                                                                                            |
| `scenario`                 | `normal\|peak\|rain\|disruption`; predeterminado `normal`.                                                                                                                                                               |
| `transport`                | `all\|metro`; predeterminado `all`. Filtra servicios, no reemplaza extremos por estaciones.                                                                                                                              |
| `offline`                  | Booleano, predeterminado `false`. En `true`, ambos extremos deben ser paradas con `official:true`.                                                                                                                       |

No se admiten campos adicionales; `date` y `maxExpansions` son opciones internas del motor, no parámetros HTTP. El cliente principal calcula en un worker local y no necesita enviar GPS a este endpoint; un consumidor que envíe coordenadas por HTTP sí las transmite a su servidor.

Respuesta `200`: `mode:"experimental"`, `generatedAt`, `preference`, `scenario`, `offline`, `transport`, `from`, `to`, `networkRevision`, `coverage`, `warnings`, `journeys`, `diagnostics` y, sin conexión encontrada, `message`. `coverage` incluye conteos, redes, `maxWalkingMeters`, `exhaustive:false` y `alternativesLimit:8`. Los pasos conservan modo, servicio, extremos, geometría y fuentes; los tiempos y el aforo siguen siendo simulaciones.

Máximo ocho alternativas en 24000 expansiones compartidas, cuatro transbordos y 1200 m de caminata estimada total. Una búsqueda acotada no enumera todos los caminos. `diagnostics` informa `expansions`, `truncated` y, cuando corresponde, `searches` y `reason`: `NO_NEARBY_ORIGIN_STOPS`, `NO_NEARBY_DESTINATION_STOPS`, `SEARCH_LIMIT`, `DISCONNECTED_NETWORK` o `null`. Estos casos no son errores HTTP: devuelven lista vacía y explicación. Si origen y destino coinciden, el atajo devuelve `expansions:0` y `truncated:false`, sin `reason` ni `searches`.

Validación: `400 INVALID_MOBILITY_PLAN|INVALID_ENDPOINT|UNKNOWN_STOP|OFFLINE_STOP_ONLY|OUTSIDE_COVERAGE|INVALID_PREFERENCE|INVALID_SCENARIO|INVALID_TRANSPORT`. Artefacto ausente: `503 MOBILITY_UNAVAILABLE`. Véase [algoritmos y límites](especificacion-tecnica.md#algoritmos-y-supuestos).

## Lugares y direcciones

`GET /api/places?q=...` realiza una búsqueda explícita; `GET /api/places/suggest?q=...` obtiene sugerencias para escritura. Solo se admite un parámetro `q`, de 3–120 caracteres después de recortar y normalizar NFC. Se rechazan controles, correos y pares de coordenadas detectados (`400 INVALID_PLACE_QUERY` o `PRIVATE_PLACE_QUERY`). La consulta puede contener un domicilio: debe tratarse como información potencialmente sensible en registros y analítica.

Respuesta: `{places, provider, attribution, cached}`. Cada lugar contiene `id`, `name`, `address`, `displayName`, `lat`, `lng`, `kind`, `resultType` y `precision` cuando corresponden. Los resultados son referencias geográficas; no prueban un acceso peatonal utilizable. Se combinan referencias locales con proveedores configurados en el servidor: Nominatim para consulta explícita y Photon para sugerencias. El buscador público Nominatim no se utiliza para autocompletado.

Cada proveedor mantiene una consulta activa, una separación mínima de un segundo, caché de una hora y hasta 200 entradas por proceso; respuesta upstream máxima 128 KiB y plazo total de 6 s. Puede haber una búsqueda de contexto adicional dentro del mismo plazo. Solo consulta HTTPS configurado por el operador, sin credenciales en URL y con redirecciones rechazadas; el cliente no aporta una URL de destino. No se transmiten al proveedor GPS ni IP del cliente desde estos módulos. Las consultas de nombre/domicilio sí llegan al proveedor externo cuando no se resuelven localmente.

Errores adicionales: `429 PLACES_BUSY|PLACES_UNAVAILABLE`, `502 PLACES_UNAVAILABLE|PLACES_INVALID_RESPONSE`, `504 PLACES_TIMEOUT`. Un resultado vacío válido devuelve `200`. Detalles de uso y privacidad: [lugares-y-privacidad.md](lugares-y-privacidad.md).

## Reportes comunitarios

### `POST /api/reports`

```json
{
  "draftId": "125a2f6f-d61b-4d4d-bc31-95c52b49dc03",
  "targetType": "station",
  "stationId": "padre-mier",
  "category": "infrastructure",
  "title": "Falta una banca en el andén",
  "detail": "Observé un área de espera sin asientos disponibles.",
  "publicationConsent": true
}
```

| Campo                | Regla                                                                                                                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targetType`         | Obligatorio: `station\|unit\|route`.                                                                                                                                                                                                                                                      |
| `stationId`          | Obligatorio para `station`; no combinar con `routeId`. Para `unit` puede aportar contexto de estación. No permitido para `route`. Debe resolver a una estación conocida.                                                                                                                  |
| `routeId`            | Obligatorio para `unit` y `route`: ID exacto del catálogo de servicios. No se deduce a partir de un número de unidad.                                                                                                                                                                     |
| `category`           | `crowding\|climate\|accessibility\|condition\|infrastructure`.                                                                                                                                                                                                                            |
| `title`              | Texto de 3–100 caracteres Unicode después de recortar y normalizar NFC, sin controles.                                                                                                                                                                                                    |
| `detail`             | Texto de 3–500 caracteres Unicode normalizados; admite saltos de línea y tabulador, no otros controles. La interfaz puede exigir un mínimo mayor.                                                                                                                                         |
| `unitReference`      | Texto de hasta 80 caracteres; solo para `unit`. No se valida como identificador de una flota real.                                                                                                                                                                                        |
| `locationReference`  | Texto de hasta 120 caracteres; referencia de parada, cruce o lugar, sin controles.                                                                                                                                                                                                        |
| `publicationConsent` | Booleano obligatorio. `false` conserva el reporte privado y no lo habilita para publicación.                                                                                                                                                                                              |
| `photo`              | Cadena opcional Data URL: `data:image/jpeg;base64,...`, `data:image/png;base64,...` o `data:image/webp;base64,...`. Base64 canónico sin espacios. Imagen máxima 400000 bytes, 4 megapíxeles y 4096 px por lado; se valida estructura y se retiran metadatos admitidos por el sanitizador. |
| `draftId`            | UUID v4 opcional; identifica un mismo envío para reintentos idempotentes mientras exista el reporte. No lo uses como identificador público.                                                                                                                                               |

Se rechazan campos desconocidos. Compatibilidad anterior: un cuerpo con solo `stationId`, `category`, `detail` puede omitir título, destino y consentimiento; el servidor deriva el título y conserva el reporte privado. Los nuevos consumidores deben usar el contrato completo.

Respuesta `201`: `{report,notice}` con cabecera `Location` a la consulta pública del destino. `report` contiene UUID público, destino, categoría, título, descripción, referencias, MIME de foto si existe, fecha y `status:"pending"`; no incluye bytes de foto, clave del borrador, hash de envío ni autorización de publicación. **La cabecera `Location` no expone la cola privada ni confirma publicación.**

Repetir el mismo `draftId` y contenido normalizado devuelve el acuse original con `201` sin duplicar el registro ni consumir cuota de nuevos reportes. Cambiar el contenido bajo la misma clave produce `409 REPORT_DRAFT_CONFLICT`. Tras vencer la retención ya no se conserva esa clave; no es una garantía de deduplicación indefinida.

Errores: `400 INVALID_REPORT|INVALID_REPORT_DRAFT|INVALID_TARGET|INVALID_STATION|INVALID_ROUTE|INVALID_CATEGORY|INVALID_DETAIL|INVALID_TITLE|INVALID_REFERENCE|INVALID_PHOTO|INVALID_CONSENT`; destinos desconocidos `404 STATION_NOT_FOUND|ROUTE_NOT_FOUND`; almacenamiento lleno `507 REPORT_STORAGE_FULL`. Además aplican límites de cuerpo, tipo JSON y frecuencia.

### Lectura pública

| Método y ruta                                           | Resultado                                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/reports?station=padre-mier`                   | Hasta 20 reportes recientes publicados o resueltos con consentimiento; `stationId`, `summary`, `source:"community"`, `verification:"moderated"`, `notice`. Sin filtro usa Padre Mier. |
| `GET /api/reports?route=<id>`                           | Misma forma con `routeId`. La ruta debe existir en el catálogo.                                                                                                                       |
| `GET /api/reports/summary?station=<id>` o `?route=<id>` | Todos los conteos públicos vigentes para el destino: `total`, `open`, `resolved`, `byCategory`, `targets`, destino y procedencia.                                                     |
| `GET /api/reports/:id/photo`                            | Bytes de foto solo si el reporte sigue público, vigente y con consentimiento; si no, `404 PHOTO_NOT_FOUND`.                                                                           |

No combinar `station` y `route` (`400 INVALID_TARGET`). No existe consulta pública de borradores, pendientes o rechazados, consulta por ID de reporte privado, paginación ni filtro HTTP de estados. `summary` de la lista contiene `total`, `open`, `resolved`, `byCategory`; el endpoint de resumen añade `targets` con agrupación por tipo, estación/ruta, categoría, estado, cantidad y última fecha. Los conteos abarcan el total retenido y no solo los 20 elementos de la lista. Son cantidades de reportes, no de personas únicas, fallas confirmadas o prioridad automática de inversión.

Reportes y fotografías se entregan con `no-store`. Retención máxima de 90 días con limpieza al acceder al almacenamiento; no existe todavía un trabajo programado de eliminación. Cupos globales activos: 5000 reportes y 50000000 bytes de fotografías. Alcanzar el cupo rechaza nuevos envíos sin retirar evidencia vigente para hacer espacio. La retención de copias de seguridad debe administrarse por separado.

La revisión se opera únicamente mediante [CLI de moderación](../scripts/moderate-report.mjs), con identidad declarada de revisor, nota e historial. Publicar exige consentimiento y confirmación de revisión de texto/foto. Resolver es una transición administrativa; no prueba una reparación física por sí sola. No se envía automáticamente a autoridades ni se utiliza para modificar predicciones. Diseño y protocolo: [quejas-comunitarias.md](quejas-comunitarias.md).

## Errores comunes y pruebas

| HTTP      | Códigos transversales                                         |
| --------- | ------------------------------------------------------------- |
| 400       | `INVALID_JSON`, `INVALID_PATH` y validaciones del endpoint    |
| 403       | `ORIGIN_NOT_ALLOWED`                                          |
| 404       | `NOT_FOUND` y destinos o fotos no encontrados                 |
| 405       | `METHOD_NOT_ALLOWED`                                          |
| 409       | `REPORT_DRAFT_CONFLICT`                                       |
| 413       | `BODY_TOO_LARGE`                                              |
| 415       | `UNSUPPORTED_MEDIA_TYPE`                                      |
| 429       | `RATE_LIMITED` y cuotas de proveedor                          |
| 500       | `INTERNAL_ERROR`, mensaje genérico; sin stack en la respuesta |
| 502 / 504 | Fallo o plazo del proveedor de lugares                        |
| 503       | `MOBILITY_UNAVAILABLE`                                        |
| 507       | `REPORT_STORAGE_FULL`                                         |

```bash
pnpm test:backend
node --test tests/mobility-api.test.mjs tests/places.test.mjs tests/place-suggestions.test.mjs
```

Las pruebas de API crean aplicaciones y bases aisladas; no deben apuntar a una base con reportes reales. Estas verificaciones funcionales no sustituyen la evaluación de seguridad independiente ni una auditoría de cumplimiento.
