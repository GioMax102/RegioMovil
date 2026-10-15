# Verificación del piloto

Comprobación de la integración de ambas redes: **15 de octubre de 2026**, America/Monterrey.

## Resultado reproducible

- `./regiomovil build`: TypeScript y compilación de producción correctos; genera 207 fichas, seis grupos de consulta y doce paquetes geográficos de autobús.
- `./regiomovil test`: **59 pruebas aprobadas, cero fallos**. Incluyen API HTTP, persistencia SQLite, validación de reportes, planificación Metro, continuidad L2–L3, modelos sintéticos, interfaz, consulta sin conexión, presupuesto de descarga y catálogo adicional.
- `node scripts/android-build.mjs --skip-web --offline`: APK debug compilado con JDK 21 y Android SDK 36; sin API remota configurada.
- Inspección ZIP y SHA-256: los **27 archivos web** del APK coinciden con `dist`, incluyendo el catálogo de 207 fichas y los doce mapas. El ZIP pasa la comprobación de integridad.
- `apksigner verify --verbose`: firma debug v2 válida. Tamaño: **4,420,910 bytes**. SHA-256: `90613ad151a29cd502847c9059120e4d7696ee9baf19919dc5c20f38d7eb2aaf`.

El archivo entregable es `output/android/regiomovil-debug.apk`; sus metadatos reproducibles están en `output/android/build-info.json`. El directorio `output` está excluido de Git.

## Flujos adicionales comprobados

Las pruebas de catálogo comprueban fuentes y revisiones por ruta, búsqueda combinada «223 Juárez», filtros, paginación de 24 fichas, navegación de pestañas con teclado, siete servicios RegioRuta y descarga de mapas bajo demanda. La consulta de RegioRuta A se vuelve a abrir con la red deshabilitada en la prueba; su fecha de publicación desconocida se conserva como desconocida.

Se verifican los 1,464 puntos publicados y las coordenadas de los doce paquetes. RegioRuta E dibuja sus dos trazos separados, sin inventar una conexión. Las fichas de L4 y L6 muestran referencias del mapa oficial y su estado fechado de construcción; no producen arribos, geometrías inventadas ni opciones de planificación.

En el navegador local de producción se comprobó la presentación móvil y de escritorio, el filtro RegioRuta, el mapa A, la ficha L6–Aeropuerto y la navegación de pestañas por teclado. Los anchos de viewport solicitados fueron 390 y 1280 px; no hubo desbordamiento horizontal ni avisos o errores de consola. El diálogo del mapa mantiene desplazamiento vertical. Evidencia: `output/qa/regioruta-movil.jpg`.

## Consumo y alcance de la evidencia

El precache principal suma **609,452 bytes (595.2 KiB)**, dentro del presupuesto de 600 KiB. JavaScript comprimido con gzip: aproximadamente 99.4 kB; CSS: 14.3 kB. El catálogo y los mapas de autobús se consultan por demanda en la web y vienen incluidos en Android. Estas cifras no miden memoria, batería o fluidez sobre un teléfono físico.

No se ejecutó esta compilación final en un dispositivo Android ni se inició un emulador durante esta actualización. La compilación y la inspección del APK no sustituyen pruebas de TalkBack, insets del sistema, uso bajo sol o desempeño sobre teléfonos económicos y módulos de parada. Las comprobaciones nativas anteriores se conservan en [Android](android.md).

La operación de unidades, afluencia, condiciones y tiempos continúa siendo simulada. Los autobuses son consultables con fuentes publicadas; sus sentidos, secuencias y conexiones necesitan validación antes de habilitar itinerarios. Ver [cobertura y límites](integracion-rutas.md).
