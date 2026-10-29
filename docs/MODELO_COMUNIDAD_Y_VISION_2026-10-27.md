# Modelo social de reportes y evaluación de visión computacional

27 de octubre de 2026. Propuesta de producto, **no implementación**. Acompaña el [plan de las nueve anotaciones](PLAN_PRODUCTO_COMUNIDAD_2026-10-27.md).

## 1. Recomendación

Operar un sistema de incidencias con dos vistas complementarias: **pública**, para conocer y seguir problemas revisados; **privada de administración**, para revisar evidencia, agrupar duplicados, coordinar atención y documentar resultados. La utilidad social se mide por problemas entendidos y atendidos, no por acumular quejas.

El sistema de visión conviene como una fuente adicional de **observaciones candidatas** para ese mismo circuito. La imagen de un posible daño no equivale a una falla verificada, una instrucción de reparación ni una decisión de inversión. Empezar con un piloto acotado antes de montar cámaras a escala de flota.

## 2. Lógica de operación y valor

| Actor | Necesidad | Valor recibido | Responsabilidad propuesta |
| --- | --- | --- | --- |
| Pasajero / vecino | Reportar sin perder tiempo y saber qué ocurrió después. | Captura breve, recibo y seguimiento; contexto de su parada/ruta. | Describir observación, confirmar lugar y decidir publicación. |
| Moderador | Convertir envíos heterogéneos en evidencia útil. | Bandeja, mapa, duplicados sugeridos, historial. | Pertinencia, privacidad, asociación y publicación. |
| Operador / mantenimiento | Saber qué activo necesita inspección. | Casos por unidad/estación, evidencia y prioridad revisada. | Acusar recepción y documentar intervención, si existe acuerdo. |
| Municipio / organismo | Justificar inspecciones e inversión. | Problemas persistentes, barreras de acceso y distribución de cobertura. | Validación técnica, competencia, presupuesto y ejecución. |
| Universidad / comunidad organizada | Evaluar resultados y cobertura. | Datos agregados y metodología reproducible. | Auditoría y revisión de sesgos, respetando privacidad. |

Cadena de valor: **observación → revisión → incidencia consolidada → inspección/derivación → intervención → evidencia de cierre → seguimiento**. Sin responsable de revisión y un circuito de atención, el mapa se vuelve un inventario cada vez menos vigente.

No afirmar “enviado a la autoridad” por guardar un registro. Sólo mostrar derivación/recepción cuando exista un canal acordado y constancia. Usuarios pueden reportar sin cuenta en el MVP; una cuenta puede ser opcional para seguimiento. La vista pública no necesita conocer identidad.

### Sostenibilidad

- Mantener gratuito reportar y consultar. Financiar operación mediante convenios de servicio con operadores/municipios, universidades, fondos sociales o donaciones. Son alternativas a validar, no acuerdos existentes.
- Servicio financiable: revisión y clasificación, seguimiento, calidad/cobertura del dato y tableros agregados para inspección. No vender fotos privadas ni ubicación de pasajeros, ni cobrar por ocultar incidencias.
- Presupuesto mensual = almacenamiento/transferencia + revisión humana + soporte/seguridad/respaldo + coordinación de atención; sumar cómputo/etiquetado y hardware/conectividad si hay visión. Medir tiempo de revisión por caso y costo por **incidencia útil**, no por imagen procesada.
- Capacidad orientativa = minutos disponibles de revisión / mediana observada de minutos por caso; comparar con llegadas diarias y antigüedad de cola antes de ampliar captación. No se estiman precios sin cargas ni cotizaciones.
- Acuerdos de operación deberían definir quién revisa, horarios/capacidad, categorías, área atendida, rectificación y evidencia de cierre. Prometer tiempos sólo después de medirlos y acordarlos.

## 3. Modelo de información: no confundir reportes e incidencias

**Reporte:** una observación humana, con destino, fecha, título, descripción y evidencia opcional. **Incidencia:** un problema concreto consolidado, en un activo/lugar y período, respaldado por uno o más reportes. **Detección:** propuesta de máquina, con modelo y confianza. **Actuación:** inspección o intervención documentada.

