# Validación de UI, mapas y trayectos — 25 de octubre de 2026

Rama: **fixes**. Entrega local de la continuidad iniciada el 24 de octubre. No se actualizaron Cloudflare Pages, Render ni el APK público.

## Prioridades atendidas

1. Mapa principal y controles sobrepuestos en Planear/Red; panel único para buscar, comparar y consultar detalle.
2. Uso en pantallas pequeñas, teclado, orientación, foco y controles manuales de guía.
3. Menos texto de superficie; conservar fuentes, simulación, pagos y límites mediante información cerrada.
4. Integridad de geometrías, compatibilidad de guardados y presupuesto de carga, sin nuevos SDKs ni dependencias.

## Cambios

| Flujo | Resultado |
| --- | --- |
| Planear | Mapa continuo, panel deslizable y equivalente lateral en escritorio; origen/destino compactos, intercambio entre ambos campos, GPS y pin preservados. |
| Buscar | Sin listado completo inicial; búsqueda explícita y automática con cancelación. Estación exacta antes de coincidencias amplias; preview limpio al editar. Resultados cerca de la entrada. |
| Comparar y detalle | Prioridades y transporte dentro del panel, tarjetas breves con nombres de servicios; detalle dibujado en el mapa superior. Guardar e iniciar siguen disponibles. |
| Seguir | Siguiente acción y controles «Ya bajé» / «Ya llegué»; pausa, detener y alternativa sin GPS. Alcance de primer plano, simulación y fuentes consultables. |
| Red | Búsqueda textual, filtros horizontales, catálogo cerrado y ampliación al tocar/Enter. Un mapa montado y segmentos publicados completos. |
| Metro | Selector de línea junto al buscador, GPS bajo consentimiento, header pequeño con ojo/Maps/guardar. Pronóstico horizontal y llegadas ocultas en horas de cierre. |
| Inicio | Accesos icono+título de trayectos guardados reales, que abren mapa y permiten iniciar. |
| Apariencia | Superficies neutrales opacas, acentos contrastantes, oscuro y movimiento reducido. Sin subtítulos explicativos repetidos. |
| Rendimiento | CSS opcional antiguo fuera del arranque; mapa común en detalles/guardados; sin aumentar presupuestos de carga. |

La búsqueda mantiene la cobertura y los límites del servicio documentado. No garantiza resolver cualquier expresión ni equivalencia completa con Google Maps. No se inventaron fotos, colores físicos, pagos, equipos accesibles ni datos en vivo.

## Pruebas automáticas

Resultado definitivo: **295/295**, 41 archivos, sin fallos ni archivos sin resultados. Registrado en `output/qa/mapas-paneles-20261025/regresiones.json`; incluye cinco nuevas regresiones de foco y una de snapshots antiguos.

Ejecución con Node24, un archivo por proceso y `--test-isolation=none`, tres procesos concurrentes. El runner conserva TAP por archivo y falla si falta el conteo. Copia reproducible: `output/qa/mapas-paneles-20261025/ejecutar-regresiones.mjs`.

Cobertura relevante: arrastre/cancelación/teclado de panel, foco entre formulario/resultados/detalle/guía/guardado, búsquedas tardías/canceladas/IME, GPS denegado y liberación asíncrona, offline/guardados/worker, geometrías inválidas y segmentos separados, ajuste regional/viewport, horarios especiales de Metro, CSP/CORS/validación API/WebView y contraste de paleta.

Build de TypeScript, producción web, presupuesto inicial y sincronización/compilación Android forman parte del cierre. El detalle exacto del APK y la huella de sus recursos están en `output/android/build-info.json` y el log `compilacion-android.log`. APK: `output/android/regiomovil-debug.apk`, API HTTPS `https://regiomovil-api.onrender.com`.

Recursos iniciales: **606087 bytes** frente a600 KiB permitidos; CSS inicial gzip **16239 bytes** frente a16 KiB. No se ampliaron los límites. El margen del CSS es pequeño: mantener las nuevas vistas en carga diferida. Sin errores nuevos de consola durante la comprobación tras recargar la fuente final.

## Verificación visual

Se recorrió con el navegador local y el backend de desarrollo: elegir estación y lugar → calcular alternativas → cambiar prioridad → abrir detalle → iniciar guía sin GPS → confirmar bajada y transbordo → terminar → guardar → abrir desde Inicio. También Red, filtro Metro, ampliación de mapa y ficha de estación.

