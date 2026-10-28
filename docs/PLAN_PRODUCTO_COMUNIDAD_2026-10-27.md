# Plan de desarrollo y continuidad · mapas, trayectos y comunidad

Fecha: 27 de octubre de 2026. Rama de continuidad: `feature/queja`.
Base inspeccionada: `82b455d`. **Actualización del 28 de octubre:** T1–T4 implementados y en validación; T5 amplía a 191/209 buses, con 18 pendientes. Leer [entrega y límites de verificación](ENTREGA_PRODUCTO_2026-10-28.md). Las anotaciones no se consideran cerradas físicamente por pasar pruebas DOM.

## 1. Instrucción del usuario y alcance

La interacción del 27 de octubre documentó las nueve anotaciones de la revisión en `http://localhost:4173/` y evaluó la operación social de reportes y un sistema aledaño de visión computacional. La implementación posterior y su evidencia están en la entrega del 28 de octubre. No confundir recomendaciones de administración/visión con funcionalidades entregadas.

La referencia anterior sigue siendo [memoria de quejas y cobertura](MEMORIA_QUEJAS_COBERTURA_2026-10-27.md). Este documento manda sobre ella para los nuevos pendientes, sin invalidar su historial. No volver a crear la rama desde `main`; conservar la integración de `fixes`. Commit y push normales están autorizados por el usuario. Un push no instala un APK ni despliega la API.

Evaluación de operación, administración y visión: [modelo de comunidad e infraestructura](MODELO_COMUNIDAD_Y_VISION_2026-10-27.md).

## 2. Registro completo de comentarios

Los identificadores C1–C9 pertenecen exclusivamente a esta revisión; no son los de las rondas previas. Las capturas están en la conversación y no se presume que sus archivos temporales existan en otro chat. Esta tabla conserva su contenido operativo.

| ID | Petición preservada | Trabajo | Evidencia necesaria para cerrar |
| --- | --- | --- | --- |
| C1 | Reportar mientras se sigue una trayectoria guardada. | T2 | Desde Guardados → guía, abrir reporte contextual, cancelar/enviar y volver al mismo paso. |
| C2 | Más área útil de mapa, especialmente arriba; ocultar puntos hasta suficiente acercamiento. | T3 | En vista regional sólo trazos; zoom cercano revela paradas; controles no tapan el encuadre útil. |
| C3 | Completar trazos faltantes y retirar la tarjeta dominante de cobertura. | T5 | Cada una de las 24 rutas auditada; geometrías nuevas verificadas e integradas cuando haya evidencia; catálogo limpio y estado preciso por ficha. No cerrar “24/24” por ocultar la tarjeta. |
| C4 | Al pulsar el mapa, el mapa es toda la pantalla; retirar cabeceras, navegación y Rutas y sistemas; conservar buscador, filtros y controles. | T3 | Un mismo mapa ocupa el viewport, sin tarjeta de detalle; salida por Atrás/Escape/control visible restaura vista, filtros y encuadre. |
| C5 | Mejor padding, márgenes e identidad; invitar proactivamente a colaborar; quitar bloque gris explicativo. | T2 | Tarjeta compacta “Ayuda a mejorar este lugar”, acción principal clara y detalle de reportes bajo demanda. |
| C6 | Marca roja en obligatorios; quitar “(opcional)”. | T1 | Asterisco rojo + semántica accesible en campos realmente requeridos, según destino; consentimiento sigue opcional. |
| C7 | Cámara, galería y archivos en celular; cancelar Archivos no cierra ni borra el formulario. | T1 | En Xiaomi real: cancelar los tres orígenes conserva datos y foto previa; rotación/recreación recupera borrador; volver de cámara funciona. |
| C8 | Distinguir caminar, transporte y transbordo con bloques/franjas; claridad sin sobrecarga ni espacio extra. | T4 | Etapas compactas distinguibles por franja + icono + texto; detalles secundarios desplegables. |
| C9 | Reportar estado de estación, ruta o unidad durante guía de un viaje nuevo. | T2 | Desde Planear → guía se puede elegir destino válido, reportar y continuar sin reiniciar. |

