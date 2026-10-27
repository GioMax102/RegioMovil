# RegioMóvil

**Tu ciudad, a tu ritmo.** Aplicación Android, PWA y pantalla de consulta para paradas, con frontend y backend en un solo repositorio. Un piloto funcional para decidir con menos incertidumbre, sin crear cuenta y sin descargar un motor de mapas.

**Continuidad vigente (27 de octubre):** [plan de las nueve anotaciones de mapas, trayectos y comunidad](docs/PLAN_PRODUCTO_COMUNIDAD_2026-10-27.md), con estado y criterios de aceptación, y [evaluación de administración comunitaria y visión computacional](docs/MODELO_COMUNIDAD_Y_VISION_2026-10-27.md). Son trabajo planificado para la siguiente iteración; no funcionalidades ya entregadas.

El punto de partida es el entregable del Equipo 5. Su propuesta se convierte aquí en una experiencia verificable: red de transporte pública documentada, planeación sobre conexiones reales, escenarios de unidades, afluencia y condiciones, y fuentes visibles desde la interfaz.

La versión candidata **1.1.0**, preparada en **`fixes`**, ofrece un buscador único de lugares, calles, direcciones y paradas. Los mismos extremos se comparan entre Metro, autobús o sus combinaciones; los filtros se aplican a los resultados. La red documentada reúne **54 servicios y 3,417 puntos publicados**: tres líneas de Metro, treinta Transmetro, GMG, siete RegioRuta y trece recorridos IMA. Se calculan hasta ocho alternativas distintas por secuencia de servicios. [Cobertura y fuentes](docs/cobertura-autobuses-20261016.md), [método y benchmark](docs/modelo-movilidad.md).

Las búsquedas nuevas sin internet se restringen a puntos oficiales. Puedes etiquetar un viaje como Casa, Trabajo o Escuela y guardar las alternativas con sus mapas; los lugares o coordenadas sólo se conservan tras confirmar ese guardado. El cálculo corre localmente en un worker; la red adicional se carga al abrir Planear.

Planear con selección en mapa: [cambios y verificación del 17 de octubre](docs/mapa-y-planear-20261017.md).

Verificación del buscador de lugares y conexiones: [resultado del 16 de octubre de 2026](docs/buscador-multimodal-20261016.md).

## Qué puedes usar

- **Inicio:** acceso a planeación, guardados y red; información de servicio con simulación identificada.
- **Planear viaje:** origen y destino por nombre, calle, dirección, parada o ubicación bajo petición. La misma búsqueda compara Metro, autobús y combinaciones; puedes filtrar los resultados y cambiar la prioridad sin volver a introducir los puntos.
- **Red de transporte:** recorridos por sistema, mapas, estaciones y catálogo de servicios. Búsqueda por número o municipio, filtros y fuentes documentadas; la accesibilidad física permanece sin verificar.
- **Seguir un trayecto:** mapa de la etapa actual, siguiente parada y confirmaciones manuales «Ya llegué» / «Ya bajé»; GPS opcional en primer plano y controles de pausa, seguimiento y voz.
- **Guardados:** viajes con etiqueta y hasta ocho alternativas conservadas con su mapa, consulta sin internet y borrado individual o completo. Estaciones, trayectos anteriores y canales oficiales de pago quedan agrupados aparte.
- **Modo parada:** `/?kiosk=1&locked=1&station=padre-mier` para un módulo dedicado, interfaz de consulta con lectura en voz alta cuando el dispositivo ofrece síntesis de voz. No muestra guardados personales ni permite reportar.
- **Accesibilidad:** texto ampliado, contraste alto, controles con nombre, teclado, diálogos nativos y respeto de movimiento reducido.
- **Sin conexión:** catálogo, planificador, modelo y guardados funcionan localmente. Android incorpora el bundle; la PWA precachea también JavaScript, CSS y fuentes al completar su instalación inicial.
- **Reportes:** fallas de estación, parada/recorrido o unidad con título, descripción y foto opcional. La ruta y variante se seleccionan explícitamente; los reportes permanecen privados hasta revisión y consentimiento. Las fichas muestran reportes publicados, abiertos y resueltos. [Operación, moderación y valor público](docs/quejas-comunitarias.md).

## Qué datos son reales

El catálogo usa **38 ubicaciones únicas** de estaciones de Metrorrey, coordenadas del portal de Datos Abiertos de Nuevo León y el mapa oficial de abril de 2026. Los conteos institucionales por línea pueden contar correspondencias más de una vez. El alias Parque Fundidora se conserva para Arena Monterrey.

**Los arribos, el aforo, el clima de unidad, las incidencias y las duraciones son simulados.** No hay conexión contratada con GPS de concesionarios, sensores, tráfico de Waze o medios de pago. El planificador original calcula las líneas 1, 2 y 3 de Metrorrey. El catálogo adicional reúne Muevo León / urbanas IMA, RegioRuta, Transmetro, Ecovía / GMG y troncales e integradas. El modelo experimental infiere el orden espacial de 51 trazos de autobús y sus enlaces a pie; no confirma sentidos, embarque o cruces seguros. Los servicios sin geometría y L4/L6 en construcción quedan fuera del cálculo. No hay saldos ficticios, cargos, NFC ni boletos válidos.

Ver [procedencia y límites](docs/datos-y-fuentes.md), [alcance y heurísticas](docs/producto-y-accesibilidad.md) y [modelo/API](docs/api.md).

## Ejecutar

Requiere **Node 24+** y **pnpm 11.25+**. No requiere claves, Python ni una base de datos externa.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Abre `http://localhost:5173`. Vite comunica `/api` con el servidor en `127.0.0.1:3001`.

