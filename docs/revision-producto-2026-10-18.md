# Revisión de producto · RegioMóvil

Trabajo local sobre `fixes`, 18 de octubre de 2026. No se modificaron las versiones públicas de Pages, Render ni GitHub Releases.

## Problemas y prioridades

| Prioridad | Problema observado | Cambio |
| --- | --- | --- |
| Alta | La guía podía parecer conectada al esperar el GPS; una reanudación reutilizaba brevemente una posición y evidencias anteriores. | Estados explícitos; al reanudar se exige una lectura nueva, conservando etapa y progreso. La pausa libera la suscripción. |
| Alta | Un filtro de transporte conservado al cambiar destino podía ocultar todas las nuevas alternativas. | Se restablece al cambiar extremos; cambiar prioridad sigue reordenando sin otra búsqueda. |
| Alta | Los controles manuales quedaban después del mapa y los avisos largos desplazaban la acción siguiente. | Acción y parada primero; pausa, confirmación manual y salida de la guía visibles antes del mapa. |
| Media | Inicio repetía títulos y el pronóstico necesitaba hover para consultar porcentajes. | Accesos claros, valores visibles, hora de menor afluencia del pronóstico mostrado y consejo desplegable. Todo continúa marcado como simulación. |
| Media | Direcciones repetían el nombre; opciones muy parecidas y largas listas de estaciones dificultaban elegir. | Iconos y etiquetas por tipo, subtítulos limpios, deduplicación conservadora y ocho estaciones iniciales con expansión. |
| Media | Ahorrar datos sólo espaciaba actualizaciones; los mapas seguían descargando teselas. | Mapa local en todas las vistas al activar el ajuste o detectar `saveData`; la búsqueda sigue en línea. |
| Media | Había dependencia de `AbortSignal.timeout`, no disponible en algunos WebViews. | AbortController con plazos que cubren el cuerpo de la respuesta y liberan temporizador/suscripción. |
| Media | En horizontal (844 × 390), la barra lateral tenía 878 px de contenido en 390 px sin scroll; Ajustes quedaba fuera de alcance. | Desplazamiento propio y elementos sin compresión para mantener disponibles todos los controles. |
| Media | Falta de CSP, presupuesto excesivo para cálculos y callbacks GPS nativos después de una pausa. | Correcciones detalladas en [la revisión de seguridad](seguridad-calidad.md). |

## Diseño y claridad

- Se conservan Inter, Montserrat, los verdes regionales y la identidad de montaña. Gradientes estáticos y tres trazos SVG aportan textura; no se agregaron imágenes rasterizadas, fuentes externas ni bibliotecas visuales.
- Inicio presenta la acción de planear, los guardados, la red y la información de la estación. Los porcentajes del pronóstico ya se leen sin pasar el puntero.
- Las tarjetas resumen servicios de transporte, tiempo, transbordos y caminata; los pasos se consultan en el detalle. Fuentes, privacidad y explicaciones extensas usan divulgación progresiva.
- El detalle reúne métricas y permite iniciar arriba. Para autobuses sin sentido verificado, el aviso de confirmar abordaje permanece visible antes de iniciar.
- Los enlaces cortos entre vehículos continúan como transbordos; los accesos y caminatas largas permanecen explícitos. No se alteraron datos ni trazos publicados de Nuevo León.
- La guía identifica espera, imprecisión, señal antigua, pausa, avance manual y llegada. No identifica la unidad ni detecta abordaje o bajada. Sólo funciona con la aplicación visible; no se prometen avisos en segundo plano.

## Evidencia y comprobaciones

Las capturas locales se guardan en `output/qa/` (artefactos de revisión, no recursos del producto):

| Archivo | Evidencia |
| --- | --- |
| `fixes-inicio-movil.png` | Inicio claro y acción principal. |
| `fixes-inicio-oscuro.png` | Superficies y legibilidad en oscuro. |
| `fixes-inicio-escritorio.png` | Distribución de Inicio en pantalla grande. |
| `fixes-busqueda-teclado.png` | Nombre alternativo de institución, dirección y precisión; sugerencia visible en un viewport reducido a 390 × 460. |
| `fixes-busqueda-cruce-oscuro.png` | Cruce de Lincoln con Rangel Frías diferenciado de referencias cercanas, en oscuro y con altura reducida. |
| `fixes-detalle-oscuro-texto.png` | Detalle en 320 px con texto ampliado y modo oscuro. |
| `fixes-guia-320.png` | Alternativa manual y aviso de ausencia de GPS en pantalla estrecha. |
| `fixes-ajustes-horizontal.png` | Ajustes accesibles desde una barra lateral desplazable en horizontal. |
| `fixes-modulo-parada.png` | Módulo estático de Padre Mier, sin navegación personal y con operación simulada identificada. |