C1 y C9 comparten implementación pero requieren dos recorridos de validación independientes.

## 3. Base real y observaciones de código

- Reportes: `ReportDialog.tsx`, `PublicReports.tsx`, `DeferredReports.tsx`, `reports.css`, `reportPhoto.ts`, `reportsApi.ts`; API/SQLite y CLI en `server/` y `scripts/moderate-report.mjs`.
- El formulario guarda campos en `useState`; no hay borrador duradero. `Dialog` en `Primitives.tsx` cierra por `cancel` y por clic de fondo. No está demostrada la causa exacta del fallo de Archivos: reproducir y distinguir cancelación del selector, propagación de Atrás, desmontaje React y recreación de Activity/proceso.
- Guía en `src/mobility/ActiveJourney.tsx`; contenedores `JourneyDialog.tsx`, `MobilityJourneyDetail.tsx`, `MobilityPlanner.tsx` y `SavedMobilityTrips.tsx`. La guía pausa seguimiento al pasar a segundo plano; respetar ese comportamiento.
- `NetworkExplorer.tsx` tiene `expanded` y abre otro `Dialog` para mapa ampliado. `LocationMap.tsx` mantiene estaciones Metro a escala ciudad y reduce puntos de bus por celdas. Esa regla no satisface C2.
- Itinerario: `MobilityJourneyDetail.tsx`, `journeyPresentation.ts`, `journeyDetail.css`; conservar acciones existentes de transbordo y datos offline.
- Las nueve capturas aportadas son evidencia visual de la revisión. No se ha reproducido todavía en esta ronda el fallo de Archivos ni una solución.
- Cobertura base: 185/209 buses, 3 líneas Metro en grafo, 24 buses pendientes; 214 fichas totales, incluyendo dos líneas en construcción. Ver [auditoría](cobertura-rutas-2026-10-27.md) y `data/route-geometry-coverage.json`.
- APK anterior a este plan compilado e instalado en Xiaomi M2103K19G por USB, con `install -r: Success` y `am start: Status: ok`; contiene quejas de `82b455d`, **no** estas nueve mejoras. Huella de esa compilación: `c4c62d894d555cfffc105432d2e003d40569e6368167dfcf4d26b9909da39930`.

## 4. Secuencia de trabajo

### T1 · No perder un reporte y seleccionar evidencia (prioridad crítica)

1. Reproducir C7 en el Xiaomi con campos completos. Registrar secuencia y eventos de ciclo de vida, sin imprimir texto/fotos privados. Comparar navegador y APK.
2. Crear un borrador versionado con identificador estable, destino exacto y contexto de regreso. Guardar cambios antes de abrir una Activity externa; no depender sólo de `visibilitychange` ni de `beforeunload`.
3. Propuesta de persistencia local: texto/contexto y miniatura/foto procesada en IndexedDB o almacenamiento privado equivalente en nativo. TTL inicial propuesto de 24 horas, borrar al enviar con éxito, descartar explícitamente o caducar; informar “Borrador guardado en este dispositivo”. La duración se documenta en privacidad antes de entregar. No guardar originales, historial GPS ni datos en caché del service worker. Si falla la persistencia/cuota, avisar y preservar lo que siga en memoria.
4. Tres acciones comprensibles: **Tomar foto**, **Elegir de galería**, **Elegir archivo**. En Android evaluar `@capacitor/camera` v8 para cámara/galería y selector de documentos para archivos; confirmar compatibilidad e incorporar sólo dependencias necesarias. En web usar entradas separadas de captura/archivo donde estén soportadas, con alternativa clara.
5. Cancelar selección no es un error de envío ni una orden de cerrar el formulario; no elimina texto ni foto previa. Mantener la foto anterior hasta que la sustituta pase validación. Reutilizar límites y cancelación de `prepareReportPhoto`.
6. Tratar explícitamente `cancel`, Atrás nativo y fondo del diálogo mientras hay un selector pendiente. Evitar un cambio global que rompa los demás diálogos. Al cerrar voluntariamente, conservar borrador recuperable y ofrecer descarte explícito.
7. Restaurar formulario y retorno desde un resultado nativo restaurado. `appRestoredResult` es pertinente si se incorpora el plugin Camera/App; no asumir que restaura por sí solo el estado React ni el `<input type=file>`. No volver a solicitar permisos por cancelación.
8. Añadir idempotencia al envío con una clave de borrador y restricción única en servidor, migración compatible y reintento que devuelva el mismo recibo. El doble toque o la respuesta perdida no debe crear reportes duplicados. No reutilizar una clave ya aceptada para contenido distinto. Sin envío automático de borradores.
9. Etiquetas requeridas: título, descripción, categoría y destino obligatorio según tipo. Estación requerida sólo para `station`; ruta exacta para `route`/`unit`. Foto, referencia y consentimiento sin “(opcional)” ni asterisco. Asterisco rojo decorativo más `required`/`aria-required` y una explicación breve de la marca. Errores asociados al campo y foco en el primer error.