Para servir interfaz y API con un solo proceso:

```sh
pnpm build
pnpm start
```

Abre `http://localhost:3001`. El archivo opcional `.env` se carga en `pnpm start`; hay un ejemplo en `.env.example`. El servidor escucha solo en loopback por defecto. SQLite crea `.data/regiomovil.sqlite`, fuera del control de versiones.

También puedes usar `./regiomovil dev`, `./regiomovil build`, `./regiomovil start` y `./regiomovil test`. Este lanzador localiza Node en el sistema o en el runtime de Codex en este equipo.

## Android

```sh
pnpm android:build
```

Requiere JDK 21 y Android SDK 36. Produce `output/android/regiomovil-debug.apk` con su SHA-256. El APK se instala y abre en modo demostración local, sin un backend remoto obligatorio. Para conectar reportes a un servidor propio:

```sh
VITE_API_BASE_URL=https://tu-api.example pnpm android:build
```

La URL se incorpora durante la compilación, debe usar HTTPS y no debe contener credenciales. El backend debe permitir el origen `https://localhost`. También es necesaria para buscar lugares desde el APK: sin API remota, las paradas y el modelo local siguen disponibles. «Usar mi ubicación» obtiene una posición bajo permiso; la guía puede seguirla mientras la app está visible y el usuario lo autoriza. No se promete seguimiento en segundo plano. No se permite HTTP global ni se carga la aplicación desde un servidor remoto. [Compilación, kiosco y firma](docs/android.md).

## Preparar una actualización

La publicación web y el APK deben usar la misma API HTTPS y revisión de código. `./regiomovil prepare-release` genera un paquete verificable, sin publicar, después del commit, las pruebas y el APK release. Incluye ZIP de Pages, APK firmado, notas y hashes; requiere Python 3 estándar para el ZIP. Consulta el [procedimiento de merge, publicación y rollback](docs/publicacion.md) y las [notas 1.1.0](docs/releases/1.1.0.md). Un merge a `main` no actualiza por sí solo los servicios del piloto.

## Pruebas y modelo

```sh
pnpm build
pnpm test
pnpm model:train
```

Las pruebas cubren HTTP real, persistencia y validación de reportes, límites, CORS, archivos estáticos, grafo, continuidad entre líneas, escenarios, intervalos y comportamiento offline del service worker. El entrenamiento genera dos regresiones ridge a partir de 2,400 muestras sintéticas con particiones separadas de entrenamiento, calibración y evaluación. Se compara con un modelo base; **las métricas sintéticas no acreditan precisión operativa en Nuevo León**.

El registro de comprobaciones y limitaciones está en [verificación](docs/verificacion.md). No se ha realizado aún una evaluación con pasajeros, adultos mayores ni teléfonos físicos de gama baja.

## Estructura

```text
src/          React + TypeScript, interfaz adaptativa y accesibilidad
server/       HTTP Node, SQLite y motor portable de predicción/planeación
data/         Catálogo regional y fuentes públicas
models/       Pesos, particiones, métricas y ficha de datos sintéticos
android/      Proyecto nativo Capacitor, iconos y configuración segura
public/       PWA, service worker e iconos locales
scripts/      Desarrollo, precache de build y compilación Android
tests/        Pruebas de API, dominio y modo offline
docs/         Producto, fuentes, API, Android y verificación
```

Montserrat e Inter se sirven localmente bajo SIL OFL; sus licencias se incluyen en `public/licenses/` y en el APK. Los colores de las líneas proceden del mapa oficial; la identidad verde, piedra y ocre se inspira en el paisaje de Nuevo León y no pretende ser una marca del gobierno. La base geográfica de Monterrey usa un extracto de OpenStreetMap empaquetado localmente, con atribución ODbL; se muestra al abrir mapas de trayectos y redes. [Procedencia y licencia del mapa](src/data/monterrey-map.md). El buscador sugiere lugares automáticamente con Photon al escribir al menos tres caracteres y hacer una pausa de 650 ms; el backend limita las consultas y mantiene una caché. Nominatim se conserva sólo para consultas explícitas de la API. No hay analítica ni cuenta obligatoria. La ubicación del seguimiento autorizado permanece en memoria durante la guía en primer plano; los guardados sólo conservan lugares o coordenadas cuando confirmas guardar un viaje, y se pueden borrar desde Guardados. [Búsqueda y privacidad](docs/lugares-y-privacidad.md).

## Ejecutar en contenedor

```sh
docker build -t regiomovil .
docker run --rm -p 127.0.0.1:3001:3001 -v regiomovil-data:/data regiomovil
```

Para un servicio público faltan el dominio HTTPS, respaldo del volumen, monitoreo y política de moderación de reportes. Para pasar de simulación a información operativa hacen falta acuerdos de datos, validación con sensores/GPS, medición de frescura y pruebas con pasajeros. El contrato propuesto para fuentes reales se documenta en la API.

## Próximas iteraciones

Metro, Transmetro, GMG, RegioRuta e IMA ya participan en el cálculo con los trazos disponibles. La [cobertura del 27 de octubre](docs/cobertura-rutas-2026-10-27.md) incluye 185 de 209 rutas de autobús, las tres líneas Metro y la explicación individual de las 24 rutas pendientes. La validación de sentidos, secuencias operativas, accesos peatonales y horarios continúa como [trabajo pendiente](docs/proximas-iteraciones.md).

La [evaluación de esta iteración](docs/iteracion-viajes-cotidianos.md) explica qué se incluye, qué se descarta y los criterios para recomendar tramos a pie, bicicleta y monopatín en la siguiente etapa.
