# Planear con mapa · 17 de octubre de 2026

Planear permite buscar un lugar o dirección y también elegir directamente un punto para ambos extremos. El mapa centra los lugares encontrados y previsualiza la conexión que corresponde al filtro de resultados activo. Marcar un punto requiere confirmar «Usar este origen» o «Usar este destino»; mientras está pendiente no se puede calcular con los extremos anteriores. Una respuesta de GPS tardía no reemplaza una elección manual posterior.

## Mapa y límites

El mapa de selección usa una proyección Mercator ligera con gestos de arrastre y pellizco, controles de zoom y flechas de teclado. La cámara completa queda dentro del rectángulo de cobertura ZMM: longitud −100.9 a −99.8 y latitud 25.35 a 26.1. Los límites se recalculan para el tamaño de pantalla. Las paradas conservan controles accesibles, con objetivos táctiles de 44 px y agrupación visual para evitar saturación. Al pasar del buscador al mapa se mueve el foco al mapa.

Con internet se consultan exclusivamente los mosaicos de calles visibles de OpenStreetMap. Se respeta su caché HTTP, atribución y [política de mosaicos](https://operations.osmfoundation.org/policies/tiles/); no se descargan zonas ni se guardan paquetes de mosaicos para offline. El WebView Android identifica RegioMóvil en su agente de usuario. Si fallan las calles, el mapa local, los puntos y los trazos permanecen utilizables; el error no alcanza al límite global de React. Sin conexión, confirmar el pin sólo permite elegir una parada oficial cercana; no genera extremos arbitrarios.

El mapa del detalle conserva su base vectorial local y los trazos del transporte. Su fallo al soltar el dedo venía de leer `drag.current` dentro de una actualización diferida de React, después de que pointerup/cancel lo hubieran puesto a null. Ahora se conserva una copia del gesto, se valida pointerId y se restringen todas las actualizaciones. Los datos no finitos y puntos externos se ignoran de forma segura. También admite flechas y zoom por teclado.

## Detalle

El mapa precede al resumen de duración, transbordos y caminata. Los pasos se presentan en una línea de tiempo con minutos y tramos alineados en una columna lateral, evitando grandes bloques de metadatos. Los autobuses mantienen un aviso de sentido pendiente de confirmar, y los detalles metodológicos permanecen en Fuentes y límites.

## Lugares corregidos

«Colonia Las Estaciones» y «Tec de Monterrey» resuelven referencias verificadas de la colonia de Monterrey y el Campus Monterrey en Eugenio Garza Sada 2501. Antes, la primera consulta quedaba vacía y la segunda devolvía un local homónimo de Avenida Revolución. El modelo existente devuelve tres conexiones con Transmetro, Metro y RegioRuta G, sin ampliar sus límites de caminata ni agregar rutas ficticias. Fuentes, coordenadas y reproducción: [Las Estaciones–Tec](las-estaciones-tec.md).

## Verificación

La suite final aprobó 135 pruebas y las compilaciones web y Android debug finalizaron correctamente. La firma APK v2 se verificó. El APK pesa 5,177,878 bytes y su SHA-256 es `6bcb02433a8b2f593579c165baf5115160ee0be35694b1d58167b98329995faf`.

Las pruebas incluyen: selección de ambos extremos en mapa y buscador; confirmación offline mediante ID oficial; resolución de Las Estaciones y Campus Monterrey a través de la API; GPS tardío; coherencia entre el mapa y los filtros; foco al cerrar el selector; cancelación y pérdida de captura; pellizco sin toque accidental; cámara regional en múltiples tamaños; coordenadas inválidas; y degradación ante fallos de mosaicos sin red externa en tests.

Se revisó el flujo en navegador a 390 × 844. La consulta real a la API corregida devolvió los dos lugares y tres conexiones; el mapa y el detalle se mostraron sin pantalla de error. Las capturas y el APK están en `output/qa` y `output/android`, respectivamente. Las mediciones de escritorio y pruebas estructurales no sustituyen evaluación de TalkBack, memoria o rendimiento en un teléfono modesto.

El proveedor de calles recibe las solicitudes de los mosaicos visibles, que revelan aproximadamente la zona explorada. La búsqueda de lugares recibe únicamente el texto confirmado; no se envía el GPS a esa búsqueda. Las coordenadas precisas se calculan localmente y se guardan sólo tras la acción explícita de guardar el trayecto. Los tiempos, esperas y afluencia permanecen simulados y los sentidos de autobús requieren validación operativa.

## Activación del backend en esta sesión

Tras la autorización del usuario se reinició el servidor en localhost:4173, conservando la base de datos existente. Se verificaron API, CORS Android y túnel USB. La consulta al proceso actualizado resuelve «Colonia Las Estaciones» y «Tec de Monterrey · Campus Monterrey» y devuelve tres conexiones con Transmetro, Metro y RegioRuta. El APK de desarrollo conserva localhost:4173. La verificación visual previa se realizó en un proceso separado en localhost:4175 para mantener disponible el servidor principal durante las pruebas.
