# Propuesta social de RegioMóvil

**Estado:** piloto funcional y propuesta de evolución. **Revisión:** 29 de octubre de 2026. Este documento describe el valor que se busca comprobar; no acredita impacto social medido, convenios institucionales ni un servicio de transporte en tiempo real.

## Propósito y personas destinatarias

RegioMóvil busca facilitar la consulta y planeación del transporte público de la Zona Metropolitana de Monterrey y convertir observaciones de sus usuarios en evidencia útil para mejorar estaciones, paradas y unidades.

La hipótesis social es que reunir información dispersa, conservar trayectos para consultarlos sin conexión y facilitar observaciones contextualizadas puede reducir la incertidumbre al viajar y ayudar a orientar inspecciones. La reducción de tiempos, gasto o estrés todavía debe medirse con usuarios y datos operativos.

| Personas o equipos                                  | Necesidad que se atiende                                    | Aportación propuesta                                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Pasajeros frecuentes y ocasionales                  | Entender opciones, conexiones y limitaciones del recorrido. | Consulta conjunta de Metro y autobuses; guía por etapas y viajes guardados.                                  |
| Personas con conectividad limitada                  | Consultar información durante un traslado.                  | Catálogo y cálculo local; alternativas guardadas con mapa. El primer acceso web requiere preparar la caché.  |
| Personas mayores o con necesidades de accesibilidad | Leer y utilizar la información con menos barreras.          | Texto ampliado, contraste, teclado y voz cuando el dispositivo la ofrece; evaluación con personas pendiente. |
| Comunidad usuaria                                   | Comunicar una observación en el contexto de su viaje.       | Formulario con estación o variante de ruta, descripción y foto voluntaria.                                   |
| Equipos de mantenimiento y organismos competentes   | Identificar problemas que merecen inspección.               | Evolución hacia casos consolidados y seguimiento, sujeta a responsables y acuerdos de operación.             |

La preferencia de accesibilidad del planificador no confirma accesibilidad física: faltan verificaciones de accesos, elevadores, banquetas y vehículos.

## Qué aporta hoy el piloto

La aplicación funciona en Android y navegador, con una vista de consulta para paradas. Permite explorar redes, comparar alternativas, seguir etapas y guardar viajes sin cuenta obligatoria. El catálogo incluye **214 servicios**; el grafo incorpora **191 de 209 variantes de autobús y tres líneas de Metro**, con **10 806 puntos publicados**, según los artefactos del 28 de octubre. Las 18 variantes sin geometría y las líneas L4/L6 en construcción quedan fuera del cálculo. Estos conteos describen el catálogo incorporado, no toda la oferta operativa metropolitana ni paradas verificadas en campo. Fuentes: [catálogo](../data/transit-catalog.json), [red de cálculo](../data/mobility-network.json) y [auditoría de pendientes](auditoria-pendientes-2026-10-28.md).

Las llegadas, afluencia, condiciones de unidades y duraciones son simulaciones identificadas. El orden y sentido de recorridos de autobús requieren validación operativa; una geometría publicada no garantiza servicio vigente ni un cruce peatonal seguro. No hay integración de cobro, telemetría de flota o recepción institucional de reportes.

Los reportes comunitarios se pueden asociar a estación, recorrido o unidad, incluso durante la guía. Nuevos envíos quedan privados y pendientes de revisión. Sólo se publican con consentimiento y revisión humana de contenido; esa revisión no verifica físicamente el daño. Existe moderación por terminal con registro de decisiones. La [operación actual](quejas-comunitarias.md) describe estados, conservación y comandos.

## De la participación a una mejora verificable

La unidad de participación es el **reporte**: una observación recibida. La unidad futura de gestión será la **incidencia**: un problema delimitado por lugar o activo y periodo, que puede reunir varios reportes. La **actuación** será una inspección o intervención respaldada por evidencia. Diez fotografías de la misma banca rota pueden representar una incidencia; no diez daños ni diez personas distintas.

El circuito propuesto es: recibir → revisar contenido y destino → agrupar con revisión humana → inspeccionar o derivar con constancia → documentar atención → comprobar cierre o reapertura. Hoy están implementadas la recepción y moderación de reportes; la consolidación de incidencias, asignaciones y seguimiento institucional son trabajo futuro.

Conviene mantener **dos vistas complementarias**:

- **Pública:** observaciones autorizadas en su estación o ruta, estado y fecha de revisión. Una evolución puede mostrar casos consolidados y evidencia de atención, con una lista accesible equivalente al mapa.
- **Administración privada:** bandeja y antigüedad, revisión de fotografías, asociación y separación de duplicados, responsables, inspecciones y auditoría. Requiere autenticación, permisos en servidor y reglas de operación antes de habilitarla.

Los conteos públicos sirven para encontrar recurrencias y vacíos de información. La inversión exige además gravedad, barreras de acceso, exposición, competencia institucional, factibilidad y costo. La frecuencia de reportes puede reflejar uso de la app o conectividad: un barrio con menos reportes no debe interpretarse como un barrio sin problemas.

## Resultados e indicadores del piloto

