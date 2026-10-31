# P10 · Medición comunitaria del servicio de transporte

**Estado: diseño, 31 de octubre de 2026.** Complementa el [plan de producto y continuidad](PLAN_PRODUCTO_COMUNIDAD_2026-10-31.md). Este documento evalúa la propuesta VDP; no anuncia encuestas, convenios, alertas ni publicación institucional ya implementados.

## Propósito y alcance

Convertir experiencias de viaje en indicadores comprensibles para identificar problemas, dialogar con operadores y evaluar cambios. El primer producto será un observatorio de participación voluntaria: describirá lo que respondieron sus participantes, con cobertura y limitaciones visibles. Sus resultados no representarán automáticamente a todos los pasajeros ni demostrarán por sí solos una infracción.

Separar tres instrumentos desde el modelo de datos y la interfaz:

- **Reporte:** observación localizada, con descripción y posible fotografía; admite revisión, publicación y seguimiento.
- **Encuesta:** respuestas estructuradas sobre un intento de abordaje o viaje; permite estimar indicadores dentro de la muestra obtenida.
- **Alerta:** aviso temporal de una interrupción, con fuente, vigencia y revisión. No sustituye atención de emergencias.

Una persona podrá iniciar una encuesta después de viajar o mientras espera y crear un reporte relacionado sin volver a escribir el contexto. La relación no convierte ambos registros en dos incidentes ni exige publicar la encuesta individual.

## Qué medir: nueve dimensiones

El formulario conservará una versión de cuestionario, ruta y sentido cuando se conozcan, periodo aproximado, estado del viaje y respuestas omitidas. Permitirá «No sé», «No aplica» y omitir preguntas. La fotografía pertenecerá al reporte, no será requisito de una calificación.

| Dimensión solicitada | Captura propuesta | Indicador y límite |
| --- | --- | --- |
| 1. Tiempo de espera | Minutos declarados; llegó/abordó, abandonó o sigue esperando. Distinguir recuerdo de cronómetro voluntario. | Mediana y distribución de esperas terminadas; mostrar aparte esperas en curso y abandonos. |
| 2. El camión no se detiene | Intentos de abordaje declarados y cuántas unidades de la ruta pasaron sin permitir abordar. | Intentos afectados / intentos registrados con información suficiente; publicar ambos recuentos. |
| 3. Volumen de pasajeros | Con asiento disponible, de pie con espacio, lleno o muy lleno; «No abordé». | Porcentajes por nivel ordinal, sin inventar capacidad medida ni promediar etiquetas. |
| 4. Servicio del conductor | Preguntas separadas sobre trato y percepción de conducción, sin nombre ni imagen del conductor. | Distribuciones por pregunta; una respuesta no acredita una conducta individual. |
| 5. Limpieza | Escala breve con anclas comprensibles, de muy mala a muy buena. | Distribución de respuestas aplicables, no diagnóstico sanitario. |
| 6. Estado de la unidad | Valoración y categorías observables: asiento, puerta, filtración u otro desperfecto. | Frecuencia declarada; daños concretos pueden abrir un reporte separado. |
| 7. Clima encendido | Encendido, apagado, no existe o no se pudo identificar; confort térmico aparte. | Proporción declarada por estado, sin equiparar encendido con funcionamiento adecuado. |
| 8. Cobro electrónico | No intentó pagar así, funcionó, falló o no disponible; medio de pago por categoría general. | Fallos / intentos de pago electrónico declarados; no todos los viajes. |
| 9. Entrega de boleto | Entregado, no entregado, no sabe o no aplica; distinguir recibo electrónico cuando corresponda. | Distribución por modalidad; no concluir obligación legal sin revisar el régimen aplicable. |

«Sigo esperando» es una observación **censurada**: todavía no sabemos la espera final. No debe tratarse como cero ni como viaje completado. El piloto mostrará su duración observada por separado; cualquier análisis de supervivencia posterior necesitará especificación y revisión metodológica. Cada porcentaje tendrá su propio denominador; respuestas ausentes no equivalen a una experiencia positiva.

## Uso correcto de NPS

