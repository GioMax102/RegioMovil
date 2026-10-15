# API y modelo de RegioMovil

El backend usa HTTP nativo y SQLite de Node.js 24, sin dependencias de servidor. El catálogo local contiene estaciones, líneas, correspondencias, lugares y fuentes oficiales fechadas. Las llegadas, ocupación, condiciones y duraciones son una **simulación**: no hay conexión con GPS ni con la operación de Metrorrey.

## Ejecutar

```bash
npm run dev:api
# Después de npm run build, el mismo servidor entrega dist/.
npm start
npm run test:backend
npm run model:train
```

La dirección predeterminada es `http://127.0.0.1:3001`. El comando `npm run dev:api` sirve la API en modo de recarga y, si existe, `dist/`. La aplicación Android puede utilizar el mismo motor de simulación local sin red; los reportes requieren una API disponible.

Variables de entorno:

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `PORT` | `3001` | Puerto HTTP |
| `HOST` | `127.0.0.1` | Interfaz de escucha; definir `0.0.0.0` para un contenedor |
| `DATABASE_PATH` | `.data/regiomovil.sqlite` | Archivo persistente de reportes |
| `CORS_ORIGINS` | Lista local explícita | Orígenes permitidos separados por coma, sin `*` |

Los orígenes locales permitidos son `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3001`, `http://127.0.0.1:3001`, `http://localhost`, `https://localhost` y `capacitor://localhost`. La lista también aplica a módulos estáticos que envían `Origin` por usar `crossorigin`. Para usar un dominio propio hay que incluir su origen HTTPS en `CORS_ORIGINS`. Detrás de un proxy, el límite se aplica a la IP del socket; el servidor no confía en `X-Forwarded-For` enviado por el cliente.

## Contrato

Todas las respuestas son JSON UTF-8. Los errores tienen forma `{"error":{"code":"INVALID_SCENARIO","message":"…"}}`. El servidor devuelve `400` por valores inválidos, `404` por estaciones o rutas API desconocidas, `405` por métodos incompatibles, `413` por cuerpos mayores de 4096 bytes, `415` por contenido distinto de JSON y `429` por límite de solicitudes. Las respuestas con `429` incluyen `Retry-After: 60`.

### `GET /api/health`

Devuelve `status`, `service`, `version`, `mode: "simulation"` y `generatedAt` ISO-8601. No consulta ningún operador.

### `GET /api/network`

Devuelve directamente `data/network.json`: `sources`, `lines`, `stations`, `places` y `throughServices`. Las referencias de línea contienen `stationIds` en orden. Las coordenadas de estaciones no representan accesos peatonales; los lugares con `coordinateRole: "station-anchor"` comparten el punto de su estación. La respuesta usa `ETag` y admite `If-None-Match` (`304`), con caché de un día.

### `GET /api/board?station=padre-mier&scenario=normal`

`station` admite ID, nombre o alias normalizado, y predetermina Padre Mier. `scenario` puede ser `normal`, `peak`, `rain` o `disruption`.

```json
{
  "stationId": "padre-mier",
  "generatedAt": "2026-10-15T18:00:00.000Z",
  "mode": "simulation",
  "scenario": "normal",
  "arrivals": [{
    "id": "L2-zaragoza-0-5973192",
    "lineId": "L2",
    "lineName": "Línea 2",
    "direction": "General I. Zaragoza",
    "etaMinutes": 7,
    "etaRange": [5, 9],
    "occupancy": 38,
    "occupancyLabel": "Baja",
    "climate": "working",
    "accessible": "unknown",
    "condition": "good",
    "confidence": 0.82,
    "source": "simulation"
  }],
  "forecast": [{"hour": "12:00", "occupancy": 38}],
  "advice": {"title": "Compara antes de salir", "body": "…"},
  "alerts": []
}
```

Los números del ejemplo son ilustrativos. Hay dos salidas por sentido disponible y línea; una estación terminal no ofrece un sentido inexistente. En continuidad L2↔L3, `direction` indica la terminal final y se agregan `via` y `continuesAsLineId`. `occupancyLabel` usa Baja (<45), Media (45–74) y Alta (≥75). `climate` admite `working`, `unknown` o `unavailable`; `condition` admite `good` o `reported`. **Todos estos estados se generan, no se observan.** `accessible` permanece `unknown`. Los avisos de escenarios indican explícitamente que no son incidentes del operador. La simulación es determinista por estación, escenario y bloque de cinco minutos. Las horas de la gráfica usan `America/Monterrey`.

`confidence` es un indicador ilustrativo calculado a partir del ancho del intervalo; no es una probabilidad de puntualidad ni una medida validada con viajes reales. `etaRange` usa un radio calibrado en muestras sintéticas, ampliado de forma conservadora en el escenario de demora.

### `GET /api/plan?from=padre-mier&to=universidad&preference=fastest&scenario=normal`

Origen y destino son obligatorios y admiten ID, nombre o alias. `preference` puede ser `fastest`, `comfortable` o `accessible`. Devuelve:

