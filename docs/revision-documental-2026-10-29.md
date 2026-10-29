# Revisión documental · 29 de octubre de 2026

Solicitud: preparar RegioMóvil para evaluación exhaustiva por un equipo técnico, con especificación, propuesta social, pitch y continuidad de seguridad/monitoreo/administración. Base funcional: `cc69761` en `main`. Rama de trabajo: `codex/documentacion-profesional`.

## Alcance

- README e índice separan referencias vigentes de entregas históricas; no se eliminan anotaciones ni fuentes.
- Especificación y contrato API contrastados con implementación, incluidos moderación, SQLite v3, fotos e idempotencia.
- Propuesta social y pitch distinguen aportación disponible de impacto todavía no medido.
- Hoja de ruta con responsables por rol, dependencias y aceptación: seguridad, respaldo, Prometheus/Grafana, administración, rendimiento y visión.
- Guías de contribución, revisión, comunicación de vulnerabilidades y licencias pendientes.
- Control de enlaces documentales integrado en CI, junto con verificación de inventario/importador. Permisos CI de sólo lectura y exclusión adicional de entornos/bases locales de Git/contexto Docker.
- Tres pruebas de favoritos esperan la disponibilidad del mapa antes de comprobar el origen. Conservan las aserciones y no introducen reintentos ni cambios de producto.

No cambia el comportamiento funcional de la app ni se despliega una versión. No se instaló monitoreo, administración web o visión; no se ejecutó una auditoría OWASP ni una nueva prueba Android/visual.

## Validación

Entorno local: Linux, Node **24.22.1**, pnpm **11.25.0**. Resultados obtenidos sobre esta base durante la revisión:

| Comprobación                                                                      | Resultado                                                                                                                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `./regiomovil build`                                                              | TypeScript, generación de catálogo/grafo y build web correctos.                                                                               |
| `node --import tsx --test --test-concurrency=4 tests/*.test.mjs tests/*.test.tsx` | **373/373** pruebas; cero fallos, cancelaciones u omisiones. Ejecutadas con loopback habilitado y bases temporales.                           |
| `python3 -m unittest discover -s tests -p '*_test.py'`                            | **4/4** pruebas correctas.                                                                                                                    |
| `node scripts/prepare-coverage-inventory.mjs --check`                             | Inventario coherente: 214 servicios, 194 mapas/grafo y 20 sin mapa (18 autobuses + 2 líneas de Metro excluidas).                              |
| `pnpm docs:check`                                                                 | **55 archivos, 247 enlaces locales válidos**. No verifica URLs externas ni anclas.                                                            |
| Comprobador documental, casos negativos temporales                                | Detecta enlaces inexistentes y fuera del repositorio con salida 1; ignora enlaces de ejemplo dentro de bloques de código. Fixtures retiradas. |
| `node --check scripts/check-docs.mjs` y `git diff --check`                        | Sin errores de sintaxis ni espacios conflictivos.                                                                                             |
| Revisión cruzada                                                                  | Contrato/configuración/algoritmos contrastados con código; corregidas precisiones de WAL y diagnóstico origen=destino.                        |

Logs de build/suite en `/tmp/regiomovil-documentation-build.log` y `/tmp/regiomovil-documentation-tests.log`: evidencia temporal local, no archivos portables del repositorio. CI queda configurado para repetir sus controles; los resultados de la tabla son locales.

### Ajuste a partir de CI

En la revisión documental `7642c0a`, CI detectó un fallo intermitente en la prueba que abre una parada guardada como origen. La consulta DOM tenía un límite implícito de un segundo, aunque el flujo descarga y decodifica el grafo público de casi 9 MB antes de renderizar el selector. La navegación sí había ocurrido; la prueba terminaba antes de que apareciera el control.

Se espera ahora la región accesible «Mapa del viaje», que sólo se renderiza con el grafo disponible, con el plazo de 10 segundos del lector de documentos públicos. Después se comprueban sin cambios el origen exacto, destino vacío y búsqueda deshabilitada. El criterio se aplica a los tres casos equivalentes, incluido offline; no se añaden pausas, reintentos ni un timeout global. El origen y la red se actualizan dentro del mismo callback, por lo que la condición de disponibilidad precede a esas aserciones.

Las tres pruebas específicas aprobaron y la repetición final de la suite obtuvo **373/373**, sin fallos, cancelaciones u omisiones. Log temporal: `/tmp/regiomovil-documentation-final-tests.log`. El resultado remoto de la candidata debe consultarse en la PR y no inferirse de una ejecución anterior.

Los registros anteriores mantienen sus fechas y alcance. No se ejecutaron auditoría de dependencias actual, SAST/DAST, prueba de penetración ni revisión de configuración en proveedores. No se renovó evidencia visual/física de Android.

## Siguiente entrega

Empezar por R1 de la [hoja de ruta](hoja-de-ruta.md): responsables, canal privado de seguridad, política de datos/licencia, respaldo y entorno de evaluación. Después ejecutar la matriz ASVS/WSTG y corregir hallazgos antes de ampliar exposición pública. Mantener la revisión física de formularios/mapa/guía y las 18 variantes pendientes identificadas por las entregas previas.
