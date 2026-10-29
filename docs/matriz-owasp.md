# Matriz de verificación de seguridad

Fecha: 29 de octubre de 2026. Referencia: **ASVS 5.0.0** y **WSTG 4.2**. Alcance de esta iteración: API Node, almacenamiento local, administración, copias y métricas del repositorio. No incluye un despliegue remoto, infraestructura de terceros ni una evaluación móvil completa. No existe un único «test OWASP» que certifique el producto; esta matriz selecciona controles aplicables y registra trabajo verificable. **No declara conformidad ASVS L1/L2 ni sustituye una auditoría independiente.**

Fuentes versionadas: [ASVS 5.0.0](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en), [WSTG 4.2](https://owasp.org/www-project-web-security-testing-guide/v42/). Los identificadores mantienen la versión para evitar que un cambio del estándar altere su significado.

## Amenazas y fronteras

Activos: evidencia privada, consentimiento y decisiones; credenciales/MFA/sesiones; disponibilidad y capacidad; ubicación local del cliente. Fronteras: navegador→API, visitante→administración, API→SQLite/proveedor, host→respaldos, aplicación→recolector. Prioridades: impedir lectura/publicación sin permiso, abuso de accesos, pérdida/exposición de evidencia y fuga de datos mediante logs/métricas. Quien obtiene control del host puede modificar SQLite y su bitácora: mitigar con acceso al host, copias separadas y revisión externa del despliegue.

## Controles seleccionados

«Implementado» significa que hay código y regresiones revisables para el alcance descrito. La ejecución, sus resultados y el commit se registran en la entrega/CI; ninguna fila acredita todo un capítulo. Un requisito parcial continúa abierto.

| Referencia ASVS 5.0.0 | Alcance y evidencia | Estado / pendiente |
| --- | --- | --- |
| 1.2.1, 1.2.3 | Texto comunitario como texto de React/JSON; cabeceras y casos maliciosos en [backend-security](../tests/backend-security.test.mjs) y [UI](../tests/admin-ui.test.tsx). | Implementado en estos flujos; revisar todos los contextos al añadir exportaciones. |
| 1.2.4 | SQL con parámetros; filtros/paginación administrativos acotados. [Store](../server/storage.mjs), [regresiones](../tests/admin-storage.test.mjs). | Implementado; los fragmentos dinámicos de SQL requieren mantener listas permitidas. |
| 1.3.2 | Reglas locales bloquean `eval`, constructor dinámico y otros sumideros. [SAST](../.semgrep/regiomovil.yml). | Cobertura estática limitada; no equivale a análisis de flujo completo. |
| 1.3.6 | Proveedores fijados por servidor, transporte y redirecciones restringidos; [pruebas de lugares](../tests/places.test.mjs). | Implementado en el proxy existente; revisar egress/DNS del entorno real. |
| 6.1.1, 6.3.1 | Cinco intentos de acceso/minuto por socket más límites del módulo de autenticación y segundo factor. [Auth](../server/admin-auth.mjs), [API](../server/admin.mjs). | Implementado en una instancia; gateway/proxies y abuso distribuido pendientes. |
| 6.2.1, 6.2.9 | Contraseñas de 15–128 caracteres, provisión privada y hash del proveedor de autenticación. | Implementado. |
| 6.2.4, 6.2.12 | Comprobación de contraseñas comunes/comprometidas. | Pendiente; no se consulta un servicio externo ni se declara cubierta por longitud/MFA. |
| 6.3.2 | Administración desactivada por defecto, sin usuario ni contraseña predeterminados, sin registro público. | Implementado; comprobar configuración efectiva al desplegar. |
| 6.3.3 | MFA TOTP obligatorio antes de indicadores/evidencia/decisiones; códigos de recuperación. [Regresiones](../tests/admin-backend.test.mjs). | Implementado; evaluación de enrolamiento/recuperación con operador independiente pendiente. |
| 7.1.1, 7.3.2 | Vida absoluta de una hora y revocación; [procedimiento](operacion-admin.md). | Implementado para vida absoluta; justificación formal frente al riesgo pendiente. |
| 7.1.2, 7.3.1 | Límite de sesiones paralelas y expiración por inactividad. | Pendiente; hoy no hay límite adicional de concurrencia ni temporizador de inactividad separado. |
| 7.2.1, 7.2.2 | Sesión verificada en servidor; cookies y sesiones dinámicas de Better Auth; no bearer en JSON. | Implementado; revisión independiente del proveedor/configuración pendiente. |
| 7.4.1, 7.4.2, 7.4.5 | Cierre/revocación y baja de cuenta invalidan sesiones; CLI del host. [API](../tests/admin-backend.test.mjs). | Implementado para cuentas individuales; revocación global operativa por documentar. |
| 7.4.4 | Salida visible en la vista administrativa. [UI](../tests/admin-ui.test.tsx). | Implementado. |
| 8.1.1, 8.1.2 | Matriz de roles: analista sólo agregados; moderador/admin con expedientes y revisión. [Operación](operacion-admin.md). | Implementado para permisos actuales; revisar ante nuevas funciones. |
| 8.2.1–8.2.3, 8.3.1 | Autorización en servidor por función/dato/campo, incluida foto privada. [Pruebas negativas](../tests/admin-backend.test.mjs). | Implementado en los endpoints administrativos. |
| V3, V7 | Cookies HttpOnly/SameSite/Secure bajo HTTPS, origen exacto, token CSRF en escrituras y sin caché administrativa. | Implementado en el código; TLS/cookies detrás del proxy deben comprobarse en destino. |
| V5, V14 | Fotos validadas, publicación con consentimiento, retención y respaldo consistente. [Fotos](../tests/backend-reports.test.mjs), [copias](../tests/backup-reports.test.mjs). | Implementado en aplicación; cifrado, caducidad de copias y recuperación real son responsabilidad operativa pendiente. |
| V13, V16 | CI de dependencias/secretos, reglas SAST, métricas privadas y etiquetas finitas. [Workflow](../.github/workflows/security.yml), [pruebas](../tests/observability.test.mjs). | Implementado; no cubre imágenes/host, DAST ni revisión íntegra de registros. |

Los identificadores de inyección proceden del [capítulo V1](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x10-V1-Encoding-and-Sanitization.md); autenticación de [V6](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x15-V6-Authentication.md); sesiones de [V7](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x16-V7-Session-Management.md); autorización de [V8](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x17-V8-Authorization.md). Las filas con capítulos, sin identificador individual, son orientación pendiente de desglosar, no requisitos aprobados.

## Verificación reproducible

```sh
pnpm install --frozen-lockfile
pnpm audit --audit-level high
node --test tests/admin-backend.test.mjs tests/admin-storage.test.mjs tests/backend-security.test.mjs tests/observability.test.mjs tests/backup-reports.test.mjs
docker run --rm --network none -v "$PWD:/repo:ro" ghcr.io/gitleaks/gitleaks:v8.30.1 git /repo --redact=100 --no-banner
docker run --rm --network none -e SEMGREP_SEND_METRICS=off -v "$PWD:/src:ro" -w /src semgrep/semgrep:1.182.0 semgrep scan --config .semgrep/regiomovil.yml --metrics=off --disable-version-check --no-git-ignore --error src server
docker run --rm --network none --entrypoint promtool -v "$PWD/ops/prometheus:/etc/prometheus:ro" -w /etc/prometheus prom/prometheus:v3.13.5 check rules alerts.yml
docker run --rm --network none --entrypoint promtool -v "$PWD/ops/prometheus:/etc/prometheus:ro" -w /etc/prometheus prom/prometheus:v3.13.5 test rules alerts.test.yml
```

Node puede necesitar permiso de escucha loopback en entornos aislados. Usar datos ficticios y bases temporales. Gitleaks analiza el historial con salida censurada; Semgrep ejecuta sólo tres reglas locales sin conexión ni telemetría. No hay una línea base que silencie hallazgos conocidos: revisar y corregir cualquier resultado antes de introducir una excepción específica justificada. `pnpm audit` consulta avisos para las versiones del lockfile; no analiza comportamiento ni detecta todas las vulnerabilidades. El umbral de CI bloquea severidad alta/crítica, y los avisos inferiores también requieren valoración.

Comprobaciones operativas de esta iteración: auditoría de dependencias sin avisos conocidos; Gitleaks sin hallazgos sobre 29 commits; reglas de alertas validadas y sus transiciones probadas con promtool. Son resultados fechados del entorno local, no un dictamen sobre versiones futuras ni sobre el servidor publicado. La entrega final registra las ejecuciones de integración del commit terminado.

## Revisión dinámica y cierre pendientes

Aplicar WSTG 4.2 a una instalación de pruebas autorizada: configuración (4.2), autenticación (4.4), autorización (4.5), sesión/CSRF (4.6), entradas (4.7), errores (4.8), criptografía/transporte (4.9), lógica (4.10) y cliente (4.11). Incluir intento de acceso sin MFA, IDOR en fotos, escalamiento de rol, sesión revocada, CSRF desde otro origen, publicación sin consentimiento, repetición/concurrencia de decisiones y lectura de copias/estáticos.

Antes de abrir administración en internet: asignar responsable, revisar HTTPS/HSTS y cabeceras en destino, ejecutar DAST y revisión manual independientes, resolver hallazgos altos/críticos, aprobar riesgos restantes y ensayar respaldo/restauración e incidente. Completar una matriz de aplicabilidad de **todos** los requisitos del nivel elegido y conservar evidencia por commit/entorno. La presente selección no permite decir «OWASP aprobado».
