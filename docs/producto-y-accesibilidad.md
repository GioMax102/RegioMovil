# Producto, accesibilidad y criterios de aceptación

Estado de referencia: 15 de octubre de 2026. Este documento distingue lo implementado de las metas que todavía deben comprobarse. Una revisión de código o una prueba automática no sustituye la evaluación con personas.

## Valor y alcance actual

RegioMóvil reúne consulta de estaciones, comparación de trayectos, siguientes unidades y pronóstico de afluencia en una interfaz compartida para Android, navegador y vista de parada. Su propósito es explorar decisiones de viaje más claras; no se ha demostrado todavía que reduzca el estrés ni los tiempos de traslado.

El repositorio incorpora interfaz React, paquete Android mediante Capacitor, API Node y persistencia de reportes. El catálogo usa fuentes públicas fechadas de Metrorrey: líneas 1, 2 y 3, con 38 ubicaciones únicas y correspondencias compartidas. La cifra institucional de 40 estaciones y el tratamiento de Zaragoza se explican en [Datos y fuentes](datos-y-fuentes.md).

Existen selección de estación sin GPS, planificación entre estaciones, preferencias de tiempo/afluencia/transbordos, guardados locales, escenarios de demostración, lectura voluntaria del tablero y ajustes de texto, contraste y consumo. La voz depende de las capacidades del dispositivo. El mapa con calles de Monterrey se empaqueta como SVG local y aparece únicamente en el detalle de un trayecto. Evita descargar mosaicos y no ofrece navegación peatonal. Los trayectos guardados se pueden volver a planear sin internet para abrir su mapa. Origen y destino permiten búsqueda por texto y una lista desplazable. Las fuentes tipográficas Inter y Montserrat se empaquetan localmente; son decisiones del diseño, no una identidad oficial del Gobierno estatal.

**Llegadas, ocupación, estado del clima, condiciones y avisos operativos son simulados.** Los modelos se entrenan con muestras sintéticas y no acreditan precisión sobre unidades reales. La accesibilidad física de estaciones y vehículos permanece sin verificar. «Menos transbordos» no significa «ruta accesible».

El modo local calcula con el catálogo incluido cuando la interfaz está disponible. El APK contiene sus recursos; la navegación web sin red requiere que el navegador haya preparado la caché. Los reportes requieren una API alcanzable y se guardan como no verificados: no se remiten a autoridades ni alteran las predicciones. No hay cuenta obligatoria.

## Visión del entregable y trabajo pendiente

La visión integra Metro, Transmetro, rutas urbanas, tráfico e información de unidades. Esta versión planifica Metro y añade un catálogo de autobuses y ampliaciones con 207 fichas y doce recorridos publicados. Las líneas en construcción y los autobuses sin secuencia de paradas y transferencias verificada quedan fuera del cálculo de viajes. No incluye GTFS operativo, GPS, tráfico en vivo, saldo, recargas ni boletos. Urbani y Metrorrey se consultan mediante enlaces externos; no existe una integración comercial o institucional. Ver [alcance de las nuevas rutas](integracion-rutas.md).

Para ofrecer información de servicio real hacen falta acuerdos de datos, telemetría con marcas de tiempo, medición de ocupación, validación de condiciones, estado de elevadores y protocolos de corrección. Hacen falta también mediciones de rendimiento en baja gama, pruebas de accesibilidad, instalación en dispositivos representativos y evaluación con personas. El modo parada es una presentación; el bloqueo del dispositivo y su administración corresponden a una configuración dedicada.

## Las diez heurísticas en comportamientos existentes

Adaptación de las [heurísticas de Jakob Nielsen, Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/). Se documenta la intención del diseño, no una certificación de usabilidad.

| Heurística | Comportamiento implementado |
| --- | --- |
| 1. Visibilidad del estado | Indicador API/local, carga, hora de cálculo y aviso de demostración. |
| 2. Lenguaje cercano | Estaciones reales, municipio, «Desde», «Hacia» y minutos orientativos. |
| 3. Control y salida | Cerrar diálogos, intercambiar extremos y quitar guardados. |
| 4. Consistencia | Misma navegación y distintivos de línea en las distintas vistas. |
| 5. Prevención | Rechazo de origen igual al destino y envío bloqueado mientras se procesa. |
| 6. Reconocimiento | Listas de estaciones, búsqueda por nombre/alias, filtros y favoritos visibles. |
| 7. Flexibilidad | Trayectos guardados, texto grande, contraste y actualización menos frecuente. |
| 8. Información esencial | Detalle de unidad y metodología se abren cuando se necesitan. |
| 9. Recuperación | Mensajes comprensibles, estados vacíos y conservación del reporte si falla el envío. |
| 10. Ayuda contextual | Fuentes fechadas, canales oficiales y explicación de la simulación. |

