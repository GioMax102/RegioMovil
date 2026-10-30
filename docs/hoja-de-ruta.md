# Hoja de ruta y continuidad

Fecha base: **29 de octubre de 2026**, actualizada con el lote `codex/administracion-ciberseguridad`. Este documento prioriza continuidad de la entrega documental y del panel privado; no compromete fechas, presupuesto ni acuerdos con autoridades. El código y las pruebas son la fuente del estado implementado. Los informes con fecha conservan decisiones y evidencias de cada entrega.

## Estado y criterio de producto

Existen web/PWA, Android, exploración de red, planificación experimental, guía, guardados offline y reportes con publicación revisada. El nuevo panel privado implementa Better Auth 1.7.14, TOTP obligatorio, roles, sesiones/CSRF, bandeja y evidencia, decisiones con versión e indicadores agregados. Cuentas y recuperación se administran por CLI. También existen copias SQLite online, purga periódica e instrumentación/Compose Prometheus/Grafana, probados en entorno temporal. No se acredita instalación remota ni operación sostenida. La matriz OWASP es parcial y la consolidación de incidencias, atención institucional y visión computacional siguen pendientes.

Antes de ampliar el uso, el producto debe conservar datos confiablemente, permitir operación responsable y demostrar su comportamiento en dispositivos reales. Después se puede medir impacto social. Un número de reportes no demuestra por sí solo daño, demanda de inversión ni representatividad de toda la población.

Para la instalación remota de R1/R2, seguir el [plan de hosting gratuito](plan-hosting-gratuito.md), evaluado el 30 de octubre de 2026. Recomienda una VM con disco local persistente y aceptación por etapas; no acredita un servidor contratado ni desplegado.

## Entregas priorizadas

| ID / prioridad                                           | Resultado y dependencia                                                  | Criterios de aceptación                                                                                                                                                                                                                                                                        | Responsable por rol                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| R0 · completado documentalmente                          | Especificación, propuesta, pitch, contratos y revisión                   | Mantener referencias canónicas alineadas con código e informes fechados sin reescribir historia.                                                                                                                                                                                               | Mantenimiento + revisión técnica               |
| R1 · implementado parcialmente                           | Seguridad y persistencia; [matriz OWASP](matriz-owasp.md)                | Hay MFA/roles/CSRF, revocación y regresiones, copias online y CI de seguridad. Falta evaluación íntegra ASVS/WSTG, revisión externa/dinámica, TLS del destino, recuperación institucional MFA, RPO/RTO y ejercicio de incidente/restauración con responsables.                                 | Seguridad + backend + operación + privacidad   |
| R2 · implementación local; operación pendiente           | Observabilidad técnica; [procedimiento](operacion-admin.md)              | Listener privado, etiquetas finitas, Compose/panel y reglas disponibles y ensayados temporalmente. Instalar/verificar en destino; medir umbrales, disco/WAL y proveedores; configurar guardia, prueba de caída, retención/coste y SLO medido.                                                  | Operación + backend                            |
| R3 · moderación implementada; gestión de casos pendiente | Panel autenticado y siguiente evolución comunitaria                      | Provisión CLI, TOTP, roles, bandeja/fotos, publicación/rechazo/retirada/resolución, historial, CAS e indicadores listos en código. Validar operación con equipo; diseñar entidades de incidencia/intervención, agrupación revisable, asignación, inspección, evidencia de cierre y reapertura. | Backend + seguridad + comunidad + producto     |
| R4 · iterativo con línea base                            | Visual, accesibilidad, renderizado y memoria                             | Ensayos físicos de cámara/galería/archivos, cancelar/Atrás y recreación; guía conserva paso/borrador; mapa y trayectos legibles a 320/390 px, texto ampliado y TalkBack. Perfiles antes/después y presupuestos existentes respetados.                                                          | Frontend + Android + diseño + QA               |
| R5 · investigación paralela                              | Cerrar cobertura con evidencia                                           | Resolver cada variante pendiente con procedencia, derechos y revisión. Regenerar grafo/inventario y probar segmentos, identidad y trayectos. No sustituir variantes por códigos iguales ni geometrías inventadas.                                                                              | Datos geográficos + revisión de movilidad      |
| R6 · piloto social medible                               | Medir utilidad y equidad, después de R1–R4                               | Comunidad/operador participante y circuito de atención acordados; línea base y denominadores disponibles; revisión de sesgos por zona/conectividad; resultados publicados como evaluación del piloto.                                                                                          | Comunidad + evaluación + aliados               |
| R7 · exploración posterior                               | Visión computacional adyacente; depende de gobierno/evidencia de R3 y R6 | Una categoría de daño, datos autorizados y conjunto de evaluación separado; precisión/recobrado por clase/contexto, duplicación y falsos positivos medidos; anonimización comprobada, revisión humana y costo por incidencia útil.                                                             | Investigación + privacidad + datos + operación |

