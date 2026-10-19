# Verificación de la candidata 1.1.0 · 19 de octubre de 2026

## Acceso a Red de transporte

Se reprodujo el fallo en el navegador: Inicio abría desde caché, pero el servidor local del puerto 4173 no estaba escuchando. La descarga diferida de `NetworkExplorer` fallaba y su rechazo alcanzaba el límite de errores global, que sustituía toda la aplicación por «Volvamos al camino».

La descarga de Red ahora contiene el error dentro de esa sección y conserva la navegación y el acceso a las estaciones de Metro precargadas. «Volver a intentar» recarga expresamente el documento y regresa a Red mediante `?page=stations`: los navegadores conservan un rechazo de importación ESM dentro del documento original. No se eliminan guardados ni se fuerza una recarga automática. El mapa también permite reintentar su documento público sin salir de la sección.

El instalador PWA incluye el código, estilos y dependencias estáticas de Red en su caché. El SVG de mapa pesado y los documentos de rutas continúan descargándose al consultarlos; no se promete información completa sin haberla descargado antes. Planificación y guía continúan diferidas. No se añadieron dependencias, credenciales ni permisos.

## Evidencia comprobada

- **236 pruebas aprobadas**, incluidas descarga interrumpida, navegación conservada, resultados tardíos descartados, recuperación del mapa, enlace de reanudación, caché inicial de Red y validadores del paquete de publicación.
- Compilación TypeScript y web correctas. Instalación inicial de **557 KiB**, bajo el presupuesto de 600 KiB.
- En un servidor aislado en 4174 se retiró el módulo de Red de una copia de los recursos. La interfaz mostró el error local; después de restaurarlo, el reintento abrió directamente mapa y catálogo de **214 rutas**. Esta prueba no alteró el servidor principal ni datos personales.
- En el servidor principal se abrieron Red, selección de Línea 1 y mapa ampliado a 390×844; se revisaron marcadores de estaciones, trazo, atribución y cierre del diálogo. Se restauró el tamaño normal del navegador.
- Capturas: `output/qa/red-corregida-escritorio.png` y `output/qa/red-corregida-movil.png`.

## Preparación y límites

La candidata usa versión 1.1.0 y código Android 2. El empaquetador exige API HTTPS pública, revisión Git limpia e integridad coincidente de web y APK; sus artefactos e identificador de commit quedan en `output/publicacion/1.1.0/release-manifest.json` tras ejecutar el procedimiento de [publicación](publicacion.md).

Las pruebas de navegador y JSDOM no acreditan instalación o actualización en un teléfono. Falta validar conservación de guardados sobre el APK anterior, GPS en recorrido y TalkBack en un dispositivo físico. No se han verificado de nuevo los paneles de Pages/Render ni se ha publicado esta candidata.