## Criterios de aceptación que deben verificarse

Los siguientes criterios son una guía de pruebas, **no resultados obtenidos**. Registrar dispositivo, versión, fecha, evidencia y estado de cada criterio antes de declarar conformidad.

### Personas mayores y accesibilidad

- Completar selección de estación, lectura de una llegada simulada, comparación y guardado sin depender de un mapa o de gestos precisos.
- Identificar siempre qué información es simulada y que la accesibilidad física no está verificada, también al usar TalkBack.
- Ofrecer áreas táctiles de al menos 48 × 48 dp en Android; medir la equivalencia efectiva de los controles del WebView. Es una recomendación de [Android Developers](https://developer.android.com/guide/topics/ui/accessibility/apps), no una propiedad asumida por usar botones HTML.
- Medir contraste mínimo de texto normal 4.5:1 y grande 3:1, conservar etiquetas además del color y comprobar foco visible. [WCAG: contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Permitir ampliación del texto al 200 % y lectura a 320 píxeles CSS de ancho sin perder controles o contenido principal. El selector y la lista deben seguir siendo alternativas utilizables al mapa. [WCAG: texto](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [redistribución](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Recorrer navegación, formularios y diálogos con teclado y TalkBack; anunciar errores y restaurar el foco al cerrar. Comprobar también aumento del tamaño de fuente de Android y movimiento reducido.

### Dispositivos de baja gama

- Definir y registrar un equipo de referencia con 2 GB de RAM y WebView compatible. Probar el APK real: no equiparar el mínimo de Android con rendimiento garantizado.
- Meta inicial del proyecto: inicio local utilizable en cuatro segundos y respuesta del planificador local inferior a 500 ms en al menos el 95 % de 30 consultas del equipo de referencia. Medir y ajustar el presupuesto con evidencia.
- Tras preparar la instalación/caché, arrancar en modo avión, consultar estaciones, calcular un trayecto y recuperar guardados; los reportes deben explicar la falta de conexión y conservar el texto.
- Verificar que «Ahorrar datos» modifica el intervalo de 60 a 180 segundos y que una pestaña oculta no inicia solicitudes del tablero. Medir transferencia, memoria y batería en una sesión de 30 minutos antes de afirmar ahorro cuantificado.

### Módulo de parada

- Abrir la estación configurada en vertical y horizontal. Leer nombre, dirección, afluencia y condición simuladas a la distancia de uso del módulo real.
- Mantener visible la condición de demostración y evitar interpretar «API conectada» como conexión con el operador.
- Comprobar luz exterior, reflejos, altura, alcance desde silla de ruedas y comprensión sin audio. La lectura en voz alta será voluntaria y no expondrá información personal.
- Validar la configuración de dispositivo dedicado, recuperación tras corte eléctrico y pérdida de red. El usuario público no debe acceder a guardados de otra persona ni salir a ajustes administrativos; la vista visual por sí sola no cumple este requisito.

## Evaluación futura con personas

Realizar dos ciclos formativos con participantes de la ZMM que usen transporte público, incluyendo personas mayores, baja visión, movilidad reducida, poca experiencia digital y usuarios de teléfonos de baja gama. Los perfiles pueden coincidir. Obtener consentimiento y registrar resultados sin nombres ni datos sensibles.

Usar tareas iguales: encontrar una estación conocida por su alias, interpretar una unidad simulada, comparar alternativas, corregir un destino y consultar una limitación de accesibilidad. Evaluar Android y parada por separado. Registrar éxito sin ayuda, tiempo, errores, comprensión y esfuerzo percibido; una encuesta aislada no demuestra utilidad.

Meta formativa propuesta: al menos 80 % de tareas completadas sin intervención y ninguna confusión crítica entre simulación y operación real. Un estudio pequeño detecta problemas, no representa estadísticamente a toda la población. Corregir los hallazgos y repetir antes de declarar la aplicación accesible, intuitiva o apta para un despliegue público.

## Viajes cotidianos y jerarquía visual

Planear usa un único buscador de lugares, direcciones y paradas para ambos extremos. Los filtros Metro, Autobús y Metro + autobús actúan sobre los resultados sin cambiar esos extremos. El acceso de Inicio dirige al mismo planificador. Los paquetes de hasta ocho alternativas se guardan por acción explícita, con etiqueta y fecha, y se abren desde Guardados sin volver a buscar el destino. Los colores usan blanco limpio, menta y esmeralda; los tiempos, la prioridad seleccionada y la acción principal reciben el énfasis. Fuentes y supuestos permanecen disponibles en los detalles sin repetir textos largos en cada pantalla. Ver [evaluación de propuestas](iteracion-viajes-cotidianos.md).
