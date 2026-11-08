# Inicio contextual · plan de reestructuración

**Plan del 5 de noviembre; implementación actualizada el 6 de noviembre de 2026.** Base `5187885`, plan guardado en `58cf9ac`; rama de implementación `codex/inicio-contextual`. I1–I6 implementados; I7 con verificación automatizada y visual, aceptación física pendiente. Consultar la [entrega y continuidad vigente](ENTREGA_INICIO_CONTEXTUAL_2026-11-06.md). Sin merge a `main`.

**Solicitud posterior del 8 de noviembre:** la mayoría de información en Inicio debe estar desplegada. La [nueva entrega](ENTREGA_UI_REPORTES_2026-11-08.md) abre pronóstico, consejo, mapa y descripciones; sustituye las decisiones de cierre inicial descritas abajo, que se conservan como historia.

Solicitud y referencia: [imagen del usuario](evidencia/2026-11-05/referencia-inicio-contextual.png). Este plan sustituye las decisiones de jerarquía y selector del [boceto anterior](PLAN_INICIO_2026-11-05.md), cuya entrega y evidencia siguen siendo históricas. Amplía **P8** del [plan P1–P10](PLAN_PRODUCTO_COMUNIDAD_2026-10-31.md), sin cerrar los pendientes físicos, de cobertura, administración o seguridad.

## 1. Resultado que se debe construir

Inicio debe dar tranquilidad con información útil inmediata. Al abrir, recuperar la base de Metro de `4173963`: estación actual, próximas llegadas, afluencia, horario, favoritos y fuentes. Reorganizar su presentación; no revertir commits completos ni retirar las mejoras posteriores de reportes, errores o privacidad.

| Cambio pedido | Decisión para implementar |
| --- | --- |
| Recuperar la información base al iniciar | Metro aparece inmediatamente con la estación conservada por la app. Nunca espera al catálogo, GPS, ilustración, mapa o módulo de comunidad. |
| Retirar el botón grande de planear | Eliminar de Inicio «¿A dónde vamos?». Conservar Planear en la navegación y un acceso compacto «Planear desde aquí». |
| Círculo accionable con vehículo | Ilustración local dentro de círculo, texto exterior identificando estación/ruta, anterior/siguiente y contador. Tocar el círculo abre la selección manual; deslizar el área del selector cambia entre contextos disponibles. No inicia un viaje. |
| Otras rutas cercanas | Tras autorizar cercanía, incluir estaciones y variantes de autobús publicadas —RegioRuta, Muevo León, Transmetro y demás redes del catálogo— ordenadas por distancia a sus puntos elegibles. No representa vehículos detectados en vivo. |
| Vista de autobús como referencia | Vehículo/ruta arriba; parada elegida, mapa del recorrido, participación y tarjetas públicas debajo. Sustituir foto genérica y azul ajeno por la identidad actual de RegioMóvil. |
| Metro prioritario | Las dos próximas llegadas y su afluencia quedan antes del mapa. Ambos sentidos visibles mediante filas compactas; no obligar a deslizar para descubrir el segundo. Pronóstico por hora accesible inmediatamente debajo. |
| Calificaciones | Diseñar su integración futura con P10. En el primer lote no habrá medias, estrellas vacías ni rankings sin una encuesta real. |

El círculo **selecciona transporte**. «Planear desde aquí» **abre planificación**. Mantener acciones separadas evita asignar dos efectos distintos al mismo gesto.

## 2. Orden exacto de la pantalla

**Metro, apertura predeterminada:**

1. Encabezado compacto e identidad existentes; sin frase promocional grande que empuje la información.
2. Selector circular con tren, estación/líneas, cambio manual y cercanía; sin las dos tarjetas grandes Metro/Autobús actuales.
3. Próximas llegadas: dirección, intervalo, afluencia con texto e icono y «Simulación» visible. Agrupar por `lineId + direction` y tomar la próxima de cada grupo: `arrivals.slice(0, 2)` puede repetir sentido. Una terminal sólo muestra sentidos existentes; en intercambio elegir línea con un control compacto y mostrar sus sentidos, sin ocultar las otras líneas. Aire acondicionado y otros detalles pasan al detalle existente, sin competir con llegada/afluencia.
4. Pronóstico por hora desplegable y próxima hora de menor afluencia cuando exista. Fuera de horario: próxima apertura en lugar de llegadas inminentes; mantener reglas actuales del pronóstico.
5. Accesos compactos: «Planear desde aquí», «Guardados» y «Reportar aquí». El borrador conserva «Continuar reporte».
6. «Ver mapa de la línea», cerrado inicialmente; después, observaciones de esa estación y fuentes. Crear un reporte general sigue disponible en la selección/área de participación, sin asignar silenciosamente la estación.

