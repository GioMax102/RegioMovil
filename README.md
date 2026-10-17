# RegioMóvil

**Tu ciudad, a tu ritmo.** Aplicación Android, PWA y pantalla de consulta para paradas, con frontend y backend en un solo repositorio. Un piloto funcional para decidir con menos incertidumbre, sin crear cuenta y sin descargar un motor de mapas.

El punto de partida es el entregable del Equipo 5. Su propuesta se convierte aquí en una experiencia verificable: red de transporte pública documentada, planeación sobre conexiones reales, escenarios de unidades, afluencia y condiciones, y fuentes visibles desde la interfaz.

Esta rama, **`codex/movilidad-multimodal`**, ofrece un buscador único de lugares, calles, direcciones y paradas. Los mismos extremos se comparan entre Metro, autobús o sus combinaciones; los filtros se aplican a los resultados. La red documentada reúne **54 servicios y 3,417 puntos publicados**: tres líneas de Metro, treinta Transmetro, GMG, siete RegioRuta y trece recorridos IMA. Se calculan hasta ocho alternativas distintas por secuencia de servicios. [Cobertura y fuentes](docs/cobertura-autobuses-20261016.md), [método y benchmark](docs/modelo-movilidad.md).

Las búsquedas nuevas sin internet se restringen a puntos oficiales. Puedes etiquetar un viaje como Casa, Trabajo o Escuela y guardar las alternativas con sus mapas; los lugares o coordenadas sólo se conservan tras confirmar ese guardado. El cálculo corre localmente en un worker; la red adicional se carga al abrir Planear.

Planear con selección en mapa: [cambios y verificación del 17 de octubre](docs/mapa-y-planear-20261017.md).

Verificación del buscador de lugares y conexiones: [resultado del 16 de octubre de 2026](docs/buscador-multimodal-20261016.md).

## Qué puedes usar

- **Mi camino:** próximas unidades simuladas, intervalos de llegada, ocupación y aire acondicionado del escenario.
- **Planear viaje:** origen y destino por nombre, calle, dirección, parada o ubicación bajo petición. La misma búsqueda compara Metro, autobús y combinaciones; puedes filtrar los resultados y cambiar la prioridad sin volver a introducir los puntos.
- **Estaciones:** búsqueda por nombre, alias y municipio, filtros de línea, pronóstico sintético y accesibilidad explícitamente sin verificar.
- **Rutas y redes:** 214 fichas de servicios, variantes y ampliaciones; búsqueda por número o municipio, filtros de red y estado, 51 mapas de autobús y fuentes fechadas. Disponible en Estaciones → Rutas y redes.
- **Guardados:** viajes con etiqueta y hasta ocho alternativas conservadas con su mapa, consulta sin internet y borrado individual o completo. Estaciones, trayectos anteriores y canales oficiales de pago quedan agrupados aparte.
- **Modo parada:** `/?kiosk=1&locked=1&station=padre-mier` para un módulo dedicado, interfaz de consulta con lectura en voz alta cuando el dispositivo ofrece síntesis de voz. No muestra guardados personales ni permite reportar.
- **Accesibilidad:** texto ampliado, contraste alto, controles con nombre, teclado, diálogos nativos y respeto de movimiento reducido.
- **Sin conexión:** catálogo, planificador, modelo y guardados funcionan localmente. Android incorpora el bundle; la PWA precachea también JavaScript, CSS y fuentes al completar su instalación inicial.
- **Reportes:** formulario con validación y almacenamiento SQLite; no se envía a autoridades ni se convierte en un aviso oficial.

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

La URL se incorpora durante la compilación, debe usar HTTPS y no debe contener credenciales. El backend debe permitir el origen `https://localhost`. También es necesaria para buscar lugares desde el APK: sin API remota, las paradas y el modelo local siguen disponibles. La ubicación se obtiene una sola vez al pulsar su botón y requiere permiso del dispositivo. No se permite HTTP global ni se carga la aplicación desde un servidor remoto. [Compilación, kiosco y firma](docs/android.md).

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

Montserrat e Inter se sirven localmente bajo SIL OFL; sus licencias se incluyen en `public/licenses/` y en el APK. Los colores de las líneas proceden del mapa oficial; la identidad verde, piedra y ocre se inspira en el paisaje de Nuevo León y no pretende ser una marca del gobierno. La base geográfica de Monterrey usa un extracto de OpenStreetMap empaquetado localmente, con atribución ODbL; se muestra al abrir el detalle de un trayecto. [Procedencia y licencia del mapa](src/data/monterrey-map.md). El buscador de lugares consulta Nominatim sólo al confirmar una búsqueda, con cuota y caché en el backend. No hay analítica, seguimiento continuo de ubicación ni cuenta obligatoria. Los guardados sólo conservan lugares o coordenadas cuando confirmas guardar un viaje; se pueden borrar desde Guardados. [Búsqueda y privacidad](docs/lugares-y-privacidad.md).

## Ejecutar en contenedor

```sh
docker build -t regiomovil .
docker run --rm -p 127.0.0.1:3001:3001 -v regiomovil-data:/data regiomovil
```

Para un servicio público faltan el dominio HTTPS, respaldo del volumen, monitoreo y política de moderación de reportes. Para pasar de simulación a información operativa hacen falta acuerdos de datos, validación con sensores/GPS, medición de frescura y pruebas con pasajeros. El contrato propuesto para fuentes reales se documenta en la API.

## Próximas iteraciones

Metro, Transmetro, GMG, RegioRuta e IMA ya participan en el cálculo con los trazos disponibles. Consulta [cobertura actual, fuentes y límites](docs/cobertura-autobuses-20261016.md). La validación de sentidos, secuencias operativas, accesos peatonales y horarios continúa como [trabajo pendiente](docs/proximas-iteraciones.md).

La [evaluación de esta iteración](docs/iteracion-viajes-cotidianos.md) explica qué se incluye, qué se descarta y los criterios para recomendar tramos a pie, bicicleta y monopatín en la siguiente etapa.
