# Próximas iteraciones: red de autobuses

> Registro histórico: conserva el alcance y las cifras de su fecha. Para el estado vigente, consultar el [índice documental](README.md), la [especificación técnica](especificacion-tecnica.md) y la [hoja de ruta](hoja-de-ruta.md).

Ya se incorporaron Muevo León / urbanas IMA, RegioRuta, Ecovía / GMG, Troncales e integradas y Transmetro al catálogo consultable, con búsqueda, filtros y doce mapas de autobús. Las ampliaciones L4/L6 están documentadas como obras. Ver [integración y cobertura actual](integracion-rutas.md). El planificador de lugares y transporte combina L1–L3 con los recorridos de autobús que tienen geometría disponible, en un modelo experimental. Ampliar y validar esa cobertura requiere el trabajo siguiente.

## Trabajo previo por red

- Identificar y verificar las fuentes oficiales, su fecha de actualización, licencia y condiciones de reutilización. Confirmar si existe un conjunto descargable y cómo se mantendrá vigente.
- Validar nombres e identificadores de rutas, ramales, sentidos, variantes, paradas y coordenadas contra la operación publicada. Distinguir recorridos y horarios verificados de estimaciones o simulaciones.
- Modelar las conexiones entre autobuses y Metrorrey, las paradas de transbordo y los tramos a pie. Verificar tarifas, reglas de integración y accesibilidad antes de mostrarlas como datos confirmados.
- Ampliar la búsqueda por texto y selección por lista ya disponibles con sentido de servicio y parada de abordaje, una vez verificados.
- Mantener los mapas publicados ya visibles y validar sus puntos como paradas operativas y transferencias antes de añadirlos a un itinerario.
- Mantener los paquetes locales de hasta ocho alternativas, con etiqueta, geometrías y fecha de cálculo. Ampliar sus datos verificados y mantener separados los avisos y estimaciones que requieren conexión.

## Criterio de incorporación

Integrar cada red cuando sus datos y condiciones de uso estén validados y existan recorridos de prueba para los sentidos, variantes y transbordos incluidos. Mostrar el alcance de cobertura y la vigencia de los datos; no completar huecos con rutas o paradas inventadas.

## Siguiente etapa: pie, bicicleta y monopatín

Evaluar recomendaciones por modo con datos de banquetas, cruces, ciclovías, pendientes, accesibilidad y restricciones de cada vía. Las conexiones a pie actuales son estimaciones; todavía no son recomendaciones verificadas de seguridad o accesibilidad. Ver [decisiones de producto y criterios](iteracion-viajes-cotidianos.md).
