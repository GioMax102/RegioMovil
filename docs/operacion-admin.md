# Administración y operación

Implementación: rama `codex/administracion-ciberseguridad`, 29 de octubre de 2026. Este procedimiento habilita una instalación propia; no cambia ni publica el servidor existente. Requiere Node 24 y las dependencias del lockfile. La vista administrativa se sirve en `/admin`, fuera de la navegación ciudadana y del precache sin conexión.

## Habilitar y crear la primera cuenta

La administración viene desactivada. Configurar estas variables **del servidor**, nunca `VITE_*`, en un archivo `.env` privado (`chmod 600 .env`):

```dotenv
ADMIN_ENABLED=true
ADMIN_ORIGIN=https://transporte.example.org
# Completar con el secreto generado antes de iniciar el servidor.
ADMIN_AUTH_SECRET=
ADMIN_DATABASE_PATH=/ruta/persistente/admin-auth.sqlite
DATABASE_PATH=/ruta/persistente/regiomovil.sqlite
```

Generar el secreto mediante `openssl rand -hex 32` y guardarlo en el gestor de secretos de operación. El valor vacío del ejemplo impide activar la administración hasta configurarlo. Mantener las dos bases en rutas distintas, fuera de `public/` y `dist/`. La base administrativa contiene identidades, verificadores de contraseña, sesiones y secretos del autenticador; restringirla y respaldarla como evidencia sensible. El servidor no crea una cuenta predeterminada ni acepta registro público.

```sh
pnpm install --frozen-lockfile
pnpm build
node --env-file-if-exists=.env scripts/admin-user.mjs create revision@example.org moderator "Persona revisora"
pnpm start
```

El comando solicita la contraseña en una terminal interactiva sin mostrarla ni pasarla como argumento. Usar 15–128 caracteres y un gestor de contraseñas. Cambiar el correo de ejemplo por una identidad del equipo. Después de entrar en `/admin`, configurar el autenticador TOTP, guardar los códigos de recuperación en un lugar privado y verificar un código. La API exige el segundo factor para indicadores, expedientes y moderación.

Para desarrollo en esta computadora, usar `ADMIN_ORIGIN=http://localhost:3001` y `ADMIN_ALLOW_INSECURE_LOCALHOST=true`; abrir exactamente ese origen después de `pnpm build && pnpm start`. La excepción HTTP sólo admite direcciones loopback. Para acceso remoto se requiere HTTPS en el ingreso; un parámetro del navegador no activa el panel ni cambia roles.

## Roles y decisiones

| Rol | Acceso |
| --- | --- |
| `analyst` | Indicadores agregados y destinos con más reportes. No puede leer descripciones, fotos ni expedientes individuales. |
| `moderator` | Lo anterior, bandeja paginada, detalle y foto privados, publicación, rechazo, retirada y resolución. |
| `admin` | Las mismas operaciones web de moderación. La provisión y el cambio de cuentas permanecen en la CLI del host. |

Los permisos se validan en cada solicitud del servidor. Las sesiones usan cookies HttpOnly y SameSite estricto, Secure bajo HTTPS; no se entrega un token bearer administrativo a JavaScript. Las escrituras exigen el origen exacto y el token CSRF de la sesión. La sesión tiene una vida absoluta de una hora; cerrar sesión o revocar acceso invalida su uso. No se implementa todavía un tiempo de inactividad separado ni un límite de sesiones concurrentes.

La bandeja muestra observaciones recibidas, incluyendo las que no tienen consentimiento público. Publicar exige consentimiento y confirmar revisión de texto y foto; revisar contenido no certifica físicamente el daño. Resolver sólo procede sobre una publicación; rechazar o retirar exige motivo. Cada decisión conserva identidad de la cuenta, fecha y nota. Una versión de revisión evita sobrescribir decisiones tomadas en otra pestaña. La bitácora pertenece al host y no es un registro inmutable frente a quien controla la base.

Los indicadores cuentan reportes, no personas únicas, casos verificados ni demanda normalizada. La cola muestra pendientes antiguos, y los tiempos de revisión describen el trabajo registrado. Comparar destinos exige considerar afluencia, cobertura y duplicados antes de decidir inversión. El panel no envía órdenes a autoridades ni garantiza atención.

## Alta, revocación y recuperación

