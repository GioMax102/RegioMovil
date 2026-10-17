# Buscador unificado y conexiones de autobús

Verificación del 16 de octubre de 2026 en la rama `codex/movilidad-multimodal`.

## Comportamiento

Planear utiliza el mismo selector para ambos extremos: nombre de lugar o negocio, calle, dirección, estación o parada. Las sugerencias del catálogo se filtran al escribir y toleran acentos y errores pequeños, incluido «Sab bernabé». Buscar o Enter confirma la consulta externa de lugares de la ZMM. No se hace autocompletado externo, conforme a la política del proveedor público. La dirección completa permite distinguir resultados; seleccionar un lugar conserva su coordenada, sin sustituirlo por una estación de Metro.

Después de calcular, los filtros Todas, Metro, Autobús y Metro + autobús muestran las alternativas correspondientes sin modificar los extremos ni pedir otro envío. Cambiar la prioridad actualiza el cálculo. El motor busca hasta ocho secuencias distintas de servicios dentro de límites de caminata, transbordos y expansiones. No ofrece una enumeración exhaustiva de todos los recorridos de la ciudad y comunica cuando se agota su presupuesto.

La red calculable contiene 54 servicios: tres líneas de Metro y 51 recorridos de autobús —30 Transmetro, 13 IMA, siete RegioRuta y uno GMG—, con 3,417 registros de puntos publicados. El catálogo informativo contiene 214 fichas; una ficha sin puntos y geometría utilizables no habilita por sí sola el cálculo. Fuentes, mapas, fecha y reglas de importación: [cobertura de autobuses](cobertura-autobuses-20261016.md).

## Caso San Bernabé → Punto Valle

En el navegador, la consulta «Sab bernabé» permitió seleccionar San Bernabé L1. La búsqueda de Punto Valle devolvió su domicilio público de Río Missouri 555, Del Valle, San Pedro Garza García. Buscar rutas encontró cinco opciones: cuatro con Metro y autobús, y una de autobuses. Aparecieron Cuauhtémoc–Centro–Chipinque, su servicio Directo, Cuauhtémoc–San Agustín–Gómez Morín y conexiones con Ruta 130. El primer mapa conservó San Bernabé y Punto Valle como extremos y separó Metro, autobús y enlaces a pie.

Elegir Metro mostró cero opciones de ese tipo conservando el destino; Ver todas las rutas restauró las cinco opciones sin recalcular. El proveedor externo real respondió también para Parque Fundidora y Avenida Lázaro Cárdenas, Monterrey, mostrando nombre, colonia y municipio cuando están publicados. Las capturas están en `output/qa/`: `san-bernabe-punto-valle-resultados.jpg`, `san-bernabe-punto-valle-mapa.jpg`, `buscador-lugares-monterrey.jpg` y `buscador-calles-monterrey.jpg`.

## Verificación técnica

- Suite completa de aplicación, API, datos, motor, guardados y funcionamiento offline: 116 pruebas aprobadas en la ejecución final.
- Regresiones para ambos extremos arbitrarios, filtros sin otro envío, alias San Bernabé, trayecto a Punto Valle y exclusión de ciclos en alternativas.
- Regresión para CSS diferido y API desde localhost:4173 y 127.0.0.1:4173; otros orígenes continúan rechazados. Esto corrige la pantalla de error al abrir el planificador desde ese puerto.
- Compilación web y Android debug correctas; firma APK v2 comprobada. El APK contiene los 54 servicios y 3,417 puntos, la búsqueda unificada y el aviso de sentido pendiente de confirmar.
- Paquete inicial web de aproximadamente 480 KiB sin comprimir. Modelo, mapa y planificador se cargan bajo demanda. El modelo completo ocupa 2,059.3 KiB en JSON y 273.3 KiB en gzip. El servidor activo confirmó HTTP 200 con Content-Encoding: gzip, 279,859 bytes y CORS para localhost:4173. El umbral de compresión admite documentos públicos de hasta 4 MiB; las respuestas personales conservan no-store.
- Nueve consultas deterministas del motor en Node 24 sobre Intel i7-13620H: mediana 128.6 ms y p95 145.1 ms durante la suite. No mide rendimiento, memoria ni consumo energético de un teléfono modesto.
- Revisión visual móvil con viewport 390 × 844, sin desbordamiento horizontal del contenido. No equivale a una evaluación de TalkBack en Android.

## Android y conexión

El APK de desarrollo usa `http://localhost:4173`. Deja el backend activo y ejecuta `./regiomovil android-connect` con el teléfono conectado por USB antes de Run en Android Studio. Esta verificación no pudo instalarlo porque no había un dispositivo ADB conectado. El artefacto se entrega en `output/android/regiomovil-debug.apk`; pesa 5,168,521 bytes y su SHA-256 es `8425fedc62b96e0262ff788124dcd94bd4c82ea6eb5f0a1e6fa785c97adf4e7e`. La configuración está en `output/android/build-info.json`. [Guía Android](android.md).

## Límites visibles

Los tiempos, afluencia y condiciones siguen siendo simulados. El orden y sentidos de los autobuses necesitan validación operativa; la interfaz lo indica en cada paso pertinente y en Fuentes y límites. Las caminatas son enlaces aproximados, sin instrucciones por calles ni confirmación de accesos. El buscador depende de la cobertura y disponibilidad de su proveedor; no garantiza un directorio completo de todos los negocios.

Sin conexión sólo se generan nuevos recorridos entre estaciones o paradas oficiales del catálogo local. Los paquetes guardados explícitamente pueden consultarse con sus mapas y hasta ocho alternativas sin buscar nuevamente lugares. GPS y nuevos lugares requieren conexión; sus coordenadas no se envían al buscador ni se guardan automáticamente. [Proveedor y privacidad](lugares-y-privacidad.md).