R1 y R4 pueden continuar en paralelo. El panel permanece desactivado por defecto; habilitarlo exige configurar identidad y verificar operación/TLS antes de exposición remota. Prometheus/Grafana muestran salud técnica; el panel de administración gestiona evidencia y decisiones. Son productos operativos diferentes.

## Administración: entrega implementada y siguiente alcance

Separar **observación** (lo enviado por una persona), **incidencia** (caso consolidado y revisado) e **intervención** (inspección/reparación con evidencia). Hoy la base almacena reportes y sus cambios de moderación; no contiene esas tres entidades. `resolved` actual es un estado de moderación y no acredita una reparación inspeccionada.

Roles implementados: `analyst` ve sólo agregados; `moderator|admin` pueden revisar expedientes y fotos y moderar. Los accesos se aprovisionan y revocan desde CLI del host; `admin` no administra cuentas por HTTP. El servidor verifica permisos, MFA, origen/CSRF y cambios de acceso antes de confirmar decisiones. Las notas se registran con actor autenticado y versión, sin convertir la bitácora SQLite en un registro inmutable. Contrato: [API administrativa](api-administracion.md).

El panel ya ofrece conteos retenidos por estado/categoría, antigüedad y mediana/p95 a primera revisión, cuotas y distribución limitada a 100 grupos con aviso de truncamiento. Se debe ampliar hacia **casos**, sin renombrar estos reportes como daños únicos. Los indicadores siguientes distinguen lo disponible de lo que exige ese modelo futuro:

| Indicador                                | Estado, definición y límite                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Pendientes y antigüedad                  | Implementado: total pendiente, fecha más antigua y cantidad con más de 7 días, dentro de retención de 90 días.                             |
| Tiempo de primera revisión               | Implementado: mediana/p95 de primera decisión menos envío y cantidad revisada; mostrar pendientes por separado para evitar sesgo.          |
| Incidencias abiertas por categoría/lugar | Casos consolidados, no suma bruta de fotos/reportes. Mostrar cobertura y fecha; sin denominador de uso no llamarlo tasa de falla.          |
| Duplicación y calidad de evidencia       | Proporción vinculada a un caso existente y descartada, indicando razón; no confundir descarte por privacidad con falsedad.                 |
| Inspección, cierre y reapertura          | Tiempo y evidencia de inspección/reparación, quién confirma y casos reabiertos. Requiere modelo nuevo y acuerdos operativos.               |
| Cobertura/equidad                        | Zonas, rutas y periodos con evidencia; distinguir ausencia de reportes de ausencia de problemas. Evitar rankings de inversión automáticos. |

La vista pública debe mostrar observaciones consentidas y revisadas o incidencias agregadas con estado/fecha/fuente comprensibles. Mantener evidencia privada y herramientas de gestión en un acceso restringido. Priorizar con severidad, accesibilidad, exposición, recurrencia y viabilidad; la cantidad de usuarios que reporta es una señal más. Validar la metodología con quienes usan y atienden la infraestructura.

