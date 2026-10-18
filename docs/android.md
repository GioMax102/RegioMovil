# Android y módulos de parada

RegioMóvil incluye un proyecto Android real con Capacitor 8. Su interfaz React se empaqueta dentro del APK: el arranque, la red documentada y la simulación local no dependen de descargar una página. El backend Node y la aplicación web viven en este mismo repositorio. Una API HTTPS opcional permite compartir los reportes entre instalaciones.

El paquete es `mx.regiomovil.app`. La configuración nativa usa `minSdk 24` (Android 7.0), `targetSdk 36`, Java 21 y Gradle 8.14.3. Mantener Android System WebView actualizado es necesario; el mínimo del manifiesto no sustituye pruebas de rendimiento en el equipo de destino.

## Compilar

Requisitos: Node 24 o posterior, pnpm, JDK 21 y Android SDK con plataforma 36. Instalar los componentes desde SDK Manager de Android Studio o, si se dispone de la herramienta de línea de comandos:

```sh
sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"
export JAVA_HOME=/ruta/al/jdk-21
export ANDROID_HOME=/ruta/al/Android/Sdk
pnpm install --frozen-lockfile
node scripts/android-build.mjs
```

El script localiza también un JDK 21 de la caché de Gradle si `JAVA_HOME` no está definido. Compila TypeScript y Vite, finaliza el bundle con `scripts/finalize-web.mjs`, ejecuta `cap sync android`, compila con el wrapper y entrega:

- `output/android/regiomovil-debug.apk`: APK instalable de desarrollo.
- `output/android/regiomovil-debug.apk.sha256`: integridad del archivo.
- `output/android/build-info.json`: versión, tamaño, fecha, hash, API configurada y huella SHA-256 de cada recurso web empaquetado.

Usar `--skip-web` solamente después de compilar la versión actual de la interfaz. `--offline` indica a Gradle que use dependencias ya descargadas; no elimina el requisito de instalarlas en la primera compilación. En entornos con directorios de usuario de solo lectura, configurar `GRADLE_USER_HOME` a una carpeta escribible. No se necesitan modificaciones de las fuentes de Capacitor.

El script verifica que los recursos copiados a Android coincidan exactamente con `dist` y que el bundle no cambie durante la compilación. Si otra tarea modifica `dist`, la compilación se detiene antes de reemplazar el APK entregable para evitar distribuir una interfaz anterior.

El APK debug utiliza una firma de desarrollo. Para distribución formal, generar un Android App Bundle firmado desde Android Studio y custodiar la clave fuera del repositorio. El tipo `release` ya activa reducción de código y recursos. No distribuir la firma debug como una versión de producción.

## API de producción

```sh
VITE_API_BASE_URL=https://api.ejemplo.mx node scripts/android-build.mjs
```

Sustituir el dominio por una API desplegada con un certificado TLS válido. La variable se fija durante la compilación; cambiarla requiere reconstruir el APK. No es una credencial: nunca incluir secretos en variables `VITE_*`.

El servidor admite el origen Android `https://localhost` entre sus orígenes predeterminados. Si se configura una lista propia, incluirlo explícitamente:

```sh
CORS_ORIGINS=https://localhost,https://regiomovil.ejemplo.mx pnpm start
```

Publicar Node detrás de un proxy HTTPS. No exponerlo con CORS `*`. El proyecto bloquea HTTP sin cifrar tanto en el manifiesto como en la configuración del WebView. `server.url` está ausente intencionalmente: el APK siempre abre su propio bundle y conserva el modo local si el servidor no responde. Sin API, los reportes compartidos no están disponibles; las llegadas y ocupación continúan identificadas como simulación.

## Emulador o dispositivo

Abrir el proyecto mediante `pnpm android:open`, seleccionar un dispositivo desde Android Studio e instalar el APK, o utilizar ADB:

```sh
adb install -r output/android/regiomovil-debug.apk
adb shell am start -n mx.regiomovil.app/.MainActivity
```

