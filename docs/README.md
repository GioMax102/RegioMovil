# Documentación de RegioMóvil

Organización: **29 de octubre de 2026**. Base de código: `cc69761`, integración de `feature/queja` en `main`. Las especificaciones describen esa implementación; las propuestas futuras se identifican expresamente. El código y las pruebas permiten resolver discrepancias.

## Lectura principal

1. [Pitch](pitch.md): qué propone el producto y qué apoyo necesita.
2. [Propuesta social](propuesta-social.md): públicos, resultados esperados y gobernanza.
3. [Especificación técnica](especificacion-tecnica.md): arquitectura, algoritmos, servidor y comandos.
4. [API](api.md): contrato HTTP implementado.
5. [Seguridad y operación](seguridad-y-operacion.md): controles, riesgos y preparación operativa.
6. [Revisión técnica](revision-tecnica.md): recorrido de evaluación y evidencia.
7. [Hoja de ruta](hoja-de-ruta.md): entregables y criterios de aceptación.

## Referencias especializadas

| Área         | Referencia y alcance                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reportes     | [Comunidad y moderación](quejas-comunitarias.md); [privacidad publicada](../public/privacidad.html).                                                                                      |
| Android      | [Compilación, instalación y pruebas](android.md). Una instalación histórica no acredita una revisión nueva.                                                                               |
| Entregas     | [Publicación](publicacion.md); [notas 1.1.0](releases/1.1.0.md). Confirmar despliegues y versión distribuida antes de actualizar.                                                         |
| Fuentes      | [Metro](datos-y-fuentes.md); [fuentes adicionales](nuevas-rutas-fuentes.md); [mapa base](../src/data/monterrey-map.md); [licencias](licencias-y-datos.md). Estados de servicio fechados.  |
| Cobertura    | [Inventario por servicio](../data/route-coverage-inventory.json), [CSV del último lote](inventario-rutas-2026-10-28.csv) y [auditoría de pendientes](auditoria-pendientes-2026-10-28.md). |
| Lugares      | [Búsqueda y privacidad](lugares-y-privacidad.md); [diseño del buscador](busqueda-lugares.md).                                                                                             |
| Modelos      | [Entrenamiento y artefactos](../models/README.md). El motor vigente se describe en la especificación técnica.                                                                             |
| Colaboración | [Contribuir](../CONTRIBUTING.md); [vulnerabilidades](../SECURITY.md).                                                                                                                     |

## Historial y continuidad

Se conservan registros para no perder anotaciones, decisiones ni límites de verificación. **No son la especificación vigente.** Sus conteos, ramas, despliegues y pruebas corresponden a la fecha escrita.

- Última entrega funcional: [28 de octubre](ENTREGA_PRODUCTO_2026-10-28.md) y [mejoras e instalación posterior](MEJORAS_USABILIDAD_2026-10-28.md).
- Anotaciones y trazabilidad: [plan de las nueve anotaciones](PLAN_PRODUCTO_COMUNIDAD_2026-10-27.md).
- Evaluación previa de cámaras y comunidad: [modelo social y visión](MODELO_COMUNIDAD_Y_VISION_2026-10-27.md); no constituye implementación.
- UI y cobertura previas: [plan del 25 de octubre](PLAN_CONTINUIDAD_UI_Y_COBERTURA_2026-10-25.md), [memoria UI/mapas](MEMORIA_CONTINUIDAD_UI_MAPAS.md) y [memoria quejas/cobertura](MEMORIA_QUEJAS_COBERTURA_2026-10-27.md).
- Revisiones anteriores: [seguridad del 18 de octubre](seguridad-calidad.md), [verificación inicial](verificacion.md), [catálogo del 25 de octubre](catalogo-autobuses.md), [modelo inicial](modelo-movilidad.md), [integración inicial](integracion-rutas.md) y [producto/accesibilidad inicial](producto-y-accesibilidad.md).

Los demás documentos fechados y CSV de `docs/` son evidencia de sus lotes. Se mantienen sus rutas para conservar enlaces. Para continuar, partir de la hoja de ruta vigente y enlazar la anotación histórica correspondiente.

## Mantenimiento

Actualizar la referencia canónica cuando cambie un contrato o comportamiento. Registrar cada entrega por separado, con commit, fecha, comandos, resultados y límites. Explicar decisiones que sustituyan las anteriores. Derivar cifras del inventario y ejecutar `pnpm docs:check` antes de proponer cambios.
