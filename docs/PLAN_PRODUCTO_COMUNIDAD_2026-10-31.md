# Plan de desarrollo y continuidad: mapas, reportes y administración

Fecha: **31 de octubre de 2026**, America/Monterrey. Base: `2ccb661`, rama `codex/administracion-ciberseguridad`. **Implementación en `codex/mapa-movil-reportes` y `codex/admin-mapa-reportes`.** La planificación inicial quedó en `0bba29e`. El [acta de implementación](ENTREGA_PRODUCTO_2026-10-31.md) conserva resultados nuevos y pendientes; las observaciones siguientes de la base son históricas.

## Objetivo y trazabilidad

Hacer del reporte una función principal y fiable: localizar el contexto, adjuntar evidencia sin perder el formulario y permitir explorar dónde se concentran los reportes aprobados. Evaluar encuestas e informes de servicio como un producto relacionado, con métricas distintas.

Este plan prioriza las diez solicitudes actuales. Conserva recuperación, privacidad, accesibilidad y procedencia del [plan del 27 de octubre](PLAN_PRODUCTO_COMUNIDAD_2026-10-27.md); sustituye su propuesta de tres botones de foto por una sola entrada. Los informes históricos no acreditan pruebas nuevas.

| Solicitud | Entrega | Resultado y aceptación resumida | Estado actual |
| --- | --- | --- | --- |
| 1 · Visibilidad de estaciones/rutas al tocar mapa móvil | P1 | Ficha legible y operable, sin cruces con atribución, controles o barras Android. | Código y regresiones listos; QA física pendiente |
| 2 · Fluidez del mapa de guía | P2 | Seguimiento/exploración no se disputan la cámara; encuadre útil y perfil antes/después. | Control de cámara/optimización listos; perfil físico pendiente |
| 3 · Trazos faltantes | P3 | Importación por variante con evidencia; pendientes individualizados y sin geometrías inventadas. | Fuente externa pendiente; auditoría parcial renovada |
| 4 · Cámara/galería/archivos desde un botón | P4 | «Añadir foto» abre selección nativa compatible; cancelar/volver conserva borrador. | Selector nativo y regresiones listos; QA física pendiente |
| 5 · Quitar texto gris del segundo aviso de descarte | P5 | Confirmación breve que conserva título, conservar/descartar y foco seguro. | Verificado por comportamiento DOM |
| 6 · Administrador geográfico de aprobados | P6 | Mapa, filtros, indicadores y lista coherentes por categoría, periodo y entidad. | Agregados/mapa implementados; segunda entrega y QA pendientes |
| 7 · Verificar con datos sintéticos | P7 | Demo aislada, reproducible y rotulada; conteos contrastados con manifiesto independiente. | Generador aislado y conteos verificados; demo visual con MFA pendiente |
| 8 · Reportes principales en Inicio | P8 | Tarjeta visible para crear/continuar; contexto general sin asignación errónea. | Implementado y verificado en DOM |
| 9 · Identidad visual de datos/simulación/ajustes | P9 | Tarjetas y controles consistentes, manteniendo los avisos esenciales. | Implementado y verificado en DOM |
| 10 · Propuesta VDP | P10 | Encuesta, NPS opcional, privacidad, informe mensual y alertas definidos por etapas. | Evaluación documentada; implementación pendiente |

## Evidencia y base real

Las cinco imágenes del usuario se conservan sin edición en [evidencia](evidencia/2026-10-31/README.md), con [hashes y tamaños](evidencia/2026-10-31/manifest.json): E1 Av. Pedro de Alba en Red, E2 la misma ficha en mapa completo, E3 San Nicolás/Línea 2, E4 TM San Bernabé–No Reelección y E5 segundo aviso de descarte. Son evidencia del problema observado, no pruebas ejecutadas por el agente.

Lectura del código:

