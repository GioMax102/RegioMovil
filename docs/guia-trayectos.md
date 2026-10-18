# Formulario de ubicación y guía de trayecto · fixes

## Buscar y elegir puntos

El buscador se abre con el campo enfocado y muestra estaciones/guardados inmediatamente. Desde tres letras consulta lugares automáticamente, con debounce de 650 ms, cancelación al editar/cerrar y hasta doce resultados de lugares. El campo y las acciones compactas de mapa/GPS quedan fuera del área de resultados desplazable. `visualViewport` ajusta la altura visible cuando aparece el teclado; no se cambia el tamaño del texto de forma artificial.

Nombre, dirección y tipo/precisión tienen estilos propios y no dependen de que se haya abierto el catálogo. Una calle sin número confirmado abre el mapa para ajustar y confirmar el punto. Una referencia aproximada de campus, edificio o cruce se identifica como tal; no se asegura una puerta o paso peatonal.

Backend, fuentes y límites: [busqueda-lugares.md](busqueda-lugares.md).

## Iniciar trayecto

El detalle de cada alternativa calculada o guardada ofrece «Iniciar trayecto». Esta acción carga la guía y solicita ubicación, sin activar GPS al abrir solamente el detalle. La guía muestra el paso actual, mapa, posición, próxima parada/referencia, avance por distancia y controles para pausar, reanudar, confirmar etapas y terminar. La voz es opcional y usa la API de síntesis del dispositivo/navegador, si está disponible.

El seguimiento compara posiciones GPS con la geometría del paso actual. Rechaza datos viejos (>20 s), precisión peor que 80 m, saltos imposibles y velocidades fuera de rango. No selecciona un paso futuro sólo porque pase por el mismo lugar. Dos observaciones separadas al menos 3 s deben respaldar una llegada. Los cambios de etapa requieren confirmación de la persona: el GPS no demuestra abordaje o bajada.

«Baja en la siguiente estación» sólo se utiliza con Metro, orden verificado, lista completa de estaciones y destino como próxima estación. Con una lista parcial se muestran referencias, sin afirmar un conteo completo. Los autobuses cuyo orden/sentido no está verificado mantienen esa incertidumbre explícita.

La guía puede usarse con trayectos guardados sin internet. Los paquetes nuevos conservan también estaciones intermedias necesarias para nombrar próximas paradas; paquetes antiguos siguen utilizables y, si faltan datos, permiten confirmación manual.

## Privacidad y ciclo de vida

Las coordenadas permanecen en memoria del dispositivo. No se guardan historiales ni se envían GPS al servidor. No se añadieron permisos de ubicación en segundo plano, servicios de seguimiento continuo ni notificaciones push. La voz no recibe coordenadas.

El seguimiento funciona **en primer plano con la app visible**. Al pausar, terminar, cerrar el detalle o pasar la app a segundo plano se liberan el observador de ubicación y la voz. Volver a la app requiere reanudar expresamente. En túneles o sin permiso GPS, la persona puede avanzar por confirmación manual. No se simula movimiento cuando no hay señal.

Android usa el plugin local `RegioLocation` con callbacks y limpieza por identificador; la web usa `watchPosition`/`clearWatch` y necesita HTTPS o localhost. Las notificaciones son indicaciones visuales y voz dentro de la aplicación; no se prometen avisos con pantalla bloqueada.

## Pruebas y revisión

200 pruebas aprobadas en la verificación final integrada: secuencias GPS sintéticas, ausencia de GPS antes de iniciar, permiso denegado, pausa/segundo plano, liberación de suscripciones asíncronas, datos fuera de rango, rutas solapadas, transbordos manuales, paquetes sin conexión y búsqueda de cruces/direcciones. El GPS no se verificó mediante un recorrido físico en esta sesión.

Se comprobó el formulario en navegador a 390×844 y 390×460: la primera sugerencia completa quedó visible con su borde inferior a 340 px en el área reducida. Se calculó un trayecto de Lincoln/Rangel Frías a la Procuraduría (Washington 539) con siete alternativas, entre ellas Metro, Ecovía y autobuses. La compilación nativa Java y el APK debug actualizado fueron satisfactorios.

Para revisar en Android Studio: servidor local en 4173, teléfono conectado por USB y `./regiomovil android-connect` antes de Run. El APK de pruebas se sincroniza con `./regiomovil android --dev-local-api`. La publicación previa en Pages/Render y el APK público no se sustituyen al editar esta rama.

APK de pruebas final: SHA-256 `a6b3d72be62a76b3d87851ed0245ddaee153e220c0708132fcae0e0ac9e6e44a`. No había teléfono o emulador conectado al ejecutar `android-connect`; no se validó movimiento GPS en un dispositivo físico.

Revisión nativa final: una pausa/cierre invalida también las solicitudes de permiso pendientes; al volver no se reactiva el GPS. La primera ubicación tiene un límite de 20 s y su temporizador se cancela al recibirla o al detener la guía.