En el emulador, `localhost` representa el propio Android. Una API publicada usa HTTPS; para probar el backend de esta computadora existe la modalidad debug por túnel ADB descrita al final. No cambiar globalmente `usesCleartextTraffic` ni añadir una URL de desarrollo permanente a Capacitor.

En esta rama experimental el manifiesto incluye `INTERNET`, `ACCESS_COARSE_LOCATION` y `ACCESS_FINE_LOCATION`. Seleccionar una estación no solicita ubicación; el permiso aparece sólo al pulsar «Usar mi ubicación» en el modelo multimodal. Un plugin local usa LocationManager para obtener una sola posición en primer plano, con cancelación al salir y límite de veinte segundos. No requiere Google Play Services, servicio de fondo, cuenta, cámara ni contactos. La lectura aproximada también se admite si alcanza una precisión útil; de lo contrario se ofrece elegir una parada. El modo avión permite comprobar la planificación local entre puntos oficiales. Los reportes y la búsqueda de lugares desde Android requieren una API HTTPS configurada.

Conviene compilar antes de arrancar el emulador cuando la computadora tiene poca memoria. El tamaño del APK y el arranque en emulador no demuestran autonomía, fluidez o consumo de memoria de un teléfono económico; esos criterios requieren medición sobre dispositivos físicos de destino.

## Módulo estático en una parada

La misma interfaz ofrece «Modo parada» y acepta `?kiosk=1&station=padre-mier` para una vista previa con botón de salida. El modo dedicado añade `locked=1`: excluye acciones personales, no carga guardados locales y oculta la salida de la interfaz. En un APK instalado, un administrador abre ese modo dedicado mediante los extras de lanzamiento:

```sh
adb shell am start -n mx.regiomovil.app/.MainActivity --ez kiosk true --es station padre-mier
```

El extra `kiosk=true` abre `?kiosk=1&locked=1`, mantiene encendida la pantalla de ese módulo y conserva el identificador `station` si se proporciona. `station` acepta un identificador de la red incluida (letras minúsculas, números y guiones). Un administrador puede regresar al inicio y restablecer el apagado normal de pantalla con:

```sh
adb shell am start -n mx.regiomovil.app/.MainActivity --ez kiosk false
```

La vista se adapta a orientación vertical u horizontal sin bloquear la rotación. Un parámetro de URL oculta controles, pero no es un mecanismo de seguridad ni configura administración del dispositivo. El bloqueo a una sola aplicación, arranque automático, energía y mantenimiento pertenecen a Android Enterprise/MDM o a la fijación de pantalla de Android. Un despliegue público requiere probar contraste bajo luz exterior, altura y alcance del módulo, lector de pantalla, conectividad y visibilidad de los avisos de simulación.

## Recursos visuales

El icono representa una montaña y un trayecto con dos paradas, en verde y lima. Incluye recursos adaptativos, variante monocromática y PNG para Android anterior a los iconos adaptativos. Se regenera localmente con `python3 scripts/android-icons.py` (Pillow); no depende de una fuente, mapa o imagen remota.

## Verificación de esta entrega

Verificado el **15 de octubre de 2026**, zona America/Monterrey, con JDK 21, SDK 36, Capacitor 8 y el wrapper Gradle del repositorio:

- `node scripts/android-build.mjs --skip-web --offline`: correcto. El APK debug actualizado ocupa 4,401,698 bytes (4.20 MiB). Su SHA-256 y fecha se guardan junto al archivo.
- `./gradlew :app:lintDebug :app:assembleRelease --no-daemon --max-workers=2 --offline`: correcto. Android Lint reporta **0 errores y 9 advertencias** sobre actualizaciones disponibles y recursos de la plantilla sin uso. El release con R8 y reducción de recursos compila; el APK unsigned resultante ocupa 1,042,292 bytes y requiere la firma de distribución.
- `apksigner verify --verbose`: firma debug APK Signature Scheme v2 verificada.
- Inspección del APK: el `index.html` empaquetado coincide con el bundle final, no incluye sourcemaps ni `server.url`, mantiene `allowMixedContent=false` y conserva sus fuentes e iconos locales. El manifiesto declara `INTERNET` y un permiso interno de firma de AndroidX, sin ubicación ni otros permisos personales.

