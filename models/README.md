# Modelo de demostración

`artifact.json` es un artefacto reproducible de dos regresiones ridge entrenadas con **2400 muestras sintéticas**, sin registros de pasajeros ni GPS. La semilla, variables, pesos, estandarización, particiones, métricas de evaluación y radio de intervalos quedan registrados en el mismo archivo.

Regenerar con `npm run model:train`. El entrenamiento usa JavaScript puro y no requiere Python ni un servicio externo. La ficha completa está en `GET /api/model`; el procedimiento y la interpretación de métricas están en [docs/api.md](../docs/api.md).

El artefacto permite probar escenarios de interfaz y decisiones de viaje. Sus métricas no estiman precisión sobre la operación real del transporte de Nuevo León.
