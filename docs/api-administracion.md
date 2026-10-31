# API de administración

Contrato del lote `codex/administracion-ciberseguridad`, **29 de octubre de 2026**, contrastado con [router](../server/admin.mjs), [autenticación](../server/admin-auth.mjs), [almacenamiento](../server/storage.mjs) y [cliente administrativo](../src/admin/AdminApp.tsx). Complementa la [API ciudadana](api.md); no describe un servidor remoto actualizado.

## Activación, origen y permisos

Sin `ADMIN_ENABLED=true`, `/api/admin` y `/api/admin/*` responden `404`. Configurar origen HTTPS exacto, secreto privado y base administrativa separada según [operación](operacion-admin.md). El panel `/admin` o `/admin.html` usa exclusivamente la API de su mismo origen. No hay registro público, gestión de cuentas por HTTP ni credenciales predeterminadas: provisión, cambio de rol, baja, contraseña y reinicio MFA pertenecen a la CLI del host.

Better Auth **1.7.14**, fijado en el lockfile, gestiona contraseñas y segundo factor TOTP. La sesión dura una hora absoluta, sin renovación automática, inactividad independiente ni límite de sesiones simultáneas. Las cookies son `HttpOnly`, `SameSite=Strict`, restringidas a `/api/admin`; bajo HTTPS son `Secure`. La excepción HTTP sólo admite loopback habilitado expresamente y se rechaza en `NODE_ENV=production`. No se devuelve el bearer de sesión en JSON ni se almacena en el navegador mediante `localStorage` o `sessionStorage`.

| Rol         | Indicadores agregados | Bandeja, detalle y foto privados | Moderar     | Cambiar cuentas por HTTP |
| ----------- | --------------------- | -------------------------------- | ----------- | ------------------------ |
| `analyst`   | Sí, con MFA           | No                               | No          | No                       |
| `moderator` | Sí, con MFA           | Sí, con MFA                      | Sí, con MFA | No                       |
| `admin`     | Sí, con MFA           | Sí, con MFA                      | Sí, con MFA | No                       |

Los permisos se comprueban en servidor. Una sesión de contraseña recién creada puede consultar su estado y configurar/verificar MFA, pero no acceder a indicadores, evidencia o decisiones hasta verificar el segundo factor de **esa sesión**. La revocación de cuenta/sesiones se vuelve a comprobar antes de las mutaciones; una carga iniciada antes de revocar no autoriza a confirmar una decisión después.

Toda escritura exige `Origin` igual a `ADMIN_ORIGIN`; se rechazan orígenes ajenos y `Sec-Fetch-Site: cross-site|same-site`. Si existe sesión, las escrituras requieren además `X-CSRF-Token` obtenido de `GET /api/admin/session`. El token está ligado a la sesión y debe renovarse después de rotar la cookie, por ejemplo durante MFA. El cliente comprueba la sesión antes de reingresar o cerrar sesión para usar el token actual. CORS de la API ciudadana no concede acceso administrativo.

## Convenciones y límites

JSON UTF-8, excepto fotos; errores `{"error":{"code":"…","message":"…"}}`. Todas las respuestas administrativas usan `Cache-Control: no-store`, CSP privada, `Referrer-Policy: no-referrer` y `Cross-Origin-Resource-Policy: same-origin`. La entrada administrativa y sus recursos propios quedan fuera del precache ciudadano. Fotos privadas se descargan autenticadas, sin caché, y sus URLs temporales se revocan al cerrar.

| Límite                                         | Valor                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Router administrativo por IP del socket        | 90 solicitudes / 60 s, además del límite general de API                        |
| Acceso contraseña por IP del socket            | 5 intentos / 60 s                                                              |
| Otras rutas de autenticación por IP del socket | 10 intentos / 60 s                                                             |
| Better Auth                                    | 50 solicitudes / 60 s en su almacenamiento; acceso 5 y segundo factor 8 / 60 s |
| Bloqueo del segundo factor                     | 5 fallos; bloqueo de 900 s según configuración del proveedor                   |
| Cuerpo JSON de autenticación/moderación        | 2048 bytes; rechaza campos adicionales                                         |
| Código de segundo factor                       | Cadena de hasta 30 caracteres; interfaz TOTP de 6 dígitos                      |

Los límites por socket no coordinan réplicas y pueden agrupar usuarios detrás de un proxy. Los headers de IP reenviada no se aceptan como identidad. Las demás consultas, salvo la bandeja, rechazan query strings. No se ofrecen métodos distintos de `GET` y `POST`; `HEAD` no sustituye a `GET` en este contrato.

## Autenticación