## Rendimiento y memoria: medir antes de ampliar

Los presupuestos comprobados en [tests/performance.test.mjs](../tests/performance.test.mjs) son: recursos iniciales menores a 600 KiB, cada JS menor a 110 KiB gzip y cada CSS menor a 16 KiB gzip. [Guardados](../src/mobility/savedTrips.ts): máximo ocho viajes y 4.000.000 bytes. Preservar carga diferida de grafo/cámara y la entrada administrativa separada; visión sigue pendiente.

Medir en Android de gama de entrada, web y offline: tiempo hasta interacción, latencia de búsqueda/planificación, duración de fotogramas al mover mapa, nodos renderizados, RSS/heap y recuperación tras cerrar vistas. Establecer dispositivo, versión, escenario, número de repeticiones y línea base; no declarar mejoras con una sola medición.

Prueba representativa: abrir/cerrar mapa y guía repetidamente, cambiar filtros, generar rutas, entrar/salir de cámara y volver tras segundo plano. Verificar liberación de listeners, object URLs, observadores y trabajo cancelado. En servidor, combinar carga HTTP, fotos y planificación para observar el bucle de eventos y SQLite. Una alerta de memoria no sustituye corregir la retención que causa el crecimiento.

## Visión computacional: puerta de decisión

Comenzar con fotografías voluntarias y una categoría observable; las cámaras exteriores en unidades son una segunda etapa condicionada a autorización, montaje/calibración y privacidad. No grabar pasajeros/audio para este objetivo ni incorporar reconocimiento de personas. Eliminar EXIF no anonimiza rostros o placas.

La detección debe crear un **candidato**, no publicar ni declarar daño confirmado automáticamente. Asociar procedencia, versión del modelo, ubicación y su incertidumbre; deduplicar entre fotogramas/días; permitir revisión y corrección. Una pasada sin detección no demuestra reparación. Separar captura, procesamiento asíncrono y publicación del proceso de navegación para controlar memoria, batería y disponibilidad.

Continuar el diseño en [modelo comunitario y visión](MODELO_COMUNIDAD_Y_VISION_2026-10-27.md), que es una propuesta fechada. Aprobar la siguiente etapa sólo si produce evidencia útil con calidad, privacidad y coste medidos; actualmente no hay modelo de daño entrenado, cámaras conectadas ni operación de ese sistema.

## Protocolo para continuar entre interacciones

1. Leer [índice de documentación](README.md), esta hoja, el [plan del lote](plan-administracion-seguridad.md) y la última entrega fechada; comprobar rama, commit y `git status`. No asumir que el navegador/APK corresponden al código actual.
2. Elegir un ID de entrega, responsable por rol y criterio de aceptación. Registrar dudas/decisiones que cambien contratos, privacidad o presupuesto antes de implementarlos.
3. Implementar un cambio revisable con datos sintéticos y preservar evidencia privada fuera de Git. Ejecutar las verificaciones que correspondan al cambio y registrar resultados nuevos; no reutilizar cifras antiguas de pruebas como si fueran actuales.
4. Actualizar documento canónico si cambió el comportamiento; añadir evidencia fechada con commit, comandos, resultados, riesgos, artefactos y limitación de hardware/despliegue. Registrar exactamente qué sigue pendiente.
5. Revisar diff, commit y push según autorización vigente. Si se instala APK, anotar versión, hash y dispositivo observado; si no se pudo, dejarlo pendiente explícitamente. Ninguna entrega documental acredita despliegue o instalación.

Registro mínimo por entrega: `ID · fecha · commit · resultado · pruebas/evidencia · riesgos · siguiente acción`. Un estado «completo» exige sus criterios de aceptación; presupuesto agotado o fin de conversación no los sustituye.
