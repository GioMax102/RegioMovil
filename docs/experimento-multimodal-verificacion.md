# Verificación de la rama multimodal

Fecha: **15 de octubre de 2026**, America/Monterrey. Rama: `codex/movilidad-multimodal`.

## Resultado

- `./regiomovil build`: TypeScript y producción correctos. Red experimental de 15 líneas/recorridos y 1,054 puntos publicados; L4/L6 y servicios sin geometría quedan fuera del cálculo.
- `./regiomovil test`: **96 pruebas aprobadas, cero fallos**. Incluyen nueve casos del motor, cinco flujos de la interfaz multimodal, tres casos del worker, búsqueda de lugares, API y regresiones del planificador original.
- `node scripts/android-build.mjs --skip-web --offline`: APK debug compilado; los 34 archivos web empaquetados coinciden con sus huellas de `dist`. No hay assets web adicionales obsoletos y la comprobación de integridad ZIP es correcta.
- `./gradlew :app:lintDebug --no-daemon --max-workers=2`: correcto; **0 errores y 9 advertencias**, correspondientes a actualizaciones disponibles y recursos heredados de la plantilla. La primera ejecución sin conexión necesitó descargar `lint-gradle` de Google; la revisión posterior con esa dependencia terminó correctamente.
- `apksigner verify --verbose`: firma debug v2 válida. APK de **4,672,310 bytes**, SHA-256 `7facf970a9650f4100ee7f5537ab619c946c9beeb53ea48413f3b0a3ddb15743`.

El APK y sus metadatos están en `output/android/`. El código de ubicación usa un plugin local de Capacitor y LocationManager, sin añadir servicios de Google ni seguimiento en segundo plano. El manifiesto sólo añade permisos de ubicación en primer plano y no exige hardware GPS para instalar la aplicación.

## Flujos observados

En el navegador de producción local se calculó UANL Mederos–Universidad con RegioRuta A, una conexión a pie y L2. Se consultó realmente «Parque Fundidora, Monterrey» mediante `/api/places`: respondió Nominatim y se generaron alternativas hasta el lugar elegido. Cambiar a «Menos transbordos» actualizó las opciones sin volver a pulsar Buscar.

Se revisó el mapa en formato móvil, sin desbordamiento horizontal; el diálogo desplaza su propio contenido y mantiene el documento con `position: fixed` y `overflow: hidden`. Al guardar las estaciones, el detalle se cierra, se muestra confirmación y se restaura el desplazamiento. Evidencia: `output/qa/movilidad-multimodal.jpg`.

Las pruebas automatizadas comprueban GPS simulado solicitado sólo al pulsar, guardado sin coordenadas personales, caché local para bus y Metro, rechazo de lugares/GPS sin conexión, limpieza de extremos de lugares al perder la red y recuperación del estado de carga. El worker conserva sólo una búsqueda activa y la última prioridad pendiente; un fallo de carga rechaza las siguientes solicitudes inmediatamente. La batería anterior de Metro comprueba también guardado/cierre, prioridades automáticas, respuestas fuera de orden y diálogos anidados en StrictMode.

## Rendimiento y límites

El precache inicial ocupa **603,777 bytes (589.6 KiB)**, dentro del límite de 600 KiB. El catálogo y el experimento son módulos diferidos: sus assets se conservan al abrirlos, mientras la instalación inicial mantiene la red Metro, fuentes y mapa local. El artefacto multimodal adicional ocupa 641.0 KiB de JSON y 85.6 KiB con gzip. Android incluye todos esos archivos desde la instalación.

El benchmark aislado documentado obtuvo mediana de 36.0 ms y p95 de 45.9 ms sobre nueve consultas en un Intel i7-13620H con Node 24.19.0. Durante la suite completa final, en paralelo con Android, obtuvo mediana de 48.1 ms y p95 de 63.5 ms. Estas cifras describen el motor en esta computadora; no miden un dispositivo económico ni garantizan fluidez de la interfaz Android.

No se inició emulador ni se probó la ubicación o el gesto táctil en hardware Android durante esta actualización. La compilación, Lint y las pruebas web no sustituyen esas comprobaciones. El APK entregado no configura una API remota: permite el modelo local, pero buscar lugares en Android requiere compilar con `VITE_API_BASE_URL` HTTPS. La búsqueda real sí se comprobó en la web contra el backend local.

Los sentidos y el orden de autobuses son hipótesis geométricas; las caminatas no son rutas por banquetas. Los tiempos, afluencia e intervalos son experimentales y no confirman la operación del transporte. Ver [método y cobertura](modelo-movilidad.md), [proveedor y privacidad](lugares-y-privacidad.md).