- `locationMap.css` fija la ficha compacta con `inset-inline: 12px 76px` y `bottom: 26px`. El intento de elevarla en `networkExplorer.css` pierde por menor especificidad. Atribución/info sí suman área segura inferior en pantalla completa. Es una **causa probable verificable**, pendiente de reproducción física controlada.
- `ActiveJourney.tsx` pasa cada posición aceptada como foco; `LocationMap.tsx` recentra y fuerza zoom 14 al cambiar coordenadas. Arrastrar no suspende ese seguimiento. Actualizaciones por `pointermove` y reproyecciones completas son candidatos a perfilar, no mejoras ya medidas.
- Ya existen borrador duradero de 24 horas, guardado previo al selector, protección de cierre y recuperación nativa. `ReportDialog.tsx` presenta tres botones; `reportCamera.ts` usa una API compatible pero deprecada de Camera 8.2.6. **No se ha reproducido en esta ronda** por qué no abre cámara.
- Inicio ya tiene «Reportar», pequeño y al final; la entrada general presupone la estación actual. Fuentes/ajustes están en `App.tsx`, con `AppearanceSettings.tsx`.
- El panel cuenta con MFA/roles/moderación, pero no mapa. Su dashboard mezcla estados y no distingue unidades. El esquema v3 guarda estación/ruta y referencias libres, no coordenadas propias, parada estable ni hora observada.
- [Inventario local](../data/route-coverage-inventory.json), fechado el 28 de octubre: **214 fichas, 194 con mapa/grafo y 20 sin mapa**. Equivale a **191/209 buses con geometría y 18 pendientes**, más L4/L6 no habilitadas en esa instantánea. No certifica todas las rutas existentes hoy.
- La CI anterior aprobó 425 pruebas Node/DOM y cuatro Python para `2ccb661`. Es referencia histórica, no ejecución del presente plan. Su APK fue instalado por USB en el M2103K19G; eso no acredita cámara, fluidez ni corrección de estas capturas.

## P1 · Selección cartográfica legible — prioridad alta

Archivos: [LocationMap](../src/mobility/LocationMap.tsx), [CSS del mapa](../src/mobility/locationMap.css), [NetworkExplorer](../src/components/NetworkExplorer.tsx), [CSS de Red](../src/components/networkExplorer.css) y [medición de viewport](../src/useMapWorkspaceHeight.ts).

1. Reproducir E1–E4 en el APK actual; registrar Android/WebView, viewport CSS, escala de fuente y navegación por botones/gestos. Distinguir observación física de hipótesis CSS.
2. Usar un rectángulo útil común para buscador/filtros, controles, ficha y atribución. Medir alturas variables y aplicar áreas seguras una sola vez; retirar offsets contradictorios y dependencia accidental de especificidad.
3. Ficha con nombre completo accesible, texto flexible y acciones ≥44 CSS px. Si supera altura disponible, permitir expansión/desplazamiento interno accesible. No esconder información completa tras una elipsis sin alternativa.
4. Reubicar atribución e información sin tapar ficha/acciones; unificar las dos entradas de información que aparecen al aislar ruta. Mantener atribución OpenStreetMap visible.
5. Tocar una parada o seleccionar ruta no activa pantalla completa, cambia extremos ni se confunde con arrastre. Entrar/salir, girar y pulsar Atrás conservan cámara, selección y foco, salvo ajuste mínimo para respetar límites regionales y área útil. Actualmente las rutas se seleccionan por buscador: tocar directamente una polilínea exigiría otro prototipo de hit-testing y resolución de rutas superpuestas; no añadirlo incidentalmente al corregir las fichas.

Aceptación: E1–E4 sin intersecciones ni controles bajo barras; nombres largos y botones utilizables con fuente ampliada. Probar 320/390/412 CSS px, horizontal, teclado y pantalla completa. JSDOM no prueba geometría visual: exigir captura del teléfono y regresiones pertinentes.

## P2 · Guía fluida y control de cámara — prioridad alta

Archivos: [ActiveJourney](../src/mobility/ActiveJourney.tsx), [MobilityMap](../src/mobility/MobilityMap.tsx) y `LocationMap`; reutilizar renderer existente.