| Método y ruta                                        | Cuerpo / respuesta                                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/auth/sign-in/email`                 | `{email,password}`; correo ≤254, contraseña ≤128 caracteres. Devuelve `{twoFactorRedirect:true}` cuando debe completarse el desafío; en otro caso `{status:true}`. No acredita por sí solo acceso a datos. |
| `POST /api/admin/auth/sign-out`                      | `{}`; invalida la sesión actual y devuelve `{status:true}`. Requiere CSRF si hay sesión.                                                                                                                   |
| `POST /api/admin/auth/two-factor/enable`             | `{password,method?:"totp"}`; requiere sesión. Devuelve `{totpURI,backupCodes}` una sola vez para configuración y custodia privada. Si ya existe MFA, exige verificación previa para administrarlo.         |
| `POST /api/admin/auth/two-factor/verify-totp`        | `{code}`; confirma TOTP y registra el segundo factor para la sesión resultante. Devuelve `{status:true}`.                                                                                                  |
| `POST /api/admin/auth/two-factor/verify-backup-code` | `{code}`; usa un código de recuperación y registra MFA. Devuelve `{status:true}`.                                                                                                                          |
| `GET /api/admin/session`                             | `{user:{id,name,email,role,twoFactorEnabled},csrfToken,mfaRequired,expiresAt}`. Sin sesión válida: `401`.                                                                                                  |

Después de verificar MFA, volver a consultar `/session`. No guardar ni registrar contraseñas, URI TOTP, códigos o cookies en ejemplos, logs o tickets. Un `401 AUTH_FAILED` de contraseña/TOTP no debe confundirse con una sesión confirmada: permite reintentar el desafío con las restricciones del servidor. Los códigos de recuperación permanecen sólo en memoria de la vista de enrolamiento y se retiran al salir/completar; perder autenticador y códigos requiere recuperación privada por CLI con identidad comprobada.

## Indicadores

`GET /api/admin/dashboard`, para los tres roles con MFA:

```json
{
  "counters": { "total": 7, "pending": 3, "published": 2, "resolved": 1, "rejected": 1 },
  "queue": { "pendingOver7Days": 1, "oldestPendingAt": "2026-10-20T12:00:00.000Z" },
  "review": { "reviewedCount": 4, "medianHours": 2, "p95Hours": 10 },
  "byCategory": [{ "category": "infrastructure", "count": 7 }],
  "targets": [
    {
      "targetType": "station",
      "stationId": "padre-mier",
      "routeId": null,
      "stationName": "Padre Mier",
      "routeName": null,
      "count": 7,
      "pending": 3,
      "published": 2,
      "resolved": 1,
      "rejected": 1
    }
  ],
  "targetGroupsTotal": 1,
  "targetsTruncated": false,
  "capacity": {
    "reportCount": 7,
    "reportLimit": 5000,
    "photoBytes": 0,
    "photoBytesLimit": 50000000
  },
  "generatedAt": "2026-10-29T18:00:00.000Z"
}
```

Ejemplo ilustrativo. Los conteos abarcan reportes retenidos, con ventana de 90 días. `review` calcula tiempo a primera decisión registrada, con mediana y p95; `null` indica ausencia de datos. `capacity` refleja almacenamiento activo. Cada destino incluye `targetType`, `stationId`, `routeId`, nombres legibles `stationName`/`routeName` cuando se resuelven y `count`, `pending`, `published`, `resolved`, `rejected`. Los consumidores admiten nombres opcionales y conservan IDs como respaldo.

La distribución devuelve hasta **100 grupos con más reportes**; `targetGroupsTotal` indica todos los grupos y `targetsTruncated` si se omitieron filas. Los indicadores generales incluyen los destinos omitidos. Los grupos son por tipo/estación/ruta; no representan identificación de daños únicos ni personas distintas. No exporta títulos, descripciones, fotografías, referencias de unidad ni notas al perfil analista. No comparar prioridad de inversión sin duplicados, gravedad, cobertura y denominadores de exposición.

## Bandeja y evidencia privada

`GET /api/admin/reports`, sólo `moderator|admin` con MFA:

| Parámetro opcional     | Valores                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `status`               | `all\|pending\|published\|resolved\|rejected`; predeterminado `pending`, también en la interfaz. |
| `category`             | `crowding\|climate\|accessibility\|condition\|infrastructure`                                    |
| `targetType`           | `station\|route\|unit`                                                                           |
| `stationId`, `routeId` | Identificador existente en la red o catálogo correspondiente                                     |
| `limit`                | Entero 1–100, predeterminado 20                                                                  |
| `offset`               | Entero 0–5000, predeterminado 0                                                                  |

Rechaza filtros desconocidos, repetidos y valores inválidos con `400 INVALID_ADMIN_FILTER`. Respuesta `{reports,total,limit,offset}`, ordenada por creación descendente y con versión de moderación en cada reporte. No devuelve bytes de foto ni la clave privada del borrador. La UI usa páginas de 20 y vuelve a un rango válido si otra revisión vacía la página actual.

| Método y ruta                        | Respuesta                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/reports/:uuid`       | `{report}` con destino, nombres legibles disponibles, título, descripción, categoría, referencias, consentimiento, fecha, estado, `hasPhoto`, `version` e `history` de decisiones. |
| `GET /api/admin/reports/:uuid/photo` | Bytes JPEG/PNG/WebP de la foto sanitizada, también de reportes privados. Si falta: `404 PHOTO_NOT_FOUND`.                                                                          |