```json
{
  "journeys": [{
    "id": "journey-0-12345",
    "title": "Viaje directo",
    "durationMinutes": 28,
    "walkingMinutes": 4,
    "transfers": 0,
    "occupancy": 38,
    "score": 20.1,
    "steps": [{
      "lineId": "L2", "lineName": "Línea 2",
      "fromId": "padre-mier", "from": "Padre Mier",
      "toId": "universidad", "to": "Universidad",
      "stationCount": 8, "minutes": 20
    }],
    "accessibility": "unknown",
    "source": "simulation",
    "etaRange": [24, 32],
    "stationIds": ["padre-mier", "fundadores", "…", "universidad"]
  }],
  "mode": "simulation",
  "generatedAt": "2026-10-15T18:00:00.000Z",
  "preference": "fastest"
}
```

El planificador busca hasta tres caminos simples conectados mediante aristas consecutivas del catálogo. Puede devolver menos alternativas si no hay más caminos documentados. No genera rutas de autobús ni de calles ausentes del catálogo. El mismo origen y destino devuelve una lista vacía y un mensaje; una red desconectada devuelve una lista vacía con explicación.

Los tiempos de recorrido usan distancia geográfica aproximada, velocidad supuesta de 32 km/h, estancia en estación y ajustes de escenario. Caminata y espera son supuestos explícitos de simulación, sin levantamiento de accesos ni horarios de salida. `comfortable` agrega una penalización por ocupación sintética. `accessible` penaliza cambios de tren para priorizar menos transbordos y devuelve un mensaje de accesibilidad sin verificar. **No garantiza una ruta accesible.**

La continuidad documentada entre L2 y L3 en Zaragoza no suma transbordo; el nuevo paso lleva `continuesOnTrain: true`. La fuente se encuentra en `network.throughServices`. `stationCount` cuenta tramos entre estaciones, sin sumar otra vez la estación de inicio. `score` es el costo interno a minimizar según preferencia, no una calificación pública.

### `GET /api/model`

Ficha del modelo: propósito, semilla, particiones, variables, algoritmo, línea base, métricas, cobertura de intervalos y limitaciones. Se puede consultar sin datos personales ni credenciales.

### `POST /api/reports`

```json
{"stationId":"padre-mier","category":"climate","detail":"Observé una unidad sin ventilación."}
```

Requiere `Content-Type: application/json`, estación conocida, categoría `crowding`, `climate`, `accessibility` o `condition`, y descripción de 3–500 caracteres después de recortar espacios y normalizar Unicode NFC. No admite caracteres de control. Devuelve `201` con `{report, notice}`. El reporte contiene `id` UUID, `stationId`, `category`, `detail`, `createdAt` ISO-8601 y `status: "unverified"`.

Los reportes se persisten con consultas parametrizadas SQLite y se devuelven mediante la API como comentarios comunitarios sin verificación; la interfaz no incorpora un feed público de reportes. No modifican automáticamente el modelo ni el estado de una unidad, y no se envían a una autoridad o servicio de emergencia. No se solicita nombre, correo ni ubicación del dispositivo. No incluyas información personal en el texto. No hay identidad verificada ni moderación implementada: hace falta incorporarlas para operación pública.

Hay un máximo de 12 intentos de reporte por minuto/IP y 180 peticiones API por minuto/IP. Se conservan hasta 5000 reportes durante un máximo de 90 días; la limpieza se ejecuta al leer o escribir reportes. Los textos se devuelven como texto JSON y la interfaz debe escaparlos al representarlos.

### `GET /api/reports?station=padre-mier`

Devuelve hasta 20 reportes recientes de esa estación, `stationId`, `source: "community"`, `verification: "unverified"` y un aviso. No se deben presentar como alertas oficiales.

## Entrenamiento reproducible

`server/train-model.mjs` genera `models/artifact.json`. Usa una semilla fija de **5012026** y 2400 muestras: 1680 para ajustar, 360 para calibrar intervalos y 360 para evaluar. La partición se hace antes del ajuste y la calibración; los conjuntos de evaluación no se usan para entrenar. Se comparan dos regresiones ridge con regularización λ=2 y variables estandarizadas contra una línea base que predice la media del entrenamiento. El intercepto no se regulariza.

Las variables incluyen segmentos pendientes, componentes cíclicas de la hora, escenario, centralidad, factor de velocidad, intervalo de servicio e interacciones. Las reglas del generador agregan demoras y ocupación en escenarios adversos, más ruido reproducible. El radio del intervalo nominal de 80% se toma del cuantil de residuales absolutos en calibración.

| Objetivo | MAE sintético del modelo | MAE sintético de la media |
| --- | ---: | ---: |
| Llegada | 0.704 minutos | 3.737 minutos |
| Ocupación | 4.892 puntos porcentuales | 17.715 puntos porcentuales |

Estas métricas miden la recuperación de reglas sintéticas conocidas. **No demuestran precisión sobre el transporte de Nuevo León.** Para evaluar un sistema real se necesita telemetría autorizada, observaciones de aforo, reportes verificados y una partición temporal de validación. La aplicación mantiene visible el modo de simulación.

## Motor compartido y operación