- Estados explícitos **siguiendo / explorando**. Arrastrar/pellizcar pausa seguimiento; un nuevo GPS no deshace la exploración. «Seguirme» reanuda conservando zoom, salvo encuadre solicitado expresamente.
- El mismo cálculo de padding encuadra al iniciar etapa y al recentrar; extremos y transbordos quedan libres de tarjetas. Evitar animación completa por cada posición.
- Perfilar antes de optimizar: evaluar agrupar gestos con `requestAnimationFrame`, reutilizar proyección, separar capas estáticas/posición y acotar trabajo fuera del viewport. Simplificar dibujo no altera geometría fuente, huecos, paradas ni grafo.
- Cancelar trabajo y liberar watchers/listeners/object URLs al salir; conservar retorno desde reporte y pausa en segundo plano. Sin GPS en fondo ni seguimiento sin acción del usuario.

Medición: tres repeticiones de la misma guía de 60 s, antes/después, misma variante de APK/equipo; registrar Android/WebView y frecuencia de pantalla. Medir p50/p95 de frames, tareas >50 ms, tap→ficha, nodos/vértices y memoria cuando sea observable. Metas iniciales a contrastar con línea base: tap local p95 ≤200 ms y frames p95 ≤32 ms. No son resultados ni garantía de 60 fps.

Aceptación adicional: diez ciclos mapa→guía→reporte→volver sin crecimiento retenido monotónico después del calentamiento ni GPS/listeners duplicados. Probar posición buena, antigua, imprecisa, denegada, offline y regreso desde segundo plano.

## P3 · Cobertura por evidencia — investigación paralela

Partir de la [auditoría individual](auditoria-pendientes-2026-10-28.md) y su [registro estructurado](../data/route-pending-audit-2026-10-28.json). Pendientes: 7 urbanas IMA, 1 troncal/integrada y 10 Transmetro. Revisar por separado vigencia de L4/L6 antes de habilitarlas.

1. Priorizar enlace roto 218 Plutarco E. Calles y contradicción 38/310→213; después 5, 50 San Ángel, 128, 227 Clouthier, 227 Emiliano Zapata y 405.
2. Para diez Transmetro históricos, resolver identidad/vigencia/equivalencia oficial antes de reutilizar otro mapa. Código/nombre parecido no demuestra mismo recorrido.
3. Revisar páginas dinámicas/iframe y KML/GeoJSON. Por variante registrar URL, consulta, título, hash, derechos, resultado y siguiente acción. Imagen digitalizable exige revisión y precisión declarada; texto parcial no autoriza inventar calles ni unir extremos.
4. Separar geometría visible, paradas, sentidos/orden y elegibilidad para planear. No crear paradas a partir de vértices ni unir segmentos desconectados. Fuente publicada no demuestra operación actual.
5. Si la fuente no alcanza, preparar solicitud concreta o levantamiento consentido/revisado. No enviar comunicaciones sin autorización. Registrar dependencia externa y avanzar las otras entregas.
6. Regenerar paquetes, catálogo, grafo e inventario; validar identidad exacta, exclusiones, conexiones, tamaño y latencia. Mantener ficha sin trazo con estado honesto.

Cierre por servicio: fuente suficiente + importación revisada + mapa visible + grafo apropiado + verificación. «Todas» sólo se cumple cuando cada variante del universo definido tiene estado resuelto; ocultar pendientes o reducir denominador no completa cobertura.

## P4 · Una entrada de fotografía fiable — prioridad alta

Archivos: [ReportDialog](../src/components/ReportDialog.tsx), [adaptador nativo](../src/reportCamera.ts), [borrador](../src/reportDraft.ts), [procesamiento de imagen](../src/reportPhoto.ts) y bridge Android si el prototipo lo requiere.