Tres fotos del mismo bache y veinte fotogramas de una pasada pueden corresponder a **una incidencia**, no a 23 daños diferentes. Una gotera nueva después de reparada puede ser reapertura o una incidencia nueva relacionada, con motivo registrado. No fusionar automáticamente todos los problemas de una estación.

Contrato propuesto, ampliación futura del esquema actual:

- `reports`: origen humano, captura/recepción, destino exacto, consentimiento, borrador/idempotencia y estado de revisión.
- `incidents`: tipo, activo/localización, precisión, apertura/última observación, gravedad revisada, estado, organismo competente cuando se conozca.
- `incident_observations`: vínculos a reportes/detecciones, motivo de asociación y quién lo confirmó; posibilidad de separar una fusión errónea.
- `evidence`: foto procesada, procedencia, fecha, acceso, retención y huella; copias públicas sanitizadas y autorización diferenciadas de evidencia privada.
- `incident_events`: revisión, cambios, asignación, inspección, cierre y reapertura con actor/fecha/motivo.
- Para visión: `detections`, versión de modelo, clase, puntuación, región de imagen, calidad, posición de cámara y estimación del objeto con incertidumbre. No identificar un vehículo público en movimiento mediante su posición en vivo.

Mantener independientes tres ejes:

1. **Visibilidad:** privado / publicable con consentimiento / publicado / retirado.
2. **Evidencia:** observación recibida / contenido revisado / inspección de campo, con procedencia. Revisión de contenido no demuestra veracidad física.
3. **Atención:** por evaluar / abierto / derivado con constancia / en atención / resuelto con evidencia / reabierto.

Hoy existen `pending`, `published`, `resolved`, `rejected` y auditoría CLI. No renombrarlos silenciosamente: diseñar migración, compatibilidad de API y reglas de publicación antes de ampliar. Las detecciones de cámara requieren reglas de uso/consentimiento de su fuente, no un consentimiento de pasajero inventado.