Se comprobó instalación y arranque de una compilación intermedia en un emulador Android 37.1, y la interfaz cargó sin API remota. La prueba visual detectó una transición de tema incorrecta que se corrigió con `SplashScreen.installSplashScreen` antes de `super.onCreate`; el código corregido pasó las compilaciones debug, release y Lint. El APK final no se volvió a ejecutar visualmente: el emulador efímero se cerró por presión de memoria de la computadora. Quedan pendientes mediciones y pruebas de accesibilidad sobre teléfonos económicos, tabletas y el hardware físico de las paradas.

## Referencias técnicas

- [Capacitor: actualización y requisitos de Android 8](https://capacitorjs.com/docs/updating/8-0).
- [Capacitor: entorno Android](https://capacitorjs.com/docs/getting-started/environment-setup).
- [Android: configurar dispositivos dedicados](https://developer.android.com/work/dpc/dedicated-devices).
- [AndroidX: inicialización de SplashScreen](https://developer.android.com/reference/androidx/core/splashscreen/SplashScreen).

## Correcciones visuales móviles del 15 de octubre de 2026

Se configuró SystemBars con insets CSS de Capacitor y un fondo fijo para la barra de estado, también al desplazar contenido. La top nav reserva separación y controles de 44 px. La selección de la bottom nav comparte celda con su icono; «Mi movilidad» usa «Guardados» en móvil para mantener todas las etiquetas en una línea.

La gráfica destaca el mínimo entre las horas visibles, incluidos empates. Origen y destino abren búsqueda por nombre, alias o municipio y una lista desplazable. El mapa real de Monterrey se empaqueta como SVG local con atribución OpenStreetMap/ODbL y aparece solo al abrir el detalle de un trayecto; los guardados se pueden volver a planear sin conexión.

Verificación: TypeScript, build web, 42 pruebas automatizadas y compilación del APK debug correctos. Se comprobó el flujo en navegador móvil, el mapa sin conexión y anchos de 320, 360, 412, 768 y 1440 px sin desbordamiento horizontal. El APK conserva su firma debug v2 y sus assets coinciden con el bundle final. No había dispositivo ni emulador conectado; queda pendiente verificar visualmente los insets del sistema sobre el teléfono físico.

También se verificó en navegador una recarga completa sin conexión antes de abrir el primer mapa. Se corrigió la recuperación de assets públicos precargados cuando las solicitudes CORS incluyen `Origin` y el servidor declara `Vary: Origin`; las respuestas de API continúan fuera de la caché.

## Actualización del catálogo de ambas redes

La compilación posterior a la integración de autobuses y ampliaciones de Metrorrey incluye 207 fichas y doce mapas de autobús. `node scripts/android-build.mjs --skip-web --offline` completó correctamente y generó un APK debug de **4,420,910 bytes**, con firma v2 válida. Se compararon los 27 archivos web dentro del ZIP con las huellas de `dist`: todos coinciden, incluidos catálogo y mapas. El SHA-256 final es `90613ad151a29cd502847c9059120e4d7696ee9baf19919dc5c20f38d7eb2aaf`.

Las 59 pruebas automatizadas pasan. Se comprobó el catálogo y el detalle de mapa en navegador móvil y de escritorio; esta actualización no se ejecutó en Android físico ni en emulador. Los límites y los comandos comprobados están en [verificación](verificacion.md).

## Compilación de la rama experimental multimodal

La entrega posterior de `codex/movilidad-multimodal` incluye la red adicional, el worker, búsqueda de lugares mediante API HTTPS y lectura de ubicación bajo petición. APK debug: **4,672,310 bytes**, firma v2 válida y SHA-256 `7facf970a9650f4100ee7f5537ab619c946c9beeb53ea48413f3b0a3ddb15743`. Sus 34 archivos web coinciden con `dist`, sin recursos obsoletos. Compilación y Lint correctos (0 errores, 9 advertencias); 96 pruebas automatizadas aprobadas.

El APK conserva el modo local sin API remota configurada; para buscar lugares reales se necesita `VITE_API_BASE_URL` durante el build. Las limitaciones de hardware pendiente y la evidencia web están en [verificación del experimento](experimento-multimodal-verificacion.md).

### Probar desde Android Studio con el backend de esta computadora

Conecta el teléfono por USB con la depuración USB activa. En una terminal deja el backend escuchando sólo en la computadora:

```sh
HOST=127.0.0.1 PORT=4173 ./regiomovil start
```

En otra terminal genera el APK debug con la API local y conecta el dispositivo:

```sh
./regiomovil android --dev-local-api
./regiomovil android-connect
```

`android-connect` encuentra ADB desde el SDK o `PATH`, comprueba que el teléfono esté autorizado, valida la API y sus permisos CORS para `https://localhost`, crea el túnel y comprueba que ADB lo haya registrado. Si hay varios dispositivos, selecciona uno con `./regiomovil android-connect --serial SERIAL`; `adb devices` muestra sus identificadores. También admite `ANDROID_SERIAL`.

Después pulsa **Run** en Android Studio o instala `output/android/regiomovil-debug.apk`. El teléfono verá el backend como `localhost:4173` por el túnel USB. El permiso HTTP queda limitado al hostname `localhost` y a la variante debug; la compilación normal sigue requiriendo HTTPS. Mantén el backend abierto y repite `./regiomovil android-connect` después de desconectar o reiniciar ADB. Para validar el flujo, abre **Planear**, busca cualquier lugar o dirección como origen y destino y pulsa **Buscar rutas**. Los filtros de transporte aparecen en los resultados.

La API se fija al compilar la web: **Run** recompila el proyecto nativo, pero no ejecuta Vite. Repite `./regiomovil android --dev-local-api` después de cambiar la interfaz o su API. Esta opción reconstruye siempre el bundle y no admite `--skip-web`. Si tienes una API de producción en `.env`, usa la compilación normal o retira esa variable de tu configuración local antes de seleccionar esta modalidad. `--offline` sólo cambia la resolución de dependencias de Gradle: la app sigue pudiendo conectarse al backend.

El túnel permite que la app acceda al backend, y el backend necesita internet para buscar lugares reales. No comparte automáticamente la conexión de datos del teléfono con esta computadora. Las rutas entre puntos oficiales siguen calculándose localmente.


## Iteración de viajes cotidianos

Se actualizó la interfaz y el planificador con búsqueda inicial de lugares, etiquetas y paquetes explícitos de hasta tres alternativas con mapa. Los guardados se consultan y eliminan sin internet; las búsquedas nuevas de lugares requieren la API. Pasaron 105 pruebas, compilación web, firma APK v2 y comprobación de assets. El APK de esta iteración conserva la API de desarrollo local `http://localhost:4173` y el flujo `android-connect` ya configurado; pesa 4,578,897 bytes. Detalles y límites: [evaluación y verificación](iteracion-viajes-cotidianos.md).

## Buscador unificado de lugares y autobuses · 16 de octubre de 2026

Planear acepta lugares, calles y direcciones en ambos extremos; los filtros de transporte se aplican después del cálculo. Red ampliada a 54 servicios y 3,417 puntos publicados, con hasta ocho alternativas distintas. El APK debug actualizado conserva la API local por USB. Consulta la [verificación y sus límites](buscador-multimodal-20261016.md).

La iteración del 17 de octubre agrega selección por pin en mapa, exploración limitada a ZMM y detalle compacto. [Verificación, conexión al backend y límites](mapa-y-planear-20261017.md).
