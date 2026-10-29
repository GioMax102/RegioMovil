# Plan de desarrollo: administración y ciberseguridad

Fecha: **29 de octubre de 2026**. Rama: `codex/administracion-ciberseguridad`, sobre `9906643` de `codex/documentacion-profesional` (PR #5). Este lote implementa R1/R3 de la hoja de ruta y prepara observabilidad R2. Los cambios se revisan en su propia PR; no implican un despliegue público.

## Objetivo y alcance

Entregar una administración utilizable de observaciones comunitarias con identidad, permisos de servidor, sesión protegida y trazabilidad. Separar el panel del paquete inicial del pasajero, mantener las funciones sin conexión y conservar la privacidad de reportes pendientes y fotografías.

| ID | Entregable | Aceptación |
| --- | --- | --- |
| A1 | Autenticación y aprovisionamiento | Biblioteca mantenida, registro público deshabilitado, cuentas creadas por CLI, MFA y recuperación configurables/documentadas; secretos fuera del cliente. Sin configuración el acceso administrativo permanece cerrado. |
| A2 | Sesiones y autorización | Cookies HttpOnly/Secure, expiración y revocación, control de origen/CSRF y límites de intentos. Analista sólo agregados; moderación de evidencia reservada a roles autorizados. Probar llamadas HTTP directas. |
| A3 | Panel de revisión | Indicadores, filtros, paginación, detalle, fotos privadas y bitácora. Publicar exige consentimiento y revisión explícita; cambios concurrentes producen conflicto, sin sobrescribir decisiones. |
| A4 | Indicadores interpretables | Pendientes/antigüedad, primera revisión, categorías, destinos y capacidad. Son conteos de reportes retenidos, no fallas verificadas, personas únicas ni prioridades automáticas de inversión. |
| A5 | Persistencia y respaldo | Snapshot consistente de SQLite WAL, integridad y permisos privados, prueba de restauración en copia. Limpieza de vencidos sin depender de actividad pública; definir por separado retención de respaldos. |
| A6 | Observabilidad optativa | Listener de métricas separado y autenticado, etiquetas acotadas sin contenido personal; configuración local de Prometheus/Grafana con acceso restringido. No exponer métricas en la API pública. |
| A7 | Verificación de seguridad | Matriz de controles OWASP con evidencia y pendientes, pruebas negativas de acceso/CSRF/fotos/roles y revisión de dependencias. No declarar conformidad integral ni sustituir una evaluación independiente. |
| A8 | Entrega y continuidad | Build, pruebas, presupuesto de recursos, documentación de configuración/comandos y PR con resultados reales. Registrar brechas de operación o pruebas físicas por separado. |

## Secuencia

1. Acordar contrato de API/roles y mantener el plan en Git.
2. Implementar consultas privadas acotadas e indicadores; conservar la compatibilidad de moderación por CLI.
3. Integrar autenticación, permisos y auditoría antes de conectar el panel.
4. Construir entrada administrativa independiente y probar revisión/publicación/retirada, errores y conflictos.
5. Incorporar respaldo, limpieza, métricas y controles continuos de seguridad.
6. Ejecutar revisión cruzada, pruebas completas y controles de recursos; corregir hallazgos antes de subir la entrega.
7. Actualizar especificación/API/operación y registrar commit, validación y siguiente paso en la PR.

## Decisiones y límites

- Backend Node 24 y SQLite existentes; autenticación local con Better Auth y almacenamiento separado para identidad/sesiones. No requiere contratar un proveedor ni abrir registro de pasajeros.
- El panel se sirve desde el mismo origen que su API. Las credenciales no se guardan en Web Storage ni se incorporan al APK. El modo de desarrollo HTTP sólo es admisible en loopback; producción requiere HTTPS y configuración explícita.
- La revisión usa un identificador de versión derivado del estado y del último evento; evita que una decisión basada en una pantalla antigua sobrescriba la actual, incluso al volver al mismo estado.
- Este lote gestiona **reportes**. Consolidación de incidencias, asignación institucional, evidencia de reparación y evaluación de impacto necesitan un modelo y acuerdos posteriores. `resolved` sigue siendo un estado administrativo.
- Monitoreo local preparado no equivale a monitoreo instalado en un servidor público. Protección distribuida de ingreso, recuperación ensayada en el proveedor, evaluación independiente y responsables nominales siguen requiriendo trabajo operativo.
- Visión computacional y nuevas geometrías quedan en sus entregas específicas, sin inventar evidencia ni mezclar datos simulados con observaciones reales.

## Registro de cierre

Implementados A1–A8 en esta rama. La [entrega del 29 de octubre](entrega-administracion-seguridad-2026-10-29.md) registra resultados, límites y siguiente lote; la [guía de operación](operacion-admin.md) contiene los comandos de habilitación, cuentas, respaldo y monitoreo. La publicación y la activación en un servidor siguen siendo pasos separados de esta entrega de código. Mantener como referencias la [hoja de ruta](hoja-de-ruta.md), [seguridad y operación](seguridad-y-operacion.md) y la [guía de revisión](revision-tecnica.md).