NPS pregunta la probabilidad de recomendar, de 0 a 10. Promotores: 9–10; pasivos: 7–8; detractores: 0–6. Se calcula **100 × (promotores − detractores) / respuestas válidas a esa pregunta**, incluyendo pasivos en el denominador. Su rango es −100 a 100: no es un promedio de calificaciones ni un porcentaje de fallas. Esta definición proviene de [Bain, creador del sistema](https://www.netpromotersystem.com/about/measuring-your-net-promoter-score/).

La recomendación sería una pregunta complementaria y opcional, con periodo y ruta definidos. Donde hay pocas alternativas de transporte puede expresar necesidad, no preferencia. Las nueve dimensiones tendrán indicadores propios; no se llamarán nueve NPS ni se fusionarán en un índice general sin una validación posterior. Ejemplo de prueba: 20 promotores, 10 pasivos y 20 detractores producen NPS 0 con 50 respuestas, aunque sus experiencias sean heterogéneas.

## Participación, calidad y protección frente al abuso

No exigir número de boleto, ID de tarjeta, documento o fotografía en el MVP. El requisito excluiría viajes sin boleto y modalidades de pago distintas, precisamente experiencias que interesa registrar. Tampoco garantizaría representatividad, una persona única ni protección frente a represalias.

La calidad se abordará con preguntas neutrales, prueba de comprensión, invitaciones fuera de los momentos de queja y documentación del reclutamiento. Si existen recursos, combinar participación digital con recolección asistida en horarios y zonas diversos. Las [buenas prácticas de AAPOR](https://aapor.org/standards-and-ethics/best-practices/) respaldan explicitar población objetivo, selección, modo de recolección y limitaciones; aquí se propone un piloto voluntario, sin selección probabilística.

Aplicar idempotencia, límites de envío y controles de inconsistencias, con motivos registrados y posibilidad de revisión. **Evitar duplicados y abuso no elimina sesgos de participación.** Una encuesta válida no depende de que la opinión sea favorable ni de su aprobación como contenido público. Separar validación técnica, reglas de elegibilidad y revisión del texto libre; registrar exclusiones sin borrar críticas por su sentido.

Una validación de viaje futura requeriría acuerdo con el emisor: preferir comprobantes de un solo uso y vencimiento breve, sin recibir identificadores completos. Un hash simple de tarjeta no anonimiza; un HMAC puede seudonimizar, pero permite vinculación y sigue necesitando protección. No prometer anonimato absoluto mediante esos mecanismos.

## Privacidad, información pública y respaldo institucional

Antes de recolectar datos personales, identificar responsable, finalidades, aviso de privacidad, accesos, conservación y mecanismo de derechos ARCO. Revisar transferencias y obligaciones aplicables con asesoría competente. La referencia es la [LFPDPPP vigente, reforma del 14 de noviembre de 2025](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf); esta propuesta no sustituye dicha revisión ni declara cumplimiento.

Propuesta de producto: no publicar respuestas individuales, recorridos personales, tarjetas, boletos, rostros, placas ni datos de conductores. Mantener separadas identidad administrativa y participación. El mapa de reportes aprobados mostrará publicaciones abiertas y, mediante un filtro explícito, resueltas; las encuestas usarán otra capa agregada. Datos sintéticos tendrán base y distintivo propios y quedarán excluidos de toda publicación real.

Los informes podrán integrar expedientes verificables: versiones, procedencia, conteos y decisiones de revisión. Una organización o profesional podrá asesorar sobre peticiones, quejas formales y vías legales. No prometer «forzar por ley» una mejora, resultados judiciales ni admisibilidad automática de fotografías. La distribución por medios oficiales sólo ocurrirá mediante acuerdos y autorización; esta fase no envía comunicaciones a autoridades o terceros.

## Informe mensual e interpretación

Cerrar meses naturales en `America/Monterrey`, guardar límites UTC y distinguir fecha del viaje, recepción y revisión. Publicar versión del cuestionario, fecha de corte y política de correcciones. Cada informe incluirá:

1. Respuestas recibidas, elegibles, excluidas y motivo; viajes/intentos no son personas únicas.
2. Numeradores, denominadores, faltantes y «No aplica» por indicador.
3. Cobertura por ruta, municipio, horario y modalidad conocida; catálogo versionado, sin afirmar cobertura completa por disponer de fichas de rutas.
4. Distribuciones y cambios descriptivos comparables, aclarando variaciones del cuestionario o composición de participantes.
5. Límites de participación, incertidumbre y datos no disponibles. No inventar margen de error probabilístico, causalidad ni representatividad.

Un umbral provisional de 30 respuestas por corte puede impedir comparaciones demasiado escasas; **no convierte la muestra en representativa ni garantiza privacidad**. Revisar tamaño de celdas, combinaciones y diferencias entre publicaciones; agrupar o suprimir cortes pequeños, evitando reconstrucción mediante totales. No ordenar rutas como «mejores/peores» sin cobertura comparable.

El sistema de reportes conserva actualmente 90 días: no basta para series anuales. Diseñar conservación limitada de encuestas y agregados mensuales antes de recogerlos, con revisión de privacidad, corrección y eliminación; los agregados no serán perpetuos por defecto. El informe conservará fecha de corte aunque cambie después el estado de un reporte.

## Alertas y continuidad

Accidentes, averías y negativas de servicio en aplicaciones o establecimientos tendrán categoría, hora, fuente y estado de revisión. Mostrar «observación recibida», «revisada» o «expirada», sin convertir testimonios sobre Urbi u otros actores en acusaciones automáticas. Exigir caducidad, corrección y retirada; no prometer tiempo real sin fuente y operación sostenibles ni revelar posiciones vivas de unidades.

| Fase | Entrega y criterio de aceptación |
| --- | --- |
| V1 · Instrumento | Cuestionario versionado probado con usuarios; nueve dimensiones, saltos y denominadores definidos. Documentar comprensión y duración. |
| V2 · Piloto | Base separada de reportes, envíos idempotentes y acceso restringido; probar esperas censuradas, omisiones y exclusiones sin sesgo por opinión. |
| V3 · Informe | Fixture reproducible verifica NPS y porcentajes; corte mensual, cobertura, celdas pequeñas y correcciones comprobados. Sin datos sintéticos en resultados reales. |
| V4 · Operación | Responsables de revisión, privacidad, retención y alertas; probar vencimiento, retirada y recuperación. Convenios y publicación externa separados. |
| V5 · Evaluación | Comparar periodos con diseño revisado; decidir ampliación y validación de viaje sólo con evidencia, acuerdos y evaluación de riesgos. |

**Continuidad:** al 31 de octubre de 2026 todo P10 permanece en diseño. La siguiente implementación deberá registrar decisiones, versión del instrumento, responsable, pruebas y límites en el plan principal antes de habilitar recolección real.