Aceptación: completar datos → abrir cámara/galería/archivos → cancelar → formulario íntegro; elegir imagen → cancelar reemplazo → imagen anterior íntegra; cambio de app/rotación/recreación → recuperación controlada; denegación de permisos no cierra; reintento de envío produce un único registro. Mantener borrador cuando no hay API o se pierde la respuesta.

### T2 · Participación proactiva, incluida la guía (C1, C5, C9)

1. Diseñar una tarjeta compacta con la identidad verde/textura existente: **“Ayuda a mejorar este lugar”** / **“Compartir observación”**. En lugar de párrafos grises y contadores en cero, mostrar la acción y, cuando existan, un resumen discreto con enlace a **Ver reportes**. Mantener carga/error accesibles y reintento sin disfrazarlos como “cero”.
2. Reusar ese patrón en estación/ruta y agregar **“Reportar algo en este tramo”** en la guía, subordinado a “Ya llegué/Ya bajé”. No competir visualmente con la instrucción de avance ni abrir cámara automáticamente.
3. Definir contrato de contexto reutilizable: viaje, paso, `routeId` de catálogo, `stationId`/`stopId`, punto de observación y procedencia de esos datos. Resolver IDs entre grafo y catálogo por mapeo estable; si no hay equivalencia, pedir selección, nunca inferir por código o nombre repetido.
4. En Metro proponer estación de la etapa y confirmar; en bus permitir **parada/recorrido** o **unidad**, con ruta/variante preseleccionadas y número económico independiente. Caminando, ofrecer parada de destino o lugar confirmado: el destino del paso no demuestra dónde está el usuario. GPS reciente y su precisión son opcionales; sin GPS se reporta con selección manual. No convertir una parada bus en estación Metro.
5. Coordinar las capas: el formulario debe quedar por encima de la guía y recibir foco, sin terminarla ni desmontar su estado. Al cerrar/enviar vuelve al mismo paso, mapa y modo pausado; reanudar seguimiento/voz sólo por acción explícita. Conservar este retorno también si Android recrea el proceso, sin recuperar un historial de ubicaciones.
6. Aviso de revisión/consentimiento en el formulario y detalle, con lenguaje breve. Retirar prosa dominante no elimina información necesaria de privacidad o estados.

Aceptación: guía de viaje nuevo y guardado, con/sin GPS, etapa a pie/Metro/bus/transbordo; cancelar o enviar conserva paso y contexto; el fondo no avanza por clic; no hay captura ni publicación automática; accesible con teclado/TalkBack. Si el catálogo ya no contiene un destino guardado, permitir corregirlo.

### T3 · Mapa como pantalla y densidad por escala (C2, C4)

