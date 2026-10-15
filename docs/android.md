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

En el emulador, `localhost` representa el propio Android. Para consultar el backend de una computadora se necesita un endpoint HTTPS alcanzable desde Android. El servidor web de desarrollo HTTP puede probarse en el navegador, pero el APK mantiene su política HTTPS. No cambiar globalmente `usesCleartextTraffic` ni añadir una URL de desarrollo permanente a Capacitor.

La aplicación solicita únicamente `INTERNET`; seleccionar una estación no requiere ubicación, cuenta, cámara ni contactos. El modo avión permite comprobar la consulta y planificación locales. Los reportes requieren conexión a la API.

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