```sh
node --env-file-if-exists=.env scripts/admin-user.mjs create analisis@example.org analyst "Equipo de análisis"
node --env-file-if-exists=.env scripts/admin-user.mjs role revision@example.org analyst
node --env-file-if-exists=.env scripts/admin-user.mjs revoke revision@example.org
node --env-file-if-exists=.env scripts/admin-user.mjs disable revision@example.org
node --env-file-if-exists=.env scripts/admin-user.mjs enable revision@example.org
node --env-file-if-exists=.env scripts/admin-user.mjs reset-password revision@example.org
node --env-file-if-exists=.env scripts/admin-user.mjs reset-mfa revision@example.org
```

Los cambios de acceso revocan las sesiones existentes. Ejecutar recuperación de contraseña/MFA sólo después de comprobar la identidad por el procedimiento privado del equipo; el proyecto no proporciona un servicio de recuperación por correo. Mantener una cuenta del host de emergencia y acceso restringido al gestor de secretos. No compartir cuentas administrativas ni pegar la salida de expedientes en incidencias públicas.

## Respaldo y ensayo de restauración

El respaldo usa la [Online Backup API de SQLite](https://www.sqlite.org/backup.html) mediante [`node:sqlite.backup`](https://nodejs.org/docs/latest-v24.x/api/sqlite.html). Incluye páginas confirmadas del WAL sin copiar una base abierta con `cp`. Comprueba integridad y claves foráneas, reconoce el esquema, publica una copia `0600` y rechaza sobrescrituras. El directorio destino debe existir con permisos `0700`; los nombres deben ser nuevos.

```sh
install -d -m 700 /ruta/privada/respaldos/ensayo-2026-10-29
node scripts/backup-reports.mjs /ruta/persistente/regiomovil.sqlite /ruta/privada/respaldos/ensayo-2026-10-29/reportes.sqlite
node scripts/backup-reports.mjs /ruta/persistente/admin-auth.sqlite /ruta/privada/respaldos/ensayo-2026-10-29/accesos.sqlite
node scripts/backup-reports.mjs --check /ruta/privada/respaldos/ensayo-2026-10-29/reportes.sqlite
node scripts/backup-reports.mjs --check /ruta/privada/respaldos/ensayo-2026-10-29/accesos.sqlite
```

La salida sólo contiene tipo de base, versión y conteos. Son instantáneas independientes: no prometen una transacción conjunta de ambas bases. Para un punto de recuperación coordinado, detener primero la aplicación; para copias en caliente, registrar sus horas y esta limitación. Cifrar las copias en destino y custodiar por separado la configuración necesaria para recuperar el autenticador, incluido `ADMIN_AUTH_SECRET`.

Ensayar en otro directorio privado: crear una copia nueva mediante el mismo comando, comprobarla, iniciar una instancia de prueba con esas rutas y revisar acceso, reportes privados/públicos y fotos con datos sintéticos. Revocar sesiones al restaurar una base administrativa. Para recuperación real, detener el servicio, preservar las bases anteriores y diarios, restaurar a rutas limpias y reiniciar con las rutas correctas. Nunca superponer una copia sobre SQLite abierto ni reutilizar un WAL de otra instantánea. Registrar duración y pérdida observada; RPO/RTO, periodicidad y caducidad de respaldos requieren aprobación operativa.

## Prometheus y Grafana locales

Stack opcional: [Compose](../ops/compose.monitoring.yml), [recolector](../ops/prometheus/prometheus.yml), [alertas](../ops/prometheus/alerts.yml) y [dashboard](../ops/grafana/dashboards/regiomovil.json). Versiones fijadas: Prometheus **3.13.5 LTS** y Grafana **13.3.0**, contrastadas con [Prometheus](https://prometheus.io/download/) y [Grafana](https://github.com/grafana/grafana/releases/tag/v13.3.0) el 29 de octubre de 2026. Revisar avisos y actualizar las versiones con pruebas; una versión fija no se actualiza sola.

```sh
node scripts/monitoring-secrets.mjs
docker compose -f ops/compose.monitoring.yml config --quiet
docker compose -f ops/compose.monitoring.yml up --build -d
docker compose -f ops/compose.monitoring.yml ps
docker compose -f ops/compose.monitoring.yml logs --tail 50 app prometheus grafana
```

Se construye una instancia local con su propio volumen `reports`; no sustituye la base de un `pnpm start` anterior. Aplicación: `http://localhost:3001`; Prometheus: `http://localhost:9090`; Grafana: `http://localhost:3000`. Grafana usa la cuenta `operador` y el secreto generado en `.data/monitoring-secrets/grafana_password`; consultarlo sólo en una terminal privada para ingresarlo al iniciar sesión. No hay credencial predeterminada en Git. El inicializador conserva archivos existentes. Los secretos se montan por archivo según la [configuración oficial de Grafana](https://grafana.com/docs/grafana/latest/setup-grafana/configure-docker/); son legibles dentro de los contenedores, protegidos en el host por el directorio `0700`.

Los tres puertos publicados se enlazan a `127.0.0.1`. El puerto de métricas `9091` no se publica y exige bearer; Prometheus lo consulta mediante la red `metrics`, marcada como interna. Las consolas comparten además la red puente `console`, necesaria para publicar sus interfaces en loopback con Docker Engine 29. Esta red permite tráfico saliente; no constituye aislamiento de egreso. La aplicación utiliza otra red puente, `web`. Fuera de Docker, activar `METRICS_TOKEN` o `METRICS_TOKEN_FILE`; el listener usa `127.0.0.1:9091` salvo `METRICS_HOST`/`METRICS_PORT` explícitos. Nunca poner el token en una URL ni en el cliente. Prometheus/Grafana no disponen de acceso público en esta configuración; no publicar sus puertos sin diseñar autenticación, TLS y segmentación adicionales. Ver el [modelo de seguridad de Prometheus](https://prometheus.io/docs/operating/security/).

El dashboard muestra tráfico, errores 5xx, latencia p95, CPU, memoria, retraso del bucle de eventos y cuotas de reportes/fotos. Las etiquetas de HTTP provienen de plantillas finitas; se excluyen búsquedas, URL completa, GPS, IP, UUID, texto y fotos. No reemplaza indicadores del host/disco ni una prueba de carga. La retención local de métricas se acota a siete días/512 MB. Los umbrales de alerta son iniciales y requieren calibración; las alertas aparecen en Prometheus, **sin envío a correo, Slack ni un servicio de guardia**. Alertmanager/canales requieren configuración posterior.

Para activar también administración en Compose, exportar explícitamente `ADMIN_ENABLED=true`, un `ADMIN_ORIGIN` HTTPS y `ADMIN_AUTH_SECRET` antes de levantar el stack, y configurar el ingreso TLS correspondiente. La imagen usa `NODE_ENV=production` y rechaza `ADMIN_ALLOW_INSECURE_LOCALHOST=true`. Crear la cuenta mediante la CLI dentro del contenedor con `docker compose -f ops/compose.monitoring.yml exec app node scripts/admin-user.mjs create revision@example.org moderator "Persona revisora"`. Para un ensayo HTTP exclusivamente local, usar un archivo de override que configure `NODE_ENV: development`, `ADMIN_ORIGIN: http://localhost:3001` y `ADMIN_ALLOW_INSECURE_LOCALHOST: 'true'` dentro de `services.app.environment`; esa excepción no debe incorporarse al despliegue de producción. El archivo del secreto no debe entrar en Git ni en la imagen.

```sh
docker compose -f ops/compose.monitoring.yml stop
docker compose -f ops/compose.monitoring.yml down
```

Estos comandos conservan volúmenes. No usar `down -v` para una instalación que contenga reportes que deban preservarse. No se despliega ni se instala un servicio del sistema por ejecutar las pruebas del repositorio.

## Evidencia y pendientes

Regresiones: [administración](../tests/admin-backend.test.mjs), [almacenamiento](../tests/admin-storage.test.mjs), [métricas](../tests/observability.test.mjs), [respaldos](../tests/backup-reports.test.mjs) y [alertas](../ops/prometheus/alerts.test.yml). CI incorpora [dependencias, secretos y reglas SAST locales](../.github/workflows/security.yml); revisar el resultado del commit evaluado.

La [matriz OWASP](matriz-owasp.md) conserva el alcance y las brechas. Siguen pendientes la prueba de penetración independiente, TLS/configuración del despliegue real, revisión completa de ASVS, alerta con guardia y un ensayo operativo con responsables nombrados. Un panel disponible y pruebas verdes no constituyen certificación ni disponibilidad garantizada.