1. Cambiar ampliación basada en tarjeta por un **estado de pantalla de mapa** del mismo explorador. Conservar una instancia y sus filtros, búsqueda, centro, zoom y selección; evitar un segundo mapa con estado independiente.
2. Al activar, ocultar cabecera, sidebar/bottom nav, pestañas Metro/Red y panel Rutas y sistemas. El mapa ocupa `100dvh` con zonas seguras. Mantener buscador, filtros, zoom, ubicación, atribución y un control compacto para salir. No depender exclusivamente de la Fullscreen API del navegador.
3. Click/tap deliberado en fondo sin desplazamiento entra a la vista; arrastrar, hacer pinch, seleccionar una ruta/parada o pulsar controles no debe activarla accidentalmente. También acción accesible explícita. Escape/Atrás y botón de salida restauran navegación, scroll y foco. Reflejar modo en historial sin añadir entradas por cada cambio de zoom.
4. Usar área útil del mapa para encuadrar trazos: descontar buscador, filtros y controles al hacer fit/centrado. Reducir altura del bloque superior; filtros desplazables en una sola fila en móvil; sin doble safe-area. Verificar que el norte de la red no quede tapado.
5. Regla propuesta inicial, a ajustar visualmente: a escala regional (`zoom < 13`) ocultar puntos y etiquetas de todas las paradas; entre 13 y 14 revelar sólo paradas de ruta seleccionada y nodos relevantes, sin colisiones; desde 14 revelar paradas próximas del viewport con límite de densidad. En vista de todas las redes no llenar la ciudad de puntos. No basta esconder nombres y conservar miles de círculos invisibles interactivos.
6. Preservar extremos A/B, posición solicitada y parada seleccionada como excepciones. La guía puede conservar sus extremos y transbordos esenciales a escala de etapa. Calcular umbrales en el motor real y verificar también mapa local offline; las excepciones no deben reintroducir todos los puntos.
7. Filtrar antes de generar nodos SVG y hit targets, reducir etiquetas y evitar saltos al rozar umbrales. Garantizar alternativa accesible para consultar paradas de la ruta sin depender de puntos diminutos.

Aceptación: a 390×844 y 926×1025 el mapa ampliado ocupa el viewport sin diálogo ni navegación; buscar/filtrar/seleccionar/zoom/pinch funcionan; entrar/salir no pierde posición; no se activa al arrastrar; sin saturación de puntos a escala ciudad; rutas completas encuadradas en el área libre. Verificar 320 px, horizontal, teclado virtual, Android Atrás, zoom del sistema y modo offline.

### T4 · Lectura del trayecto (C8)

- Representar caminar, viajar y cambiar de servicio como etapas compactas conectadas. Franja lateral e icono/texto: caminar en tono cálido, transporte con color de línea/red cuando está confirmado, transbordo con patrón neutro reconocible. Si un color de ruta no está confirmado, usar color de sistema sin presentarlo como oficial.
- Resumen de etapa: acción, destino, duración/distancia relevante. Nombres origen/destino y línea en jerarquía clara; no duplicar todo el texto de la etapa siguiente.
- Detalle de paradas, pago, fuente y condiciones detrás de despliegues; mantener disponibles los avisos relevantes de sentido no confirmado. Conservar guardar/ver estación y acciones de transbordo sin filas vacías.
- Mismo vocabulario y correspondencia visual en alternativas, detalle y guía. Iconos/etiquetas distinguen estados aun sin color. No cambiar el cálculo de transbordos ni inventar una etapa adicional para dibujar una franja.

Aceptación: viaje a pie–bus–Metro, viaje directo y sólo caminar; escaneo rápido permite identificar cuántas etapas y dónde cambiar; texto grande no desborda; contraste claro/oscuro/alto contraste y TalkBack; menos repetición sin ocultar información necesaria para abordar.

### T5 · Cerrar cobertura con evidencia (C3)

Objetivo solicitado: completar las 209 rutas bus consideradas en el catálogo. No prometer que exista ya una fuente suficiente para las 24 restantes.