Los IDs deben tener formato UUID. Un expediente no disponible devuelve `404 REPORT_NOT_FOUND`; no se revelan datos al perfil analista. Las lecturas individuales y de fotos registran actor, fecha y destino en la bitácora privada. El historial de moderación contiene acción, identidad del revisor, nota y fecha; no se hace público por estos contratos.

## Decisiones y concurrencia

`POST /api/admin/reports/:uuid/moderate`, sólo `moderator|admin` con MFA, origen y CSRF válidos:

```json
{
  "action": "publish",
  "note": "Texto y fotografía revisados, sin datos personales visibles.",
  "reviewed": true,
  "expectedStatus": "pending",
  "expectedVersion": "pending:0"
}
```

`expectedVersion` debe ser **exactamente el valor recibido del servidor**, con forma `estado:entero`; `pending:0` sólo ilustra el formato. No derivarlo de fechas ni crear una versión local. Una comparación atómica de versión/estado evita sobrescribir otra decisión, incluida una transición que haya devuelto el reporte al mismo estado. Conflicto o transición incompatible: `409 REPORT_CONFLICT`; cargar expediente actual antes de decidir de nuevo.

| Acción      | Transición y condición                                                               |
| ----------- | ------------------------------------------------------------------------------------ |
| `publish`   | `pending → published`; requiere consentimiento guardado y `reviewed:true`.           |
| `reject`    | `pending\|published → rejected`; requiere motivo.                                    |
| `resolve`   | `published → resolved`; requiere motivo; no acredita reparación inspeccionada.       |
| `unpublish` | `published\|resolved\|rejected → pending`; requiere motivo y retira lectura pública. |

La API exige `reviewed` booleano y `note` cadena de hasta 500 caracteres, sin controles no permitidos. Las decisiones distintas de publicación necesitan nota no vacía; la UI pide al menos 10 caracteres para toda decisión y confirmación separada. Publicar desde la UI exige haber cargado/revisado la foto, cuando exista. Respuesta `{report}` con la versión e historial actualizados; una versión no vigente nunca se reemplaza silenciosamente.

Publicar sin consentimiento/revisión produce `409 PUBLICATION_NOT_ALLOWED`. Nota ausente para otra acción: `400 MODERATION_REASON_REQUIRED`; formato inválido: `400 INVALID_MODERATION`. Actor y fecha los obtiene el servidor de la cuenta autenticada, no del JSON del cliente. La CLI del host conserva su operación privilegiada y registra identidad declarada; sus eventos no equivalen a autenticación web.

## Errores y verificación

| HTTP            | Códigos habituales                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| 400             | `INVALID_ADMIN_INPUT`, `INVALID_ADMIN_FILTER`, `INVALID_MODERATION`, `MODERATION_REASON_REQUIRED`, validación JSON |
| 401             | `UNAUTHORIZED`, `AUTH_FAILED`                                                                                      |
| 403             | `ORIGIN_NOT_ALLOWED`, `ORIGIN_REQUIRED`, `CSRF_INVALID`, `MFA_REQUIRED`, `FORBIDDEN`                               |
| 404             | `NOT_FOUND`, `REPORT_NOT_FOUND`, `PHOTO_NOT_FOUND`                                                                 |
| 405             | `METHOD_NOT_ALLOWED`                                                                                               |
| 409             | `PUBLICATION_NOT_ALLOWED`, `REPORT_CONFLICT`                                                                       |
| 413 / 415 / 429 | Cuerpo excesivo, tipo JSON incompatible o cuota excedida                                                           |
| 503             | Fallo temporal del proveedor de autenticación, sin detalles internos                                               |

Una respuesta `401/403` en lectura privada obliga a retirar la evidencia de la vista. Si falla el cierre por red, el cliente retira datos locales y advierte que la revocación del servidor no está confirmada; recuperar conexión y volver a cerrar. El servidor protege incluso si una interfaz omite estos controles.

Regresiones revisables: [backend](../tests/admin-backend.test.mjs), [almacenamiento](../tests/admin-storage.test.mjs), [interfaz DOM](../tests/admin-ui.test.tsx), [matriz OWASP](matriz-owasp.md). Usar datos sintéticos y bases aisladas; las pruebas no sustituyen una revisión independiente, la verificación TLS en destino ni un procedimiento institucional de recuperación.