1. Reproducir cámara registrando llamada, código de error, permiso y ciclo de vida, sin foto, URI ni texto privado. `getPhoto` deprecado sigue existiendo: no atribuirle el fallo sin evidencia.
2. Reemplazar tres botones por **«Añadir foto»**. Objetivo: una entrada con Cámara / Galería / Archivos mediante interfaz nativa compatible.
3. Prototipar un selector Android con intents seguros. Si SO/OEM no presenta tres opciones, una hoja adaptativa de apariencia nativa abre cada interfaz del sistema. Documentar decisión: `<input accept="image/*">` no garantiza tres opciones y `CameraSource.Prompt` no es selector universal de documentos.
4. Evaluar `takePhoto`/`chooseFromGallery` como APIs objetivo, revisando errores y restauración; migrar no es condición previa si la reproducción identifica otra causa. [Camera](https://capacitorjs.com/docs/apis/camera) y [App](https://capacitorjs.com/docs/apis/app) documentan Activity separada y resultados restaurados; conservar asociación al borrador correcto. Resultado tardío no puede adjuntarse a otro reporte.
5. Guardar antes de salir; revisar activación de usuario del fallback web cuando hay un `await` antes del selector. Cancelar, denegar o fallar preserva campos, contexto y foto previa; permite enviar sin foto.
6. Conservar compresión, límites, limpieza de metadatos y memoria. No añadir permisos amplios ni relajar políticas globales para reparar una captura nativa.

Aceptación física: un botón; tomar foto abre cámara y retorna imagen; galería/archivo funcionan; cancelar no cierra/borra formulario y reemplazo cancelado conserva imagen previa. Probar Atrás, orientación y recreación de Activity/proceso, desde Inicio y guía. Mock/DOM no demuestra apertura de cámara.

## P5 · Segundo aviso de descarte

Retirar sólo el párrafo gris redundante de **«¿Descartar este borrador?»** en E5. Conservar título, «Conservar borrador», «Descartar definitivamente», foco seguro y Escape/Atrás. No cambiar el aviso distinto de error al guardar (`discardChoice === 'leave'`). Actualizar `aria-describedby` si desaparece su destino.

Aceptación: retomar/conservar/Escape no borra; únicamente confirmar descarte elimina el borrador. Empezar en otro contexto mantiene la decisión explícita. Borrar borrador local no retira un reporte enviado. Reutilizar pruebas de comportamiento; no añadir pruebas que sólo repitan el texto eliminado.

## P6 · Administración geográfica de aprobados

Primera entrega útil **sin migración**: estaciones como puntos del catálogo y rutas como trazos asociados; mapa, lista e indicadores enlazados. Después añadir ubicación observada mediante migración aditiva compatible con APK antiguos.

**Conjunto/periodo:** mapa por defecto `published` con consentimiento; «Incluir resueltos» añade `resolved` también consentidos. Pendientes/rechazados sólo bandeja, fuera de concentración. Mostrar abiertos y marcados resueltos separados; resolver administrativamente no certifica reparación. Inicialmente filtrar recepción (`created_at`), pues no existe hora observada. Selector America/Monterrey, API UTC, intervalo `[desde,hasta)` máximo 90 días.

| Entidad | Representación y límite |
| --- | --- |
| Estación | Punto de catálogo, rotulado «Ubicación de estación», no sitio exacto del daño. |
| Parada | Futuro ID estable validado contra ruta/paquete; no asignación por texto parecido. |
| Ruta | Trazo y contador asociado. Sin trazo: lista explícita. No pin en centroide ni puntos ficticios distribuidos por el recorrido. |
| Unidad | Referencia declarada y ruta. Sin punto observado: «Ubicación no registrada». No tracking ni vehículo en vivo. Agrupación fiable exige catálogo de flota o normalización revisada. |
| Sin ubicación | Contador/lista visibles; sin excluir silenciosamente ni geocodificar texto/EXIF automáticamente. |

Migración propuesta: tabla 1:1 con parada, lat/lng anulables en pareja, fuente (`selected_stop`, `manual_pin`, `device_once`), precisión, hora observada/de registro y revisión de paquete. Antiguos permanecen sin punto propio. Validar fechas/coordenadas y pertenencia parada-ruta; GPS único voluntario. Decidir precisión/consentimiento público separadamente de publicar texto/foto.

Contrato inicial ya implementado (detalle en [API administrativa](api-administracion.md)): `GET /api/admin/report-map` con categoría, estado, periodo, tipo, estación, ruta y referencia declarada de unidad. `bbox`/`zoom` quedan fuera de esta primera entrega y se rechazan; indicadores globales filtrados. Ampliar el router que hoy restringe query fuera de `/reports`. Respuesta: filtros normalizados, total/estados, localizables/sin ubicación, grupos acotados y truncamiento; lista paginada aparte (20, máximo 100). SQL parametrizado y geometrías locales autorizadas/diferidas. No bajar textos/fotos de 5.000 reportes para dibujar.

Conservar MFA, sesiones, origen, revocación, auditoría y no-store. `analyst`: agregados, sin texto/foto, referencias libres ni puntos precisos de observación. Moderador/admin: detalle autorizado. Sin GPS/unidad en Prometheus ni caché pública/Web Storage. Indicadores aclaran si describen viewport o conjunto global filtrado.

Aceptación: filtros iguales en mapa/lista/indicadores; suma de grupos primarios y sin ubicación coincide con total sin duplicar reportes enlazados a varias entidades. Retirar publicación actualiza resultados. Anónimo 401, MFA incompleto 403, analista sin evidencia y parámetros inválidos 400. Abrir/volver de un grupo conserva selección. P7 es condición para aceptar P6.

## P7 · Datos sintéticos de demostración

Generador con semilla/reloj fijos, manifiesto esperado independiente y destino explícito vacío **fuera de bases reales**, por ejemplo `/tmp/regiomovil-admin-demo-<semilla>/`. Rechazar sobrescritura y `DATABASE_PATH` habitual. Identidad demo separada, MFA vigente, puerto/origen distintos. Usar contratos normales de alta/moderación; nunca copiar cuentas, claves, fotos o reportes del usuario.

| Fixture propuesta | Cantidad |
| --- | ---: |
| Publicados abiertos | 120 |
| Resueltos | 40 |
| Pendientes | 50 |
| Rechazados | 30 |
| Total | 240 |
| Aprobados incluyendo resueltos | 160 |

De 160 aprobados: 80 de estación, 60 de ruta y 20 de unidad. Incluir categorías/municipios, concentraciones deliberadas, referencias repetidas, rutas sin trazo, puntos ausentes y límites de fecha. Geografía del catálogo con **eventos ficticios**, sin atribuir daños reales a lugares. Rótulo persistente «Demostración · datos sintéticos», también en capturas/exportaciones. No mezclar con publicaciones ni estadísticas reales.

Aceptación: 120 abiertos /160 con resueltos, sumas del manifiesto, sin pendientes/rechazados ni pines inventados. Evidencia visual de filtros y estados vacíos. Otro fixture hasta 5.000 reportes mide p95, respuesta comprimida, nodos y memoria tras 20 filtros; fijar presupuesto tras línea base. Estos datos se generarán al implementar, no se insertan durante esta planificación.

## P8 · Reportes principales en Inicio

Elevar el enlace inferior a tarjeta visible tras «¿A dónde vamos?»: **«Mejoremos nuestro transporte» / «Crear reporte»**, icono y textura local coherentes. Con borrador: «Continuar reporte».

Entrada general elige estación, parada/recorrido o unidad sin asignar silenciosamente la estación de Inicio. Ficha/guía conservan contexto prellenado, visible y editable. Un único formulario, carga diferida y retorno al paso actual. Offline conserva borrador e indica qué necesita conexión; sin envío automático al recuperarla.

## P9 · Identidad de datos, simulación y ajustes

Revisar `SourcesDialog`, ajustes de `App.tsx`, `AppearanceSettings.tsx` y `home-data-info`: icono/título, jerarquía, espacios, bordes y superficies con tokens actuales. Textura sutil en acciones especiales, no bajo párrafos extensos.

Distinguir red documentada, operación simulada y observaciones comunitarias; metodología/fuentes bajo demanda, manteniendo avisos necesarios. Ajustes por apariencia, lectura/accesibilidad, consumo y escenario demo; controles accesibles y estado visible. Claro/oscuro, contraste, TalkBack, fuente ampliada y objetivos ≥44 CSS px. Simulación nunca alimenta mediciones ciudadanas.

## P10 · Evaluación VDP

La [evaluación específica](propuesta-medicion-servicio.md) conserva la propuesta y diseña encuesta, NPS opcional, antifraude, privacidad, informe mensual, alertas y límites jurídicos. No aplicar NPS indistintamente a nueve criterios ni exigir tarjeta como supuesto remedio del sesgo. Reportes, encuestas y alertas comparten contexto/identidad visual, no denominadores ni veracidad automática.

## Secuencia, pruebas y ramas

1. **P1 + P4**, con P5 como cambio breve del flujo. Investigación de P3 puede avanzar sin bloquearlas.
2. **P2**, control de cámara y perfil comparativo; mantener retorno desde reporte.
3. **P8 + P9**, después de estabilizar el formulario.
4. **P6 + P7**: contratos/agregación → fixture aislada → mapa/lista → ubicación opcional → QA física.
5. **P3** se entrega por variante; dependencia externa documentada sin detener otros trabajos.
6. **P10**: protocolo/privacidad → encuesta piloto → informe reproducible; alertas y acuerdos en fase posterior.

Ramas sugeridas desde commit integrado o base explícita: `codex/mapa-movil-reportes`, `codex/admin-mapa-reportes`, `codex/cobertura-pendiente`, `codex/encuestas-servicio`. La implementación actual usa la primera rama y mantiene commits temáticos; las ramas adicionales siguen sugeridas para siguientes entregas. Conservar IDs P1–P10 al dividir PRs.

Pruebas por riesgo: gestos/selección/áreas seguras, adaptador nativo y restauración/idempotencia; migración/filtros/RBAC en bases temporales; importación/identidad; fixture y exclusión sintética; cálculo de encuestas con datos conocidos. DOM no sustituye cámara o layout físico. Build y suite completa al integrar cambios de contratos compartidos; no escribir pruebas espejo para un mero cambio de texto.

Mantener presupuestos actuales: precache ≤600 KiB, JS <110 KiB gzip, CSS <16 KiB gzip, guardados ≤4 MB/ocho paquetes. La base tenía sólo cientos de bytes de margen inicial: admin, cámara, encuestas y demo siguen diferidos. No repetir cifras antiguas como medición nueva.

Matriz física: M2103K19G y otro Android representativo; registrar Android/WebView, vertical/horizontal, botones/gestos, fuentes, teclado, claro/oscuro, conexión y ciclo de vida. APK: reconstruir web+nativo, comprobar commit/hash/firma, actualizar con `adb install -r` y adjuntar evidencia; no desinstalar para resolver firma diferente sin preservar datos.

## Punto de reanudación entre chats

- **Realizado ahora:** consultar el [acta de implementación](ENTREGA_PRODUCTO_2026-10-31.md). P1/P2/P4/P5/P8/P9 tienen código; P6/P7 agregan administración geográfica y demo. La aceptación física permanece abierta.
- **Primer trabajo siguiente:** QA física P1/P2/P4 en el APK nuevo, medición de frames/memoria y demo P6 con MFA. P3 continúa en la [revisión parcial de fuentes del 31](auditoria-pendientes-2026-10-31.md). No cerrar criterios físicos con pruebas DOM.
- **Antes de editar:** leer plan, evaluación VDP, hoja de ruta, últimas notas y `git status`; confirmar commit instalado/servido. Conservar `.env`, credenciales y bases privadas; no volcarlas en herramientas/documentos.
- **Registro por entrega:** ID, rama/commit inicial/final, estado, archivos, comandos/pruebas con resultado real, capturas/fixture, limitaciones, dependencia externa y siguiente acción. Estados: pendiente, en curso, bloqueado por fuente concreta, verificado, entregado. Escribir código no basta para cerrar.
- **Al finalizar interacción:** actualizar matriz/acta y referencias canónicas afectadas, revisar enlaces/diff, commit/push autorizados. Conservar informes históricos intactos.
- **Operación:** no asumir servidor o teléfono conectado por contexto previo. Consultar [operación](operacion-admin.md) y [Android](android.md); HTTP/USB local no equivale a despliegue HTTPS. Hosting mantiene su [plan separado](plan-hosting-gratuito.md).

Validación de este lote: `pnpm docs:check` comprobó **65 archivos y 386 enlaces locales**; los hashes/tamaños de **5/5 imágenes** coinciden con los originales. Diff sin errores de espacios y revisión cruzada de alcance. No se repitieron pruebas funcionales porque no cambió código; ninguno de estos controles acredita implementación de P1–P10.
