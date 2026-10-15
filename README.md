# RegioMóvil

**Tu ciudad, a tu ritmo.** Aplicación Android, PWA y pantalla de consulta para paradas, con frontend y backend en un solo repositorio. Un piloto funcional para decidir con menos incertidumbre, sin crear cuenta y sin descargar un motor de mapas.

El punto de partida es el entregable del Equipo 5. Su propuesta se convierte aquí en una experiencia verificable: red de transporte pública documentada, planeación sobre conexiones reales, escenarios de unidades, afluencia y condiciones, y fuentes visibles desde la interfaz.

## Qué puedes usar

- **Mi camino:** próximas unidades simuladas, intervalos de llegada, ocupación y aire acondicionado del escenario.
- **Planear viaje:** busca origen y destino por nombre, alias o municipio, o recorre la lista de estaciones de Metrorrey; compara menos tiempo, menos afluencia o menos transbordos. Explica la continuidad L2–L3 en Zaragoza.
- **Estaciones:** búsqueda por nombre, alias y municipio, filtros de línea, pronóstico sintético y accesibilidad explícitamente sin verificar.
- **Rutas y redes:** 207 fichas de servicios, variantes y ampliaciones; búsqueda por número o municipio, filtros de red y estado, 12 mapas de autobús y fuentes fechadas. Disponible en Estaciones → Rutas y redes.
- **Mi movilidad:** estaciones y trayectos guardados en el dispositivo, acceso al proveedor oficial Urbani y medios de pago de Metrorrey.
- **Modo parada:** `/?kiosk=1&locked=1&station=padre-mier` para un módulo dedicado, interfaz de consulta con lectura en voz alta cuando el dispositivo ofrece síntesis de voz. No muestra guardados personales ni permite reportar.
- **Accesibilidad:** texto ampliado, contraste alto, controles con nombre, teclado, diálogos nativos y respeto de movimiento reducido.
- **Sin conexión:** catálogo, planificador, modelo y guardados funcionan localmente. Android incorpora el bundle; la PWA precachea también JavaScript, CSS y fuentes al completar su instalación inicial.
- **Reportes:** formulario con validación y almacenamiento SQLite; no se envía a autoridades ni se convierte en un aviso oficial.

## Qué datos son reales

El catálogo usa **38 ubicaciones únicas** de estaciones de Metrorrey, coordenadas del portal de Datos Abiertos de Nuevo León y el mapa oficial de abril de 2026. Los conteos institucionales por línea pueden contar correspondencias más de una vez. El alias Parque Fundidora se conserva para Arena Monterrey.

**Los arribos, el aforo, el clima de unidad, las incidencias y las duraciones son simulados.** No hay conexión contratada con GPS de concesionarios, sensores, tráfico de Waze o medios de pago. El planificador calcula las líneas 1, 2 y 3 de Metrorrey. El catálogo adicional reúne Muevo León / urbanas IMA, RegioRuta, Transmetro, Ecovía / GMG y troncales e integradas; 12 trazos de autobús se consultan con sus puntos publicados. La L4 y L6 están señaladas en construcción. Las fichas sin orden de paradas y transbordos verificados no se convierten en itinerarios. No hay saldos ficticios, cargos, NFC ni boletos válidos.

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

La URL se incorpora durante la compilación, debe usar HTTPS y no debe contener credenciales. El backend debe permitir el origen `https://localhost`. No se permite HTTP global ni se carga la aplicación desde un servidor remoto. [Compilación, kiosco y firma](docs/android.md).

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

Montserrat e Inter se sirven localmente bajo SIL OFL; sus licencias se incluyen en `public/licenses/` y en el APK. Los colores de las líneas proceden del mapa oficial; la identidad verde, piedra y ocre se inspira en el paisaje de Nuevo León y no pretende ser una marca del gobierno. La base geográfica de Monterrey usa un extracto de OpenStreetMap empaquetado localmente, con atribución ODbL; se muestra al abrir el detalle de un trayecto. El recorrido se puede guardar y volver a planear sin internet. [Procedencia y licencia del mapa](src/data/monterrey-map.md). No hay analítica, peticiones a proveedores de mapas, rastreo de ubicación ni petición de cuenta.

## Ejecutar en contenedor

```sh
docker build -t regiomovil .
docker run --rm -p 127.0.0.1:3001:3001 -v regiomovil-data:/data regiomovil
```

Para un servicio público faltan el dominio HTTPS, respaldo del volumen, monitoreo y política de moderación de reportes. Para pasar de simulación a información operativa hacen falta acuerdos de datos, validación con sensores/GPS, medición de frescura y pruebas con pasajeros. El contrato propuesto para fuentes reales se documenta en la API.

## Próximas iteraciones

El catálogo y los mapas de las nuevas redes ya están integrados. Consulta [cobertura, fuentes y límites](docs/integracion-rutas.md). La validación de sentidos, secuencias, transferencias y datos operativos para calcular viajes de autobús continúa como [trabajo pendiente](docs/proximas-iteraciones.md).
