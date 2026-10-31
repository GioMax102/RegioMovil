# Secuencia de instalación del piloto

Complementa el [plan de hosting](plan-hosting-gratuito.md). **Se ejecuta en la VM elegida después de H0–H2**, no para sustituir el servidor local de desarrollo. Falta ensayar esta secuencia en el destino. Las plantillas y la interpretación de Compose sí se validan por separado.

## Preparación

1. Confirmar cuota gratuita, disco persistente, SSH y firewall del proveedor/host. Instalar Docker Engine/Compose y Caddy desde sus fuentes oficiales: [Docker Ubuntu](https://docs.docker.com/engine/install/ubuntu/) y [Caddy](https://caddyserver.com/docs/install). Conservar certificados de Caddy entre actualizaciones.
2. Copiar/clonar el proyecto en `/opt/regiomovil`, con permiso de escritura para el usuario operador, y seleccionar un commit aprobado. La rama de administración sigue siendo una entrega de revisión: no asumir que `main` la contiene. Registrar `git rev-parse HEAD` y verificar ARM64 antes de admitir datos reales.
3. Crear un hostname que apunte a la VM. Usar el mismo nombre HTTPS en Caddy, `ADMIN_ORIGIN` y `CORS_ORIGINS`.

## Configuración privada inicial

Crear el archivo sólo si no existe; los pasos siguientes no regeneran ni sustituyen credenciales existentes:

```sh
cd /opt/regiomovil
sudo install -d -m 700 /etc/regiomovil
sudo test -e /etc/regiomovil/production.env || sudo install -m 600 ops/production.env.example /etc/regiomovil/production.env
sudoedit /etc/regiomovil/production.env
```

Sustituir el hostname reservado `regiomovil.example.org` y completar `ADMIN_AUTH_SECRET` con un valor nuevo de `openssl rand -hex 32`, conservado en el gestor privado del equipo. No copiar el `.env` de desarrollo. El secreto vacío impide el arranque de administración. Guardar contraseña/códigos MFA fuera del repositorio.

El perfil no debe definir `VITE_API_BASE_URL`: la web alojada usa su propio origen. La URL pública del APK se fija al compilarlo por separado.

## Imagen, secretos de monitoreo y arranque

Todos los comandos Compose utilizan **el mismo proyecto y archivo privado**. Descargar explícitamente `node:24-alpine` permite ejecutar después el generador con `--pull=never`, sin instalar Node en el host ni imprimir secretos; usa el UID/GID del operador:

```sh
cd /opt/regiomovil
sudo docker compose --env-file /etc/regiomovil/production.env -p regiomovil-pilot -f ops/compose.monitoring.yml config --quiet
sudo docker compose --env-file /etc/regiomovil/production.env -p regiomovil-pilot -f ops/compose.monitoring.yml build app
sudo docker pull node:24-alpine
sudo docker run --rm --pull=never --network none --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24-alpine node scripts/monitoring-secrets.mjs
sudo docker compose --env-file /etc/regiomovil/production.env -p regiomovil-pilot -f ops/compose.monitoring.yml up -d
sudo docker compose --env-file /etc/regiomovil/production.env -p regiomovil-pilot -f ops/compose.monitoring.yml ps
curl --fail --silent --show-error http://127.0.0.1:3001/api/health
```

El generador conserva los secretos existentes en `.data/monitoring-secrets`, directorio `0700`. Asegurar que dicho directorio está en el mismo checkout usado por Compose. La imagen requiere red para construir/descargar dependencias; el generador usa una imagen local y no tiene red.

`config --quiet` comprueba sintaxis/interpolación, no que las credenciales sean válidas, exista cuota, haya espacio libre o el servicio funcione. No usar `config` sin `--quiet` en un registro compartido: puede mostrar variables privadas.

## HTTPS y cuenta administrativa

En `/etc/caddy/Caddyfile`, adaptar [Caddyfile.example](../ops/Caddyfile.example) al hostname real, conservando cualquier configuración anterior que todavía sea necesaria. El proxy usa `127.0.0.1:3001`; no apunta directamente al puerto de métricas ni a Grafana. Después:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
cd /opt/regiomovil
sudo docker compose --env-file /etc/regiomovil/production.env -p regiomovil-pilot -f ops/compose.monitoring.yml exec app node scripts/admin-user.mjs create tu-correo@example.com admin "Tu nombre"
```

Reemplazar correo/nombre antes de ejecutar la última línea. La CLI pide la contraseña de 15–128 caracteres en terminal interactiva. Si la cuenta ya existe no repetir `create`; usar recuperación documentada en [operación](operacion-admin.md).

Verificar el certificado y `/api/health` desde otra red. Abrir `https://TU_HOSTNAME/admin`, configurar TOTP, guardar recuperación y comprobar cada rol. El proxy mantiene cabeceras de cliente, pero el backend limita por socket: varios usuarios comparten presupuesto detrás del proxy. Medirlo en el piloto; no confiar ciegamente en cabeceras reenviadas.

## Monitoreo y comprobación en el teléfono

Desde la computadora personal, abrir túneles SSH; reemplazar usuario/IP:

```sh
ssh -N -L 13000:127.0.0.1:3000 -L 19090:127.0.0.1:9090 usuario@IP_DE_LA_VM
```

Consultar Grafana en `http://localhost:13000` y Prometheus en `http://localhost:19090`. La contraseña inicial de Grafana está en el archivo privado generado; el usuario es `operador`. No copiarla a incidencias públicas. Las alertas locales aún requieren un canal y responsable de notificación.

En el proyecto de la computadora donde compilas Android, sustituir el hostname:

```sh
VITE_API_BASE_URL=https://TU_HOSTNAME ./regiomovil android
adb install -r output/android/regiomovil-debug.apk
adb shell am start -n mx.regiomovil.app/.MainActivity
```

Usar la compilación normal HTTPS, sin `--dev-local-api`. El APK debug es para pruebas; la distribución formal exige firma de publicación y custodia de su clave. Comprobar envío de reporte sintético, evidencia privada, consentimiento y revisión desde el panel con el USB desconectado.

## Actualización y recuperación

Antes de cada actualización: registrar versión actual, obtener respaldo SQLite mediante el procedimiento de operación, cifrar/copiar fuera de la VM y comprobar integridad. Revisar migraciones y elegir el commit nuevo aprobado. Repetir `build app` y `up -d` con las mismas opciones Compose; verificar salud, acceso, datos y métricas después. No usar `down -v`, no borrar `.data/monitoring-secrets` y no cambiar el nombre del proyecto para actualizar.

Ensayar restauración en un directorio/instancia aislados antes del piloto real. Se mantienen pendientes la automatización de copias externas, sus políticas de retención y el RPO/RTO medido; instalar los contenedores no completa recuperación ni evaluación OWASP.
