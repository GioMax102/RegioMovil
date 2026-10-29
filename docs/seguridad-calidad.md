# Revisión de seguridad, calidad y portabilidad

> Registro histórico: conserva el alcance y las cifras de su fecha. Para el estado vigente, consultar el [índice documental](README.md), la [especificación técnica](especificacion-tecnica.md) y la [hoja de ruta](hoja-de-ruta.md).

Fecha: 18 de octubre de 2026. Rama de trabajo: `fixes`.

Esta revisión cubre código y dependencias del repositorio. No equivale a una prueba de penetración de los proveedores, una certificación ni una auditoría completa del historial de Git. Los cambios no se han publicado en Cloudflare o Render.

## Prioridades y cambios

| Severidad | Hallazgo y evidencia | Estado |
| --- | --- | --- |
| Media, dependencia de desarrollo | `pnpm audit` detectó `GHSA-w5hq-g745-h8pq` en `@capacitor/cli > xcode > uuid@7.0.3`. La vulnerabilidad afecta escrituras en buffers de `v3/v5/v6`. El `xcode` instalado utiliza exclusivamente `v4`, por lo que no se encontró esa ruta de explotación en el proyecto. | Corregido con override limitado `xcode>uuid: 11.1.1`; conserva CommonJS. Se comprobó la generación de identificadores de Xcode y la ejecución de Capacitor. Auditoría repetida: **0 vulnerabilidades conocidas**, incluyendo desarrollo, entre 270 dependencias reportadas por npm. |
| Media, endurecimiento web | Faltaba Content Security Policy en Node y Pages. Una futura inyección tendría más libertad para cargar scripts o enviar datos a terceros. No se encontró un sumidero de HTML inseguro en los componentes revisados. | Corregido: scripts, fuentes y workers propios; API publicada y teselas de OSM explícitas. Bloquea plugins, cambios de base, envío de formularios a otros orígenes y enmarcado. Estilos inline permanecen permitidos porque React posiciona elementos del mapa y las páginas estáticas tienen CSS embebido. |
| Media, disponibilidad | Los cálculos síncronos de trayectos compartían el presupuesto general de 180 solicitudes/minuto con consultas de bajo costo. | Mitigado: Metro y multimodal comparten un presupuesto específico de **20 cálculos/minuto por IP del socket**; cambiar de endpoint o falsificar `X-Forwarded-For` no lo elude. El cálculo habitual del cliente continúa en el worker local. No es protección completa frente a ataques distribuidos. |
| Baja, archivos locales | SQLite podía heredar permisos `0644` según la umask del proceso y permitir lectura por otras cuentas del host. | Corregido: base y diarios WAL/SHM `0600`, incluido ajuste al abrir una base existente. Prueba Unix con umask permisiva. Esto protege acceso local, no cifra los datos ni convierte los reportes públicos en privados. |
| Media, privacidad Android | Un permiso tardío o callback de ubicación encolado podía registrar o entregar GPS después de pausar la actividad. | Corregido: guardas de primer plano antes de registrar ubicación y entregar callbacks; se conservan liberación de llamadas y cancelación. Compilación Android y contratos de fuentes comprobados; el ciclo de vida real sigue pendiente en teléfono. |
| Media, claridad y privacidad | Reanudar la guía reutilizaba brevemente una lectura anterior como vigente y podía conservar evidencia de llegada. | Corregido: espera una nueva lectura y elimina posición/evidencias anteriores, conservando etapa y progreso. Regresión de pausa de 60 segundos con voz y llegada. |
| Baja, superficie Android | FileProvider declaraba toda la raíz del almacenamiento externo y toda la caché, aunque no existe un flujo de compartir archivos. | Endurecido: sólo se reserva `cache/shared/`; el provider continúa sin exportar. No se agregaron permisos de archivos. |
| Media, operación pendiente | Detrás del proxy de Render, varios visitantes pueden compartir la IP del socket y el presupuesto. Confiar indiscriminadamente en `X-Forwarded-For` permitiría suplantar identidades. | Se conserva la opción restrictiva actual. Para un piloto con más tráfico hace falta un gateway con límites por cliente y una cadena de proxies documentada y verificada. No se activó confianza en cabeceras proporcionadas por clientes. |
| Media, producto pendiente | Los reportes son públicos y anónimos, sin moderación, identidad comprobada ni garantía de persistencia en Render Free. | Ya se etiquetan como no verificados. Retención máxima de 90 días / 5,000 reportes, límite de envío y descripciones acotadas. Antes de un uso público más amplio se requiere moderación, procedimiento de retirada y almacenamiento persistente. |

La severidad refleja el contexto del piloto. No se encontraron hallazgos críticos o altos durante las comprobaciones realizadas; esto no garantiza que no existan.

## Controles comprobados