La reducción de viewport aproxima el espacio disponible con teclado, pero no reproduce un teclado Android real. El navegador de pruebas no entregó una lectura GPS: permitió verificar espera y error con controles manuales, no desplazamiento físico.

Pruebas de interacción integradas: seleccionar una estación como destino, calcular con worker local bajo CSP, comparar alternativas, abrir detalle, iniciar/terminar guía, restaurar foco a Iniciar trayecto, guardar con nombre y cerrar ambos diálogos. Búsqueda real por nombre alternativo de la Procuraduría y consulta de su dirección documentada. No se enviaron reportes públicos de prueba.

Se comprobó ausencia de desbordamiento horizontal a 320 px con texto de 18 px, modo oscuro y movimiento reducido; sugerencias cercanas al campo a 390 × 460; navegación de diálogos mediante Escape, selección de un punto del mapa con flechas y controles con nombres accesibles. El contraste alto se activó con Espacio y eliminó textura/sombra también en oscuro. Ajustes se abrió en 844 × 390 desplazando la barra lateral; se consultó el módulo estático a 1280 × 900. Esto no constituye certificación WCAG ni una auditoría completa con lectores de pantalla.

Verificación automatizada:

```sh
./regiomovil test
./regiomovil build
./regiomovil android --dev-local-api --offline
```

**219 pruebas aprobadas**, sin omisiones ni fallos en la suite final. Las regresiones cubren cancelación y limpieza, esperas del cuerpo HTTP, ahorro de teselas, selección/deduplicación, filtros, permisos denegados, estados GPS, pausa de 60 segundos y evidencia nueva de llegada, foco, transbordos, cabeceras, cuotas, permisos SQLite y contratos nativos. Los contratos de fuentes Java no ejecutan el ciclo de vida Android.

El precache inicial continúa en aproximadamente **493 KiB** (505,291 bytes), con 15 recursos diferidos. Planeador, mapas y guía mantienen carga diferida. El APK debug compila con SDK 36/JDK 21; usa la API local mediante `adb reverse tcp:4173 tcp:4173`. No es una nueva publicación firmada. APK de 5,419,373 bytes, SHA-256 `bee998d00471f25438db201c84b7313a3db5db139b34c9efda7e6962b86e2aca`, guardado en `output/android/regiomovil-debug.apk`.

## Pendiente en teléfono físico y operación

- No había dispositivos conectados en `adb devices -l`. Faltan GPS en movimiento, precisión aproximada, permisos tardíos, bloqueo de pantalla, segundo plano/retorno, ahorro de batería, voz y limpieza de suscripciones del sistema.
- Faltan TalkBack, tamaño de fuente del sistema al 200 %, orientación, teclado virtual real y áreas seguras en distintos fabricantes. Se revisaron las dimensiones web, no todos los dispositivos.
- La experiencia sin conexión tiene pruebas de cachés, datos precargados y guardados; falta una prueba física completa con pérdida y recuperación de red.
- Un módulo público necesita bloqueo y mantenimiento del dispositivo a nivel del sistema operativo; el parámetro de modo parada no es una frontera de seguridad.
- El proveedor de teselas puede conocer el área del mapa consultada. El ajuste Ahorrar datos evita esas solicitudes; el historial GPS no se almacena. Los trayectos guardados incluyen coordenadas sólo tras la acción explícita de guardar y se eliminan desde Guardados.
- Los límites y la cobertura geográfica del buscador siguen siendo los de los datos y proveedores disponibles. No se garantiza la cobertura de Google Maps ni todas las combinaciones operativas posibles.
- Moderación y persistencia de reportes, cuotas detrás del proxy y disponibilidad de proveedores gratuitos siguen pendientes según el informe de seguridad.

Referencias de compatibilidad: [AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static), [saveData y disponibilidad](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData), [reflow de WCAG](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) y [validación de URI en WebView](https://developer.android.com/privacy-and-security/risks/unsafe-uri-loading).