Agrupación sugerida por activo, categoría, cercanía espacial y temporal; la revisión decide si son duplicados. Para unidades usar identificador y periodo, no cercanía geográfica: una unidad se mueve. Guardar conteo de observaciones aparte del de incidencias, sin llamarlo “personas afectadas”. [SeeClickFix documenta una operación equivalente de asociación de solicitudes duplicadas](https://www.civicservice.civicplus.help/hc/en-us/articles/360043293074-Mark-a-Request-as-a-Duplicate); es una referencia de diseño, no una integración propuesta obligatoria.

## 4. Vista pública y panel de administración

### Pública

- En estación/ruta: acción breve para colaborar y resumen de incidencias revisadas, abiertas/resueltas y fecha de última evidencia. Abrir listado/detalle cuando el usuario lo solicite.
- Mapa opcional de incidencias con filtros de categoría, estado, antigüedad y procedencia. Agrupar puntos por escala; lista accesible equivalente. No mezclar todos los daños urbanos con la navegación de transporte por defecto.
- Detalle: qué se observó, dónde, cuándo, estado, número de observaciones asociadas, actualización y evidencia revisada; distinguir reporte comunitario, detección automática e inspección.
- Sin nombres/contactos del reportante, fotos originales sensibles ni trayectos personales. En fallas de unidad, contexto de ruta/unidad revisado, no mapa de desplazamiento actual. Ubicación pública del daño con precisión adecuada, no la localización del pasajero que lo fotografió.
- Contribuir evidencia al mismo caso y pedir rectificación/reapertura con revisión; evitar “me gusta” como medida de gravedad.
- Recibo privado para quien reporta, incluso sin consentimiento público; mecanismo de seguimiento con token no predecible/recuperación voluntaria. No afirmar que existe ya.

### Administración

Sí conviene añadirla al iniciar un piloto con volumen sostenido. La CLI actual sirve para un operador técnico, pero dificulta trabajar con evidencia, duplicados y responsables.

MVP del panel: autenticación de administradores, sesión segura y permisos por rol; bandeja pendientes con antigüedad, revisión foto/texto, corrección de destino, asociación/separación de incidencias, publicar/rechazar/retirar, anotar inspección y resolver/reabrir con evidencia. Toda escritura pasa por autorización en servidor y queda auditada; esconder una URL o un botón no proporciona seguridad. Revisión humana no permite publicar una foto sin permiso de publicación.

Roles propuestos: moderación de contenido, gestión/inspección y administración de accesos. Lectores analíticos sólo con agregados necesarios. Acceso mínimo por organización/ámbito si participan varios operadores. Revisión reforzada de cuentas privilegiadas y recuperación; no guardar secretos en frontend. Los originales privados no deben entrar en descargas masivas públicas.

Después: asignación a organismo, carga de trabajo, exportación agregada CSV/GeoJSON, historial de atención e integración con sistemas municipales si se acuerda. Mantener exportaciones públicas separadas de expedientes privados.

### Datos, conservación y resguardo

La base actual conserva reportes 90 días y admite 5000 registros/50 MB de fotos. Esa capacidad es de piloto: hay que medirla y prever almacenamiento duradero/respaldo antes de escalar. No usar SQLite en disco efímero como historial municipal.

Un análisis de tendencias de un año requiere una política explícita diferente: retener agregados efectivamente desidentificados o una base de incidencias con evidencia mínima/retención definida. No prolongar automáticamente la conservación de fotos/textos por añadir un tablero. Publicar política y revisar con responsables locales las obligaciones aplicables antes de operar cámaras; este documento no determina cumplimiento legal.

## 5. Cómo orientar inversión con justicia

La señal comunitaria sirve para decidir **qué inspeccionar y dónde falta información**. La reparación y la inversión necesitan gravedad, accesibilidad, recurrencia, población expuesta, competencia y costo técnico. Un lugar con pocos reportes puede tener poca cobertura digital, no buena infraestructura.

- Prioridad de inspección explicable: peligro observado, barrera de accesibilidad, persistencia y corroboración. Revisión humana de cada escalamiento crítico.
- Diferenciar mantenimiento corriente (banca rota), intervención urgente (elemento caído) y proyecto de inversión (parada inexistente). Una fotografía de “falta de parada” no acredita por sí sola una parada oficialmente designada ni su demanda.
- Mostrar cobertura de observación: zonas visitadas, kilómetros/periodos muestreados en el piloto de flota, antigüedad, fuentes y ausencia de datos. No publicar rutas privadas de colaboradores para demostrar cobertura.
- Comparar incidencias por exposición cuando exista un denominador fiable, no sólo total de reportes. Si no hay aforo/recorridos, declarar “sin normalización”. No inventar afectados o usuarios únicos.
- Resultado: cartera de inspecciones e intervenciones con razones visibles y evidencia, no un ranking automático de barrios “peores”.

Métricas: tasa de formularios completados, borradores recuperados, mediana/p90 de revisión, proporción de duplicados, incidencias confirmadas, tiempo hasta primera atención y cierre, reaperturas, distribución territorial y cobertura. Medir cierre respaldado, no sólo clics en “resuelto”. Una caída de reportes sola no prueba mejora.

## 6. Visión computacional: viabilidad por tipo de daño

Hay antecedentes de detección de daños viales con imágenes de teléfono. RDD2022 contiene 47 420 imágenes de seis países y cuatro categorías de grietas/baches; **no es un conjunto que cubra todas las clases pedidas ni datos de Monterrey**. Sirve como punto de partida sujeto a licencia y validación local. [Artículo y datos del equipo investigador](https://arxiv.org/abs/2209.08538), [repositorio del proyecto](https://github.com/sekilab/RoadDamageDetector).

La evaluación siguiente es una inferencia técnica para diseñar un piloto, no una precisión de modelos ya medida en RegioMóvil.

| Clase solicitada | Qué podría observar la cámara | Límite que debe conservar el producto |
| --- | --- | --- |
| Baches/grietas | Depresiones o patrones visibles del pavimento. | Sombras, parches y agua confunden; profundidad/gravedad no se determina con una sola foto monocular. |
| Alumbrado caído | Poste/luminaria inclinada, rota o sobre el suelo. | “No enciende” necesita observación nocturna y contexto; de día no se puede concluir fallo eléctrico. |
| Banquetas en mal estado | Roturas, obstrucciones o discontinuidades visibles. | Cámara frontal de bus puede no verlas; pendiente, anchura y accesibilidad exigen escala/inspección. |
| Basura | Acumulaciones visibles en zona observada. | Distinguir contenedor habitual de vertido; cambios rápidos, oclusiones y repetición de objetos. |
| Agua estancada | Lámina/charco candidato en calzada o banqueta. | Una captura no demuestra persistencia, profundidad, contaminación ni inundación; requiere observaciones temporales. |

Ausencia de detección no significa infraestructura sana: puede estar fuera de encuadre, tapada, oscura o poco representada en entrenamiento. No usar un único umbral para todas las clases ni un modelo genérico como inspector universal.

## 7. Dos orígenes de cámara, un mismo circuito

### Fotos de usuarios: primera etapa recomendada

Foto voluntaria desde el formulario → reducción/sanitización → propuesta de categoría y punto a confirmar → revisión humana → vinculación a incidencia → publicación según consentimiento. El usuario puede corregir o ignorar la sugerencia.

Capturar ubicación con permiso y confirmación; guardar por separado coordenada del dispositivo, precisión y punto del objeto. No reconstruir ubicación pública desde EXIF: hoy se elimina y debe seguir eliminándose. No exigir cámara/GPS para reportar manualmente. Procesamiento asíncrono; un fallo o espera del modelo no impide enviar el reporte.

La corrección de Archivos debe contemplar el ciclo de vida Android. La documentación v8 de [Camera](https://capacitorjs.com/docs/apis/camera) cubre captura/galería; [App y resultados restaurados](https://capacitorjs.com/docs/apis/app) explica el retorno cuando Android termina la aplicación durante una Activity externa. Es un riesgo documentado a investigar, **no** una causa ya probada del fallo C7.

### Cámara fija en una unidad: segunda etapa

“Fija” significa montada en un vehículo en movimiento. Requiere convenio con propietario/operador, montaje exterior o dirigido a la vía, alimentación segura, calibración, mantenimiento, sincronización de tiempo y GNSS. Evaluar cámara frontal para pavimento y lateral si se investigan banquetas; una sola orientación no cubre todo.

Propuesta: procesar capturas muestreadas en equipo de borde o en lote al llegar a base, filtrar imágenes borrosas/oscuras, seguir candidatos entre cuadros y subir recortes/evidencia mínima al contar con conexión. No transmitir video continuo por defecto ni agregar esa carga al celular de pasajeros. Si no hay permiso de acceso al video del operador, no existe una integración automática con sus cámaras actuales.

La latitud/longitud del bus es la de la **cámara**, no la del bache que ve adelante. Proyectar un punto del objeto requiere geometría/calibración, orientación y estimación de distancia o múltiples vistas; si no es posible, publicar segmento aproximado y radio de incertidumbre para revisión. Mapillary explica la distinción entre [detecciones en imagen](https://help.mapillary.com/hc/en-us/articles/115000967191-Object-detections) y [localización por varias imágenes](https://help.mapillary.com/hc/en-us/articles/115001770329-Mapillary-s-computer-vision-technology). Esta referencia no promete que su API cubra el problema ni obliga a contratarla.

Deduplicar en una pasada y entre días/dispositivos para no convertir 100 fotogramas en 100 baches. Oclusión o una pasada sin detección no resuelve una incidencia. Cerrar requiere nueva evidencia interpretable e inspección cuando corresponda.

Proteger rostros/placas antes de cualquier publicación y, cuando sea viable, antes de subir; verificar fallos de anonimización. Eliminar EXIF no elimina rostros. Separar repositorio privado, evidencia pública sanitizada y datos de entrenamiento; autorización específica para reutilizar imágenes en entrenamiento. Evitar grabar interior, pasajeros o audio para este objetivo. No incorporar reconocimiento de personas.

## 8. Arquitectura y límites del piloto

Reutilizar RegioMóvil como captura/contexto/mapa y sistema de revisión; mantener inferencia fuera del proceso de navegación y del bundle inicial. Flujo:

1. Ingesta autenticada/limitada según fuente con ID idempotente, evidencia y procedencia.
2. Cola de trabajos con validación, límites y reintentos; foto manual puede entrar sin esperar inferencia.
3. Control de calidad y sanitización → inferencia versionada → detección candidata.
4. Propuesta espacial/temporal de asociación → revisión/confirmación → incidencia.
5. API pública de incidencias revisadas + mapa por escala/agrupación + panel privado.
6. Evidencia de inspección/reparación y evaluación posterior.

No elegir GPU/proveedor/modelo definitivo antes de medir volumen, latencia tolerable, requisitos offline y licencias de datos/pesos. Un detector o segmentador ligero de clases concretas es un candidato de comparación; procesamiento en nube, borde o híbrido se decide con esos datos. Versionar pesos, etiquetas, métricas, umbrales y conjunto de evaluación.

### Piloto por puertas de decisión

**V0, base operativa:** corregir captura/borradores y contar con revisión, recibo y agrupación de incidencias. Sin esos elementos, más detecciones sólo aumentan la cola.

**V1, experimento con fotos consentidas:** empezar por baches visibles; conjunto local anotado con ejemplos positivos y negativos (sombras/parches/charcos). Propuesta inicial de planificación: 300–500 imágenes locales para explorar factibilidad, no para declarar suficiencia estadística ni cobertura de cinco clases. Separar evaluación por corredor, fecha y dispositivo; no repartir fotogramas vecinos entre entrenamiento y prueba. Doble anotación de una muestra y revisión de desacuerdos.

**V2, una unidad y uno/dos corredores acordados:** medición diurna controlada, revisión humana de todos los candidatos, mapa privado primero. Registrar imágenes descartadas, desajuste de ubicación, consumo y costo de revisión. Expandir horario/clases sólo después de comprobar V1/V2.

**V3, operación limitada:** publicar incidencias revisadas y capa de procedencia; evaluar utilidad de inspecciones con un socio responsable. Escalar a más buses/clases cuando la capacidad humana y la mejora de datos lo justifiquen.

Criterios propuestos para discutir con el piloto, no resultados garantizados: precisión de candidatos de bache ≥85% en prueba local independiente, recuperación ≥70% dentro de cobertura observable, p90 del error de localización ≤15 m para publicar un punto; si no se cumple localización, segmento aproximado y revisión. Publicar tamaño de muestra e intervalos de incertidumbre; umbrales definitivos dependen de costo de error y tarea. No extrapolarlos a basura, banquetas o alumbrado.

Además medir: falsos candidatos por km, incidentes únicos encontrados por km, duplicados remanentes, minutos de revisión por incidencia válida, días hasta inspección, desempeño día/noche/lluvia/zona/cámara, batería/temperatura y transferencia por hora. Comparar con inspección/manual en los mismos corredores y calcular costo total por incidencia confirmada. Muestrear también negativos/no detectados para medir omisiones; no medir sólo lo que propuso el modelo.

Detener ampliación si la ubicación no sirve, crece la cola sin atender, fallan controles de privacidad o no mejora el costo/utilidad frente a captura manual. Un piloto fallido puede dejar datos/anotaciones útiles sin justificar cámaras masivas.

## 9. Decisiones para las siguientes interacciones

La siguiente implementación atiende T1–T5 del plan de producto. Panel admin, consolidación de incidencias y visión quedan como evolución propuesta; no se construyen ni contratan en esta ronda.

Antes de T6 concretar responsables de revisión, capacidad y circuito de seguimiento. Antes de V2 concretar socio/permiso de cámara, cobertura, retención y presupuesto. Estas son decisiones para habilitar esas etapas futuras, no razones para detener las correcciones ya solicitadas.