Primero se debe fijar una línea base, periodo, corredores y muestra; después acordar metas. Los indicadores siguientes son una propuesta de evaluación, **no valores obtenidos**. La aplicación no incorpora analítica de uso ni identifica personas únicas; medir tareas o experiencia requiere un estudio voluntario y datos mínimos.

| Resultado esperado                 | Indicador y denominador                                                                    | Condición de interpretación                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Mayor claridad al planear          | Tareas completadas sin ayuda / intentos observados; tiempo por tarea.                      | Usar tareas comparables e incluir quienes abandonan. Evaluar comprensión de la simulación.                    |
| Consulta con conectividad limitada | Tareas offline completadas / intentos con instalación y datos preparados.                  | Separar primer acceso, consulta guardada y cálculo nuevo.                                                     |
| Revisión sostenible                | Mediana y p90 de tiempo recepción–primera revisión; pendientes por antigüedad.             | Informar ventana y número de reportes revisados; mostrar también los aún pendientes.                          |
| Evidencia que ayuda a inspeccionar | Incidencias confirmadas / incidencias inspeccionadas; reportes asociados / incidencia.     | Requiere modelo de incidencias e inspección futuros. No extrapolar la muestra inspeccionada a toda la ciudad. |
| Atención comprobable               | Casos cerrados con evidencia / casos elegibles del periodo; tiempo a cierre y reaperturas. | Definir cohorte y plazo de seguimiento. El estado actual `resolved` no demuestra por sí solo una reparación.  |
| Cobertura equitativa               | Sitios observados / sitios incluidos en el piloto, por zona y tipo de fuente.              | No equivale a cobertura poblacional. Para cámaras, declarar kilómetros y periodos efectivamente observables.  |
| Viabilidad de operación            | Costo de revisión y operación / incidencias útiles confirmadas, por periodo.               | Registrar trabajo humano, soporte y almacenamiento; definir «útil» antes de medir.                            |

No calcular tasas por pasajero, comparativas de calidad entre rutas ni población afectada sin denominadores fiables. La retención actual de reportes es de 90 días: un análisis anual necesitará una política aprobada de agregados desidentificados, sin prolongar automáticamente la conservación de fotografías o textos.

## Gobernanza, privacidad y sostenibilidad

Antes de ampliar la captación se necesitan responsables de revisión, horarios, capacidad, criterios de publicación, rectificación, protección de datos y evidencia de cierre. Si participa un operador u organismo, el acuerdo debe precisar qué recibe, qué puede atender y cómo deja constancia. Guardar un reporte no significa enviarlo a una autoridad.

Los roles propuestos son mantenimiento del producto, moderación de contenido, inspección o atención y evaluación de resultados. Cada responsabilidad debe tener una persona o entidad designada antes de comprometer tiempos de respuesta. La comunidad debe poder conocer los criterios y solicitar correcciones; los expedientes privados se limitarán al personal autorizado.

El piloto no exige cuenta para reportar. La publicación es voluntaria; las fotografías se reducen y se eliminan metadatos. Esto no anonimiza rostros o placas: su revisión sigue siendo necesaria. La ubicación del seguimiento permanece en memoria; los viajes se conservan localmente por decisión expresa. Fuentes y límites: [privacidad](lugares-y-privacidad.md) y [reportes](quejas-comunitarias.md).

Se propone mantener gratuita la consulta y participación. Posibles fuentes de sostenimiento son fondos sociales, universidades, donaciones o convenios de operación y análisis agregado; **no existen compromisos acreditados en este repositorio**. El presupuesto debe incluir revisión humana, soporte, seguridad, respaldo y coordinación, además del servidor. No se propone vender ubicaciones personales o evidencia privada ni cobrar por ocultar reportes.

## Visión computacional: evolución sujeta a evidencia

Un sistema aledaño podría sugerir daños visibles a partir de fotos voluntarias y, mediante acuerdos específicos, cámaras montadas en unidades. Sería una fuente de **detecciones candidatas** para el mismo circuito de revisión. Hoy no hay modelo de visión entrenado, cámaras conectadas ni mediciones locales de precisión.

Se propone comenzar con una clase acotada, por ejemplo baches visibles, y evaluar imágenes locales con separaciones por corredor, fecha y dispositivo. Medir falsos positivos, daños omitidos, error de localización, duplicados y minutos de revisión por incidencia útil. Sombras, agua, oclusiones y encuadre limitan lo observable; una imagen no demuestra persistencia de agua ni un fallo eléctrico de alumbrado.

Ampliar a flota requiere permiso del operador, protección de personas y placas, localización del objeto con incertidumbre, retención definida y capacidad de inspección. No se propone reconocimiento de personas ni video continuo como condición de uso. La [evaluación ampliada de comunidad y visión](MODELO_COMUNIDAD_Y_VISION_2026-10-27.md) contiene las hipótesis técnicas; su contenido sigue siendo propuesta.

## Próxima decisión social

Concretar un piloto acotado con comunidad usuaria, responsables de revisión y equipo técnico: validar comprensión y accesibilidad, verificar recorridos y registrar capacidad de atención. Evaluar lo aprendido antes de prometer cobertura total, tiempos de servicio o beneficios cuantificados. La presentación breve para aliados está en el [pitch](pitch.md).