- **390×844:** formulario, alternativas, detalle, guía y Red.
- **320×740, oscuro y texto grande:** corregidos desbordamientos; documento320 px, panel sin scroll horizontal y workspace termina donde comienza navegación.
- **667×375:** corregido mínimo de altura; workspace termina en305 px, igual al inicio de navegación.
- **390×430:** representación de espacio disponible con teclado; conserva franja del mapa, búsqueda y primera coincidencia. No sustituye teclado Android real.
- **1440×900:** panel lateral y mapa separado de los controles, sin desbordamiento horizontal.

Las preferencias modificadas para QA se restauraron. Las capturas están en `output/qa/mapas-paneles-20261025/`:

| Evidencia | Archivo |
| --- | --- |
| Planear móvil | `planear-movil.jpg` |
| Búsqueda con espacio de teclado | `busqueda-viewport-teclado.jpg` |
| Alternativas y detalle | `alternativas-movil.jpg`, `detalle-movil.jpg` |
| Guía y guardado | `guia-sin-gps.jpg`, `guardado-movil.jpg`, `inicio-guardado.jpg` |
| Red y estación | `red-metro-movil.jpg`, `estacion-movil.jpg` |
| Pantalla pequeña accesible | `planear-320-oscuro-texto-grande.jpg` |
| Horizontal y escritorio | `planear-horizontal.jpg`, `planear-escritorio.jpg`, `red-escritorio.jpg` |

## Seguridad y privacidad: alcance y hallazgos

Revisión estática de componentes cambiados y regresiones existentes; **no es una prueba de penetración, certificación de accesibilidad ni una auditoría nueva de dependencias/infraestructura**. No cambiaron dependencias, backend o configuración nativa en esta tanda. No se hallaron secretos nuevos ni renderizado de HTML crudo en los componentes revisados.

| Severidad | Hallazgo/control | Estado |
| --- | --- | --- |
| Baja, disponibilidad local | Un trayecto antiguo sin segmentos completos podía fallar al usar el mapa estandarizado. | Corregido y probado con snapshot v1 leído desde almacenamiento; conserva la geometría completa de las etapas. No supone inyección ni ataque remoto. |
| Baja, accesibilidad | Pérdida de foco al cerrar búsqueda/guardado/guía y ciertos diálogos; elementos o botones desbordados a320 px con texto grande. | Corregidos y comprobados mediante pruebas de foco y QA visual. |
| Media, privacidad residual | Las teselas OSM revelan al proveedor IP y área consultada; no se envía una secuencia GPS al backend. | Información conservada; Ahorrar datos evita teselas y ofrece mapa local. No se amplió el tratamiento. |
| Media, privacidad residual | Guardados explícitos contienen coordenadas en almacenamiento local sin cifrado propio. | Sólo tras confirmar; eliminables desde Viajes. Persistencia voluntaria preservada y cubierta por regresiones. |
| Control comprobado | GPS explícito, denegación con alternativa manual, pausa al ocultar, liberación al terminar/desmontar y rechazo de callbacks tardíos. | Regresiones aprobadas; ciclo de vida nativo real pendiente en teléfono. |
| Control comprobado | CORS/CSP, límites de solicitudes/cuerpo/proveedor, datos HTML tratados como texto, HTTPS y permisos nativos limitados. | Regresiones existentes aprobadas. No acredita la configuración del despliegue público actual. |
| Media, operación pendiente | Reportes públicos sin moderación, persistencia efímera del piloto y límites por IP detrás del proxy. | Riesgos previos sin cambios; ver `docs/seguridad-calidad.md`. Requieren trabajo separado antes de ampliar operación. |

## Pendiente en teléfono físico

ADB no detectó un teléfono conectado al cierre. El APK de esta tanda está preparado, pero **no se instaló ni se abrió en el celular**. La instalación anterior correspondía al commit2dab6cf.

Falta validar teclado virtual, TalkBack, fuentes del sistema, áreas seguras, rotación real, GPS en movimiento y con pérdida de señal, permiso revocado, Activity/voz y ahorro de batería. No se implementaron ni se prometen avisos en segundo plano.

El servidor local queda disponible en `http://localhost:5173/`; acceso LAN observado `http://192.168.1.3:5173/` mientras la IP y la red se mantengan. Para GPS del navegador se necesita un origen seguro; el APK usa la API HTTPS pública.