`server/domain.mjs` no importa módulos de Node: exporta `buildBoard(network, stationId, scenario, date)` y `planJourney(network, from, to, preference, scenario, date)` para API y simulación local de Android/web. Importa el artefacto JSON con atributos de importación. Esto evita diferencias entre la vista sin conexión y la API.

El servidor entrega `dist/` en producción, usa `nosniff` y CORS explícito, y no expone la base de datos en estáticos. El fallback SPA se aplica a navegación que acepta `text/html` y no tiene extensión; los assets inexistentes devuelven `404`, nunca HTML con MIME de JavaScript. `HEAD` devuelve tipo y longitud sin cuerpo. Se bloquean rutas ocultas, caracteres de control, separadores inversos, traversal codificado y symlinks que salgan del directorio real de `dist/`. Solo se sirven extensiones MIME permitidas; no se entregan source maps ni archivos arbitrarios. `sw.js` y HTML se revalidan con `no-cache`; los assets con hash admiten caché inmutable. Los endpoints actuales no realizan solicitudes salientes ni aceptan URLs remotas: no existe un proxy de recursos.

La interfaz web conserva su shell y assets públicos mediante service worker; `/api/` y los reportes no deben almacenarse en esa caché. Si falta API, la operación que se muestra proviene explícitamente del motor sintético local. Para una instalación pública se requiere HTTPS, volumen persistente para SQLite, dominio CORS explícito, monitoreo operativo y política de moderación. No se implementan pagos, saldo, boletos ni integración no autorizada con Urbani.

El servidor negocia Brotli o gzip para texto estático de 1 KiB a 2 MiB, con `Vary: Origin, Accept-Encoding` y longitud correcta también en `HEAD`. Conserva como máximo 64 representaciones comprimidas y 8 MiB en una caché LRU; la clave incluye modificación y tamaño del archivo. Las fuentes WOFF2 e imágenes ya comprimidas se entregan intactas. El finalizador de build precarga JS, CSS y fuentes locales, excluye source maps e invalida la versión de la caché cuando cambia cualquier archivo del shell o asset público.

## Adaptador de telemetría real: diseño futuro, no implementado

No se ha identificado ni conectado un feed autorizado del operador. Este diseño propone una frontera `TransitProvider` con implementaciones separadas `SyntheticProvider` y `GtfsRealtimeProvider`; la API actual utiliza únicamente el primero. La futura integración exige convenio/licencia, catálogo GTFS estático válido y correspondencia auditada de IDs de paradas, rutas y viajes con los IDs del piloto.

| Entrada autorizada futura | Normalización propuesta |
| --- | --- |
| `TripUpdate.stop_time_update` | Llegada esperada, cancelación u omisión según la semántica del viaje |
| `VehiclePosition` | Posición y hora de observación por vehículo/viaje |
| `VehiclePosition.occupancy_status` o porcentaje | Afluencia solo cuando el campo está presente; conservar categoría o porcentaje con su unidad |
| `Alert` | Aviso con fuente, entidades afectadas y período activo |

Estos mensajes y campos se definen en la [referencia oficial GTFS Realtime](https://gtfs.org/documentation/realtime/reference/). Sus campos de ocupación son opcionales y experimentales; el porcentaje puede superar 100. El adaptador debe preservar ese valor bruto y separar cualquier representación visual acotada. Aire acondicionado, mantenimiento y funcionamiento de elevadores necesitan otra fuente autorizada; no deben deducirse de GPS, ausencia de alertas ni valores predeterminados.

Propuesta de flujo: un recolector del servidor consulta solo destinos HTTPS configurados por un administrador, con allowlist, resolución de IP validada, sin redirecciones hacia redes privadas, timeout y límite de bytes. No se aceptarán URLs aportadas por personas usuarias. El recolector valida protobuf, versión, IDs, timestamps y presencia de campos; produce una instantánea atómica que la API lee sin consultar al proveedor por cada pantalla. Aplicar reintentos limitados, backoff y caché condicional evita multiplicar tráfico upstream.

Cada valor deberá llevar `source`, `observedAt`, `receivedAt` y estado `fresh|stale|unavailable`, sin reutilizar `generatedAt` como prueba de actualidad. Las [buenas prácticas de GTFS Realtime](https://gtfs.org/documentation/realtime/realtime-best-practices/) recomiendan actualizar el feed al menos cada 30 segundos y no superar 90 segundos de edad en posiciones/actualizaciones de viajes ni 10 minutos en alertas. El contrato con el operador fijará umbrales y cobertura reales.

Si el feed falta, está vencido o carece de aforo, mostrar «Sin dato operativo» y la última observación con fecha. La simulación seguirá siendo una opción identificada aparte; nunca rellenará silenciosamente datos reales. Un contrato versionado deberá permitir `null` en ocupación/ETA desconocidas y distinguir horario programado, observación y predicción. Antes de activar la fuente, probar fixtures de cancelación, IDs desconocidos, datos parciales y vencidos; medir cobertura, latencia y error con observaciones reales y partición temporal. Ninguna métrica sintética del piloto autoriza el indicador «en vivo».