- CORS mediante orígenes explícitos; rechaza un origen desconocido antes de escribir. No usa comodines ni cookies de autenticación.
- JSON limitado a 4 KiB, tipos y campos de extremos de trayecto validados, coordenadas dentro de la cobertura y catálogos de paradas documentadas.
- SQL parametrizado. Texto como instrucciones SQL o etiquetas HTML permanece como contenido de un reporte no verificado; API responde JSON con `nosniff` y `no-store`. La UI debe seguir renderizándolo como texto de React.
- Servicio de lugares con proveedor configurado exclusivamente en el servidor, HTTPS sin credenciales, consultas sin URL arbitraria, redirecciones deshabilitadas, respuesta máxima 128 KiB y plazo de seis segundos.
- Geocodificación acotada a la ZMM, sin añadir GPS o IP del visitante a la consulta. Las búsquedas por texto pueden incluir direcciones: no deben contener datos sensibles. La caché en memoria permanece hasta una hora y 200 entradas por servicio.
- Cuota del proveedor compartida en el proceso, sin cola ilimitada; espera y backoff ante saturación. Para varias réplicas se necesita una cuota externa compartida.
- Archivos estáticos restringidos al directorio de build, sin traversal, archivos ocultos, source maps ni enlaces simbólicos que escapen de la raíz. Caché de compresión acotada.
- Errores inesperados no reflejan el cuerpo recibido; logs del servidor sólo muestran nombre/código de error. No se incorporó registro de coordenadas.
- Revisión de rutas rastreadas de secretos y patrones de claves privadas, AWS y GitHub: sin coincidencias. No se leyeron ni imprimieron credenciales locales. Las llaves de firma y variables privadas deben permanecer fuera de Git.

## CSP y compatibilidad

La misma política se define en `server/app.mjs` y `public/_headers`; una prueba verifica su correspondencia. Permite:

- scripts ES modules, carga diferida y workers de la misma aplicación;
- service worker y manifiesto propios;
- fuentes Inter y Montserrat empaquetadas, sin CDN de tipografías;
- imágenes propias y `https://tile.openstreetmap.org`;
- API propia del origen y `https://regiomovil-api.onrender.com`.

Al cambiar el dominio del backend o el proveedor de teselas se deben actualizar ambas políticas y verificar de nuevo. No se añade una CSP mediante `<meta>` al paquete Capacitor, para no bloquear su transporte nativo o el backend local de depuración. La configuración nativa requiere una revisión separada de Android.

El contrato de cabeceras está probado; la verificación integrada utiliza el build servido por Node. Vite en desarrollo no entrega estas cabeceras. La inspección visual y las pruebas en un teléfono físico no se sustituyen por comprobar la cadena de CSP.

La integración local se verificó con el build servido por Node: carga diferida del planeador y de la guía, cálculo en worker y teselas OSM sin errores CSP. Los detalles de UI, artefactos y limitaciones físicas se documentan en [la revisión de producto](revision-producto-2026-10-18.md). Las cabeceras en la versión pública siguen siendo las de su despliegue anterior.

## Verificación realizada

**54 pruebas aprobadas** en esta revisión, con Node 24, mediante:

```sh
node --test tests/backend*.test.mjs tests/mobility-api.test.mjs tests/places.test.mjs tests/place-suggestions.test.mjs
pnpm audit --json
```

Incluyen cuatro regresiones nuevas: cabeceras de seguridad y correspondencia con Pages; presupuesto compartido de planificación y resistencia a XFF falsificado; permisos SQLite/diarios; reportes HTML como JSON y rechazo de escrituras de otro origen. El resto cubre límites de cuerpo y proveedor, errores, persistencia, SQL parametrizado, CORS, traversal, compresión, cachés y contratos de movilidad.

Se instaló desde el lockfile con `pnpm install --frozen-lockfile --ignore-scripts`. No se ejecutaron scripts de instalación de terceros. Se comprobó `cap --version` y `xcode.project().generateUuid()` con la dependencia corregida. Las compilaciones web y Android y el conjunto completo de UI son verificaciones complementarias de la integración.

## Límites de despliegue y seguimiento

- Render Free entra en reposo y su disco es efímero. SQLite conserva reportes únicamente mientras sobreviva ese disco; la app no debe prometer entrega a autoridades, persistencia ni atención de emergencias.
- El proveedor público de geocodificación y OSM no proporcionan disponibilidad ilimitada; se mantienen atribución, caché y límites. No se hace precarga masiva de teselas.
- La geolocalización y voz dependen de permisos y capacidades del dispositivo. La guía requiere distinguir ubicación reciente, imprecisa, perdida y aplicación oculta. El paquete no debe prometer seguimiento en segundo plano.
- Las teselas de OpenStreetMap revelan al proveedor el área consultada. No se envía una secuencia GPS al backend; Ahorrar datos utiliza el mapa local y evita las solicitudes de teselas. Las búsquedas por texto y los guardados tienen límites y tratamientos diferentes del GPS en memoria.
- Validación pendiente en hardware: teclado virtual, lector de pantalla Android, ahorro de batería, pérdida real de GPS/red, pausa/reanudación de la app, fuentes ampliadas y avisos por voz. Los simuladores o pruebas DOM no validan estos aspectos.

## Fuentes técnicas consultadas

- [Aviso del mantenedor de uuid, GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).
- [Content Security Policy, documentación de MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).
- [Render Free: reposo, cuotas y almacenamiento efímero](https://render.com/docs/free).