1. Convertir las 24 filas del [inventario individual](cobertura-rutas-2026-10-27.md#rutas-pendientes) en lista de seguimiento con ID, variante, última consulta, URL, resultado y próximo intento. Revisar de nuevo páginas dinámicas/iframe, fuentes oficiales Metrorrey/IMA, mapas y datos geográficos publicados. Una nota de prensa o código común no basta para construir una geometría.
2. Resolver explícitamente los grupos: seis sin página inequívoca, seis sin mapa recuperable, una con error, una contradicción 38/310→213 y diez Transmetro. No sustituir variantes por el trazo de otra ruta.
3. Importar fuentes verificadas conservando segmentos, fecha, hash, origen y derechos. Si sólo hay imagen oficial, digitalización revisada con procedencia y precisión declarada, sin presentarla como levantamiento de campo. Si sólo hay recorrido textual parcial, conservarlo como información, no conectar puntos rectos para calcular viajes.
4. Si la fuente pública no alcanza, preparar solicitud concreta al organismo y protocolo de levantamiento comunitario consentido; **no enviar solicitudes a terceros sin autorización de comunicación**. Trazos comunitarios permanecen candidatos hasta revisión y no habilitan automáticamente dirección/orden operativo.
5. Separar geometría visible, puntos de parada, sentido/orden y disponibilidad para planear. Agregar geometría no demuestra que opere hoy. Excluir propuestas y líneas en construcción; no unir segmentos desconectados.
6. Retirar la tarjeta grande de cobertura del flujo principal. Conservar datos técnicos en **Información del catálogo** y estado breve en la ficha afectada (“Recorrido pendiente de confirmar”). Esta mejora de presentación puede entregarse aunque haya pendientes; el informe técnico debe seguir mostrando el porcentaje real.
7. Regenerar catálogo/grafo/inventario y validar conexiones representativas, sentido/segmentos, tamaño, compresión y desempeño. No cerrar cobertura completa hasta contar con evidencia por las 209 variantes; si quedan pendientes, entregarlas individualizadas con fuente y siguiente acción.

Aceptación doble: **limpieza visual** se cierra al quitar la tarjeta dominante conservando información exacta; **cobertura** se cierra ruta por ruta, nunca por cambiar el denominador u ocultar ausencias.

## 5. Etapas posteriores de producto

No están comprometidas dentro de la primera corrección de las nueve anotaciones:

- **T6, operación comunitaria:** recibos/seguimiento privados, consolidación de reportes en incidencias, vista pública contextual y mapa por capas; panel privado autenticado de moderación/gestión, bitácora y evidencia de cierre. Definición en el documento de modelo social. Conservar CLI como operación restringida durante transición.
- **T7, piloto de visión:** primera prueba con fotos voluntarias y una categoría de daño; después cámara exterior fija en una unidad, sujeto a acuerdos y presupuesto. No incorporar vigilancia continua al móvil ni modelos pesados en el arranque de RegioMóvil.

## 6. Verificación y orden de entregas

Orden recomendado: **T1 → T2 → T3 → T4 → T5**, con investigación de fuentes de T5 en paralelo conceptual cuando no bloquee otras tareas. Priorizar pérdida de datos antes del pulido.

Por entrega: implementación, verificaciones pertinentes, captura/evidencia, actualización de este registro, commit y push a la rama vigente. No afirmar un resultado de pruebas previo como ejecutado para código nuevo.

- T1/T2: regresiones de borrador/cancelación/resultado restaurado/idempotencia/contexto y retorno de guía. Pruebas de contrato API y migraciones en bases temporales. Fotos de prueba sintéticas; no publicar reportes reales para validar.
- T3/T4: interacción de mapa, historial, foco, densidad de nodos y encuadre; capturas comparables; regresiones de guardados offline, transbordos y teclado. Comprobación física de cancelación de selector y Atrás no se reemplaza por pruebas DOM.
- T5: pruebas importador, procedencia/identidad, segmentos desconectados y planeación representativa. Medir desempeño tras modificar el grafo, no aumentar límites de búsqueda para disimular fallos.
- Antes de entrega integrada: TypeScript/build; pruebas pertinentes y suite completa si cambian contratos compartidos; verificar precache ≤600 KiB (la base tenía sólo 203 bytes libres), recursos diferidos, compresión y paquetes guardados ≤4 MB/ocho paquetes. No cargar cámara/admin/visión en bundle inicial.
- APK: reconstruir web y nativo, actualizar con `adb install -r`, abrir y verificar versión/huella. Adjuntar evidencia del Xiaomi; si no está conectado, declarar validación física pendiente.

## 7. Reanudación operativa

Lecturas iniciales: este plan → modelo social/visión → memoria anterior → `git status`/últimos commits → archivos del trabajo activo. Revisar instrucciones locales aplicables antes de editar. Respetar cambios ajenos y no restablecer la base del usuario.

Node de sistema es antiguo; `./regiomovil` elige Node 24 de la caché. Backend y túnel de pruebas:

```sh
cd /home/magio/giovanni/proyectos/RegioMovil
HOST=127.0.0.1 PORT=4173 ./regiomovil start
```

En otra terminal, cuando corresponda entregar APK:

```sh
VITE_API_BASE_URL=http://localhost:4173 ./regiomovil android --dev-local-api
./regiomovil android-connect
/home/magio/Android/Sdk/platform-tools/adb devices -l
/home/magio/Android/Sdk/platform-tools/adb install -r output/android/regiomovil-debug.apk
/home/magio/Android/Sdk/platform-tools/adb shell am start -W -n mx.regiomovil.app/.MainActivity
```

No iniciar otro servidor en el mismo puerto sin revisar si ya está activo. ADB puede necesitar ejecución fuera del aislamiento; el teléfono debe autorizarlo. API `4173` es el backend/servidor de build; Vite `5173` usa proxy a API `3001`. No mezclar esos dos circuitos. No dar por fija la IP Wi-Fi, el serial ni sesiones de terminal entre chats. `dist` puede corresponder a otro build; confirmar que el navegador esté viendo la versión nueva.

## 8. Estado vivo de continuidad

| Trabajo | Estado al crear este plan | Bloqueo / siguiente acción |
| --- | --- | --- |
| T1 | Implementado; prueba física pendiente | Cancelación aislada, IndexedDB 24 h, cámara/galería/archivos e idempotencia. Verificar Xiaomi real. |
| T2 | Implementado; revisión física/visual pendiente | Formulario contextual y retorno pausado en guía nueva/guardada; checkpoint probado. |
| T3 | Implementado; revisión visual/gestos pendiente | Mismo mapa, pantalla completa, puntos por zoom; pruebas de interacción pasan. |
| T4 | Implementado; revisión visual pendiente | Franjas/etapas compactas sin cambios al cálculo. |
| T5 | Parcial: 191/209 buses | Seis geometrías nuevas oficiales; tarjeta dentro de información. Seguir [18 fuentes restantes](auditoria-pendientes-2026-10-28.md). |
| T6 | Propuesta posterior | No hay panel web de administración ni autenticación implementados. |
| T7 | Evaluación posterior | No hay modelo entrenado, cámaras conectadas ni acuerdos con operadores. |

Actualizar tras cada interacción: fecha, commit, comentarios cerrados, pruebas nuevas, APK instalado/pendiente, bloqueos con evidencia, próximo trabajo. Si no se completa un trabajo, anotar lo que sí cambió y el siguiente paso exacto; no marcarlo terminado por agotar la interacción.

### Mensaje listo para continuar

> Continúa en la rama vigente. Lee docs/ENTREGA_PRODUCTO_2026-10-28.md, este plan y el estado de git. T1–T4 ya están implementados: no rehacerlos. Empieza por validar y corregir en Xiaomi cámara/galería/archivos y retorno a la guía; después revisión visual de mapa completo/densidad y etapas. CUA estuvo bloqueado por política de URL y no hubo celular conectado. Continúa las 18 rutas pendientes desde docs/auditoria-pendientes-2026-10-28.md; cobertura actual 191/209 buses. Conserva moderación, consentimiento, idempotencia y offline. No construir panel admin/visión todavía. Actualiza pruebas/evidencia/memoria y commit/push al cerrar.