**Autobús, después de seleccionar/deslizar:**

1. El mismo selector circular, con autobús, sistema, código y nombre de variante; parada seleccionada y procedencia de la elección.
2. Tiempo/afluencia sólo si existe una fuente aplicable. Hoy mostrar una indicación compacta «Llegadas y afluencia no disponibles», sin copiar valores de Metro ni el «3 min / bajo» ilustrativo de la referencia.
3. Mapa de esa ruta con fondo local, parada seleccionada, encuadre y acción de ampliar. Gaps conservados; fuentes y sentido pendiente accesibles.
4. «Planear desde aquí», «Guardados» y «Reportar aquí»; después tarjetas públicas de esa ruta.

Objetivo visual a **390 × 844**, texto normal: Metro permite comparar ambos sentidos/afluencia en el primer tramo visible, antes del mapa. A 320 px o texto ampliado, permitir desplazamiento vertical sin cortar texto ni esconder controles. No fijar alturas de toda la pantalla para forzar el boceto.

## 3. Selector, gestos y navegación

- Ilustraciones SVG locales representativas, tren/autobús, usando colores y trazos de la app. No afirmar un modelo real de flota por la silueta. Reutilizar iconos existentes como fallback; una imagen fallida no bloquea información ni controles.
- Círculo aproximado de 88–104 CSS px en móvil; encabezado flexible. Usar `--green`, `--dark`, `--white`, `--soft`, `--line` y variantes de tema existentes. El círculo no tapa mapa, tiempo ni etiquetas; sin textos incrustados en la ilustración.
- Lista finita, máximo **ocho candidatos cercanos**, más la selección actual cuando quede fuera. No duplicar una estación de intercambio por línea ni fusionar ramales que compartan número. Conservar selección manual aunque no esté cerca.
- Deslizamiento limitado al área del selector; también botones «Anterior transporte»/«Siguiente transporte», deshabilitados en extremos, y «2 de 7». Sin rotación automática ni carrusel infinito.
- El círculo abre un selector inferior en móvil y diálogo en escritorio: buscar estación/ruta, filtrar por sistema, «Cerca de mí» y confirmar. Cancelar/Escape/Atrás conserva contexto y posición previos. Selección tentativa del diálogo separada de selección confirmada.
- Una acción confirmada actualiza ilustración, título, datos, mapa y comunidad como un solo contexto. No mostrar datos de la selección anterior mientras llegan los nuevos; mantener el encabezado y estados locales de carga/error.
- Tabulación natural y botones nativos, foco visible, objetivos ≥44 CSS px, nombre accesible de la selección y anuncio breve mediante región `polite`. Flechas sin modificadores cuando proceda; no capturar Ctrl/Alt/Meta ni teclas fuera del selector. Respetar movimiento reducido.
- Los gestos del selector, mapa y comunidad son independientes; no añadir swipe global a la página. El desplazamiento vertical sigue funcionando desde el selector.
- Guardar el contexto de Inicio en memoria por encima del desmontaje de página. Al volver desde Red, Planear o reportar, recuperar selección; al volver desde un mapa, recuperar también cámara/scroll y foco cuando corresponda. Explorar Red no cambia Inicio sin confirmación.

Guía consultada para controles, foco y semántica: [W3C APG · Carousel](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/). La decisión de no rotar automáticamente es de este producto.

## 4. Apertura automática y ubicación

**Automático significa mostrar información base sin pasos previos.** No requiere obligar a conceder GPS para usar Inicio.

1. Pintar Metro con la estación guardada o el fallback existente, identificado como «Tu estación», sin llamarlo «el más cercano».
2. Primera vez: «Cerca de mí» explica que la ubicación ordenará opciones del dispositivo y solicita permiso al activarlo. Guardar únicamente la preferencia de cercanía, revocable; no las coordenadas.
3. Aperturas posteriores en Android: si la persona habilitó esa preferencia y el permiso continúa concedido, obtener una posición en primer plano mediante lectura estrictamente no solicitante y ordenar automáticamente. Añadir `requestPermission: false` a la lectura nativa: si hubo revocación entre consulta y lectura, devolver error sin pedir permiso. Conservar el modo explícito actual para las acciones del usuario. La consulta previa por sí sola no evita esa carrera.
4. En web, la consulta de permisos y `getCurrentPosition` no son una operación atómica que garantice ausencia de un nuevo prompt. La apertura puede reutilizar una muestra vigente en memoria; para adquirir otra muestra, mantener el botón explícito cuando no haya una lectura no solicitante garantizada. Ante estado desconocido o API incompatible, selección manual. La información base sigue siendo automática en ambas plataformas.
5. Si el permiso/ubicación se revoca o falla, conservar Metro y selección manual; sin bucles de reintento. Una acción explícita podrá repetir la lectura. La base nunca espera esta operación.
6. Una posición precisa puede actualizar la estación Metro inicial a la más cercana dentro del radio si todavía no hubo interacción. No saltar automáticamente a autobús: el usuario cambia con el selector. Una selección manual, gesto o apertura de reporte invalida cualquier cambio automático pendiente.

Parámetros iniciales de producto, centralizados y sujetos a prueba física: radio **1 200 m** en línea recta; hasta ocho opciones; ampliación a **3 km** sólo por acción explícita. Precisión ≤200 m permite selección automática; entre 200 y 1 500 m sólo sugerencias rotuladas como aproximadas y confirmación manual; posición inválida, más antigua de 60 s o peor que 1 500 m no genera cercanos. Si el círculo de incertidumbre impide afirmar que un punto está dentro del radio, mostrarlo como aproximado y no seleccionarlo automáticamente. Estos umbrales no garantizan acceso peatonal.

Una lectura por entrada visible, reutilizando sólo una muestra vigente en memoria; sin watcher continuo ni GPS en segundo plano. Al volver del fondo, actualizar como máximo una vez si la muestra caducó, la preferencia sigue activa y no hay formulario/selector abierto. No reordenar mientras se interactúa; actualizar opciones al terminar o mediante «Actualizar cercanos».

Coordenadas sólo en memoria: no URL, historial, `localStorage`, analítica, cuerpo HTTP ni consultas geográficas al servidor. Extender el adaptador con estado de permiso y timestamp real de la muestra, manteniendo sus consumidores actuales. El resultado nativo actual de una lectura no devuelve timestamp; no sustituir la hora del fix por la hora de recepción.

Referencias: [W3C · consentimiento y geolocalización](https://www.w3.org/TR/geolocation/#user-consent), [MDN · permisos y getCurrentPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition). La automatización descrita es una propuesta nueva, no el comportamiento ya implementado.

## 5. Datos de cercanía y mapas sin descarga masiva

El grafo actual pesa **8 971 720 bytes** y el precache de `5187885` ocupa **613 645 / 614 400 bytes**. Mantener el límite de 600 KiB; no descargar todo el grafo o los paquetes de todas las rutas para construir el selector.

**Índice público propuesto** `public/home-nearby.json`, generado durante preparación de movilidad desde los puntos ya aceptados del grafo, sin geometrías completas:

```ts
{
  version: 1,
  revision, verifiedAt,
  origin: [24, -102], scale: 100000,
  routes: [{ id, code, name, networkId, geometryPack, geometryRevision }],
  points: [[latOffsetE5, lngOffsetE5, routeOrdinal, canonicalStopSuffix]]
}
// graphStopId = routes[routeOrdinal].id + ':' + canonicalStopSuffix
```

Metro usa sus 38 estaciones locales; el índice contiene autobuses. En un cálculo de viabilidad **en memoria, sin generar archivos**, los 191 recorridos y 10 768 puntos actuales producirían aproximadamente **370 947 bytes JSON / 86 261 bytes gzip6**. Presupuesto propuesto del nuevo artefacto: **450 KiB JSON / 110 KiB gzip6**, fuera del precache inicial. Medir el archivo realmente generado al implementar.

- Descargar y validar el índice sólo al activar cercanía o actualizarla estando habilitada; cachear únicamente el documento público. Validar versión, revisión, referencias de ruta, coordenadas e identidad canónica. Una revisión incompatible pide actualización o selección manual, sin asignar una parada distinta por coincidencia de nombre.
- Verificar que build, ZIP web y sincronización Android incluyan el índice y que las revisiones coincidan con los paquetes. Ampliar la regresión de publicación; no basta con que el archivo exista en desarrollo.
- Calcular distancias localmente, conservar mínimo por **ID de variante**, ordenar de forma estable por distancia e ID y limitar resultados. No deduplicar sólo por coordenadas: puntos distintos pueden compartir ubicación. No calcular tiempo a pie desde distancia recta.
- Extraer a un módulo puro compartido la normalización canónica de paradas/segmentos de `prepare-mobility.mjs`. Reutilizarla en el mapa y resolución del paquete. Conservar IDs y resultado del grafo durante la extracción; cubrir propuestas sin existencia, tolerancia de 160 m, IDs repetidos y segmentos con menos de dos puntos. No crear un segundo algoritmo casi equivalente.
- Cargar **un paquete**, el seleccionado, al asentarse la selección. Agrupar cambios rápidos de swipe; no precargar paquetes de vecinos ni mantener mapas ocultos. Invalidar respuestas tardías; liberar peticiones/trabajo/listeners al cambiar contexto.
- Añadir un wrapper diferido `HomeSelectedRouteMap.tsx` que construya una `MobilityNetwork` reducida de un recorrido y use `LocationMap` con `contextRoutes={[route]}`, `field={null}` y `compact`. Esto permite reutilizar encuadre, zoom, gestos y áreas seguras existentes. No llamar a `loadMobilityNetwork` desde Inicio.
- Con `contextRoutes`, el renderer actual usa el fondo local y evita teselas remotas. Su SVG de aproximadamente 497 KiB se carga sólo al mostrar el mapa de bus o expandir el de Metro. Ahorro de datos/fallo del mapa conserva esquema ligero y acceso a Red. Mantener atribución y aviso de simplificación.
- Ampliar entrega el ID de variante y parada válidos a Red; Red los aplica después de cargar sus datos. No usar una ruta de número parecido como reemplazo. Los puntos siguen el umbral de zoom del mapa existente.
- Las 18 variantes de autobús sin trazo permanecen en búsqueda manual con «Trazo pendiente», reporte y fuentes. No aparecen como cercanas si carecen de puntos elegibles. Este lote no completa la cobertura ni modifica exclusiones de L4/L6.

## 6. Comunidad, accesos y futuras estrellas

Reutilizar `HomeCommunityFeed`: estación para Metro, variante para autobús, sólo publicaciones consentidas y revisadas, con error distinto de vacío. Conservar carga diferida de fotografías; no empezar a descargar todas las imágenes para imitar la referencia. Mantener acceso público a detalle, categoría y estado.

Presentar tarjetas horizontales del mismo ancho, con la siguiente parcialmente visible, fondo de la app, radio y tipografía existentes. La tarjeta activa puede tener énfasis sutil; evitar reducir opacidad del texto vecino, superponer tarjetas o animar automáticamente. Sin foto: categoría e icono; no fotografía de relleno que parezca evidencia. Título limitado visualmente con acceso al contenido completo. Si no hay publicaciones, una invitación breve y accionable a contribuir.

«Reportar aquí» pasa estación/ruta elegidas y respeta recuperación del borrador; no envía un reporte al tocar. Hoy el contrato de reporte no incorpora parada canónica: no presentar ese vínculo como guardado. «Crear reporte general» mantiene contexto sin asignación. «Guardados» abre viajes reales; no introducir Casa/Trabajo ficticios.

«Planear desde aquí» utiliza una estación/parada **canónica confirmada** como origen y deja el destino vacío. Reutilizar `initialMobilityOrigin`; el planificador carga su grafo únicamente al entrar allí. Si sólo se eligió una ruta sin parada, abrir elección de origen. Añadir `requireOriginSelection` en el planificador, falso por defecto: con valor verdadero debe dejar origen vacío y abrir su selector, porque hoy `initialOrigin: undefined` usa automáticamente Metro. Limpiar viaje inicial/destino previo al entrar desde Inicio; no usar el primer punto de la línea ni el GPS de cercanía silenciosamente.

**Estrellas, segundo lote P10:** proponer valoración general de viaje en escala 1–5, separada de las dimensiones de servicio y del NPS 0–10. Mostrar promedio, número de respuestas y periodo; el número de reportes no se convierte en calificación. Considerar el umbral provisional de 30 respuestas del [diseño P10](propuesta-medicion-servicio.md), sin afirmar representatividad. Antes de activarlo: modelo/retención, controles de repetición y abuso, agregados públicos, correcciones y pruebas del cálculo. No incluir respuestas sintéticas en resultados reales ni bloquear reportes por no calificar.

## 7. Instrucciones de implementación por archivo

La tabla conserva el alcance de implementación aprobado. Los módulos propuestos ya existen en la entrega del 6 de noviembre; mantener la separación entre Metro inmediato y componentes opcionales.

| Bloque | Archivos y cambio exacto | Criterio de salida |
| --- | --- | --- |
| I1 · Base inmediata | [App](../src/App.tsx), [HomeDashboard](../src/components/HomeDashboard.tsx), [CSS](../src/components/homeDashboard.css). Retirar CTA superior, elevar `HomeSelection` a App y renderizar Metro fuera de `DeferredSection`. Conservar polling vigente sin duplicarlo, fuentes, favoritos, horario y borrador. | Llega información Metro aun con fallo de módulos opcionales. Llegadas/afluencia antes del mapa; sin pestañas grandes. |
| I2 · Selector visual | Refactorizar [HomeTransportHub](../src/components/HomeTransportHub.tsx) en coordinación ligera; añadir `HomeTransportSelector.tsx`, `HomeTransportPicker.tsx`, `TransportIllustration.tsx` y CSS diferido. | Círculo, swipe, botones y diálogo realizan la misma selección; cancelar no la cambia. |
| I3 · Cercanía | [Preparador](../scripts/prepare-mobility.mjs), [API cliente](../src/api.ts), [tipos](../src/types.ts), [helper actual](../src/components/homeTransport.ts). Añadir `homeNearby.ts`, `useHomeNearby.ts` y normalizador compartido tipado. Integrar índice en build/publicación sin precache obligatorio. | Artefacto reproducible y validado, ranking correcto, sin grafo completo ni coordenadas en solicitudes. |
| I4 · Permisos/vida útil | [Adaptador](../src/mobility/location.ts) y [plugin Android](../android/app/src/main/java/mx/regiomovil/app/RegioLocationPlugin.java). Añadir consulta de permiso, lectura `requestPermission: false` y timestamp real; reutilizar API heredada de Capacitor cuando exista. Conservar guía y selección explícita actuales, con fallback web descrito. | Revocación entre consulta/lectura no dispara prompt nativo automático. Probar Android y web; no GPS en fondo. |
| I5 · Mapa y retorno | Nuevo wrapper `HomeSelectedRouteMap.tsx`; [LocationMap](../src/mobility/LocationMap.tsx), [NetworkExplorer](../src/components/NetworkExplorer.tsx), App y [navegación](../src/navigation.ts) sólo donde haga falta para selección inicial/retorno. Reutilizar [esquema actual](../src/components/HomeTransportMap.tsx) como fallback. | Un recorrido, nombres/ID exactos, gaps y atribución; ampliar/volver conserva contexto y no dispara planificación. |
| I6 · Participación/accesos | [Comunidad](../src/components/HomeCommunityFeed.tsx), [estilos](../src/components/homeCommunityFeed.css), [MobilityPlanner](../src/mobility/MobilityPlanner.tsx), HomeDashboard y App. Tarjetas con identidad, origen confirmado o `requireOriginSelection` al planificar y acción de reporte coherente con selección. | Reportes y guardados reales; ruta sin parada deja origen/destino vacíos; no datos anteriores mientras carga ni foto anticipada. |
| I7 · Aceptación | Ampliar [tests de Inicio](../tests/home-dashboard.test.tsx), [selector](../tests/home-transport.test.tsx), [integración](../tests/frontend.test.tsx), comunidad/fallos y pruebas nuevas de índice/permiso. Actualizar entrega y portal de evaluación si cambia su recorrido. | Suite/build/presupuestos y QA visual aprobados con evidencia; pendientes físicos declarados. |
| I8 · Valoraciones | P10 y rama posterior específica, no condición para entregar I1–I7. | Metodología y API de agregados reales antes de renderizar estrellas. |

Secuencia: **I1 → I2 → I3/I4 → I5 → I6 → I7**. Hacer commits por bloque coherente; no cerrar un bloque con sólo apariencia si el flujo no funciona. I3/I4 pueden trabajarse en paralelo con contratos de selección acordados. No tocar credenciales, MFA, bases reales o despliegue remoto para desarrollar Inicio.

## 8. Pruebas y aceptación obligatorias

| Escenario | Evidencia requerida |
| --- | --- |
| Apertura limpia / módulos offline | Metro base disponible antes de resolver imports; sin catálogo, grafo, mapa pesado o solicitud de permiso antes de acción/autorización previa. Fuentes, reporte general y navegación siguen funcionando. |
| Metro / horario / intercambio | Fixture con las dos primeras salidas del mismo sentido sigue mostrando la próxima de cada sentido real; terminal sin sentido inventado. Intercambio con línea elegible y afluencia visibles, simulación y pronóstico vigente; cierre muestra apertura. |
| Selección y diálogo | Gestos/botones/teclado equivalentes; cancelar/Atrás conserva selección. Ctrl+Home no cambia transporte; no activación accidental tras arrastre. |
| GPS y concurrencia | Primer permiso explícito; permiso previo más preferencia permite actualización nativa no solicitante. Probar revocación entre consulta/lectura y fallback web. Denegado, aproximado, antiguo, timeout, retorno del fondo y respuesta tras selección manual no reemplazan contexto. |
| Ranking / identidad | Fixture con distancias conocidas, empates, ramales de mismo código, IDs repetidos, puntos coincidentes, radio/ampliación, cero candidatos y revisión incompatible. Índice sin propuestas/no elegibles. |
| Mapa / planificación | Sólo paquete seleccionado; gaps conservados. Sin mapa, Inicio sigue útil. Planear recibe origen canónico/destino vacío; ruta sin parada pide origen. Ampliar/volver conserva selección y cámara sin historial GPS. |
| Reportes / privacidad | Contexto correcto, borrador preservado, sólo estados públicos, errores distintos de cero, fotografías bajo demanda. Inspección de red/storage sin coordenadas añadidas. |
| Dispositivo / visual | 320/390/412 CSS px, horizontal, texto 200 %, claro/oscuro, contraste y movimiento reducido; TalkBack/teclado, foco y áreas seguras Android. Capturas de ambas variantes. |
| Eficiencia | Medir bytes iniciales/índice y cambios rápidos del selector; ningún paquete vecino ni grafo en Inicio. Precarga ≤600 KiB y presupuestos actuales JS/CSS; sin mapas/listeners retenidos al repetir diez ciclos. |

En implementación ejecutar build de producción, suite completa y comprobadores de cobertura/documentación. Pruebas DOM no acreditan diseño físico, permisos Android ni fluidez; separar mediciones antes/después de metas. La entrega previa tiene 491 pruebas Node/React y 4 Python aprobadas: son evidencia de `5187885`, **no pruebas ejecutadas de esta propuesta**.

## 9. Reanudación para el siguiente agente

1. Leer la [entrega vigente](ENTREGA_INICIO_CONTEXTUAL_2026-11-06.md), este plan, P1–P10 y `git status`. Código funcional de cierre: `0414d33`; los commits documentales posteriores no implican otro APK.
2. Continuar en `codex/inicio-contextual` o en una rama de corrección explícita. I1–I6 están implementados; I7 tiene pruebas automatizadas y revisión web, con aceptación física pendiente. No reiniciar la implementación ni restaurar App desde una versión antigua.
3. Confirmar qué revisión sirve la web y el hash del APK instalado usando `output/android/build-info.json`. Preservar cuentas, MFA, bases y borradores. No subir `output`, secretos ni información privada del teléfono.
4. Registrar hallazgos físicos o del usuario con pasos, contexto y resultado esperado; corregir por bloques, probar, commit/push y actualizar entrega. Revisar CI y PR apilados antes de solicitar el merge; esta entrega no autoriza fusionar a `main`.
5. Mantener abiertos P1/P2/P4 físicos, P3 de fuentes, P6/P7 y seguridad/hosting. P10 requiere datos reales y metodología; no convertir reportes en estrellas ni afirmar auditoría OWASP completa.

**Registro histórico de la planificación del 5 de noviembre:** ese lote entregó únicamente el plan y la referencia. Su implementación posterior está descrita en la entrega del 6 de noviembre, enlazada al inicio.

Validación documental de este lote: `pnpm docs:check` verificó **71 archivos y 477 enlaces locales**; `git diff --check` sin errores. No se ejecutaron pruebas funcionales ni build porque no cambió código de aplicación.

La incidencia inicial de permisos quedó resuelta: el plan fue guardado en `58cf9ac`, antes de crear la rama de implementación. Los resultados de build, pruebas y APK posteriores pertenecen a la nueva entrega; no a la validación documental histórica anterior.
