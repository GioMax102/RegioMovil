# Plan de hosting del piloto

Evaluación: **30 de octubre de 2026**, America/Monterrey. Base de código: `cfa5b6f`, rama `codex/administracion-ciberseguridad`. Documento de decisión y continuidad; **no se han creado recursos, abierto puertos ni desplegado servicios remotos**. Revisar ofertas y presupuesto en la consola antes de aprovisionar.

## Decisión recomendada

Para un piloto pequeño con el código actual: **una VM Oracle Cloud Always Free, Docker y disco persistente local**, con HTTPS delante del servidor. Es la opción gratuita mejor ajustada entre las evaluadas porque no exige migrar las dos bases SQLite ni separar la evidencia fotográfica. El ahorro implica administrar Linux, actualizaciones, respaldos y recuperación; no es hosting administrado ni una promesa de disponibilidad.

Según la [documentación oficial de Oracle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), A1 incluye actualmente el equivalente a **2 OCPU y 12 GB de RAM**, con **200 GB combinados de volúmenes de arranque/bloque** en la región principal. Propuesta inicial: una A1 de 2 OCPU/12 GB y arranque de 50 GB, únicamente si la consola confirma elegibilidad gratuita. No usar las antiguas cifras de 4 OCPU/24 GB. Puede faltar capacidad y Oracle puede recuperar instancias inactivas. No generar carga artificial para evitar esa política.

El alta normalmente requiere un medio de pago para verificación; consultar las condiciones de la [oferta](https://www.oracle.com/cloud/free/faq/). No confundir los créditos de prueba con recursos Always Free ni actualizar a pago por uso para sortear capacidad sin revisar costes. Una alerta de presupuesto notifica: no impone por sí sola un límite de gasto.

La región principal se elige al registrarse y [no puede cambiarse](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingregions.htm). Las cuentas gratuitas no tienen SLA. Revisar la cuota antes del [fin de la prueba](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm): usar recursos fuera de cuota puede causar deshabilitación y posterior eliminación. No se ha comprobado capacidad en una cuenta del titular.

Si no se consigue una A1 gratuita, detener esta vía y evaluar **Azure for Students** si el titular cumple requisitos; no sustituir automáticamente por una VM de pago. Tampoco se recomienda la micro de 1 GB para construir y ejecutar conjuntamente aplicación y monitoreo sin medir memoria.

## Comparación orientada al proyecto

| Opción | Oferta y limitación verificada | Encaje / decisión |
| --- | --- | --- |
| Oracle Always Free A1 | VM y almacenamiento con cuotas; disponibilidad e inactividad condicionan continuidad. | Preferida para este piloto, sujeto a cuota real y prueba ARM64. |
| Azure App Service F1 | [Microsoft](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/) indica 60 minutos de CPU/día, 1 GB de RAM y 1 GB de almacenamiento; sin SLA y no soportado para cargas de producción. | Útil para aprendizaje; no se elige para conservar el servicio comunitario. No afirmar que su almacenamiento garantiza SQLite WAL local. |
| Azure Container Apps | [Almacenamiento](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts): contenedor/réplica efímeros; persistencia mediante Azure Files. | No es sustitución directa: requiere rediseñar persistencia. La cuota gratuita de cómputo no vuelve gratuitos discos, registro, logs y red. |
| Azure for Students | [Oferta](https://azure.microsoft.com/en-us/free/students/): USD 100 por 12 meses, sin tarjeta, para estudiantes elegibles; renovación sujeta a condiciones. | Alternativa con crédito educativo para VM y disco; calcular coste total y vencimiento. No es servidor perpetuamente gratis. |
| Render Free | [Limitaciones](https://render.com/docs/free): suspensión tras 15 minutos sin tráfico; filesystem efímero y sin disco persistente gratuito. | Descartado para datos reales con el diseño actual. Una demostración descartable sí podría usarlo. |
| Google Compute Engine Free | [Oferta](https://docs.cloud.google.com/free/docs/free-cloud-features): e2-micro en regiones elegibles de EE. UU., 30 GB de disco estándar y 1 GB de salida mensual. | Menor margen para construir/monitorear; verificar además IP pública y red en el presupuesto. No se acredita coste total cero. |

SQLite [WAL no funciona sobre un filesystem de red](https://www.sqlite.org/wal.html). Por eso no se propone montar Azure Files/NFS/SMB como arreglo rápido. Una migración a PostgreSQL requeriría adaptar tanto reportes como identidad, pruebas y almacenamiento de fotos; es un lote distinto, no un cambio de variable.

## Arquitectura del primer despliegue

Un hostname público dirige a un proxy HTTPS en la VM. El proxy entrega tráfico al servidor Node por loopback. Node sirve web, `/api` y `/admin` desde el mismo origen; guarda reportes y autenticación en archivos distintos bajo un volumen persistente. Una sola instancia de la aplicación; sin réplicas compartiendo SQLite.

- **HTTPS:** Caddy instalado en el host, con certificados y renovación automática; [requisitos](https://caddyserver.com/docs/automatic-https): DNS correcto, puertos 80/443 accesibles y directorio de certificados persistente. La [plantilla](../ops/Caddyfile.example) ya valida; sustituir su hostname reservado por el real. Esto no acredita emisión de certificado ni acceso remoto. No usar un certificado local/autofirmado para el APK público.
- **Hostname sin comprar dominio:** subdominio disponible de [DuckDNS](https://www.duckdns.org/), proveedor gratuito de DNS dinámico. Mantener su actualización y token privados. Un dominio propio es opcional y su coste se presupuestaría aparte.
- **Aplicación/monitoreo:** reutilizar [Compose](../ops/compose.monitoring.yml), cuyos puertos ya están limitados a loopback. Grafana y Prometheus se consultan por túnel SSH; no publicarlos mediante Caddy.
- **Datos:** volumen `reports` para las dos bases; volúmenes propios de métricas y Grafana. El disco de la VM debe conservarse al reemplazar el contenedor. Elegir explícitamente qué ocurre con el volumen al eliminar una VM.
- **Respaldos:** snapshots SQLite mediante el script existente, cifrados y copiados fuera de la VM. Un respaldo en el mismo disco no protege de su pérdida ni de una cuenta comprometida.
- **Android:** reconstruir con `VITE_API_BASE_URL=https://HOSTNAME_REAL`; deja de depender de ADB y de la computadora personal. Nunca incluir secretos administrativos en el APK.

## Ejecución por etapas y aceptación

| Etapa | Acción concreta | Condición para avanzar |
| --- | --- | --- |
| H0 · decisión | Titular crea/verifica cuenta, región y cuota; confirma hostname, responsable operativo y presupuesto cero del conjunto. | Captura privada de recursos elegibles y estimación; sin depender de créditos temporales. No compartir tarjeta, contraseña ni claves SSH en el chat. |
| H1 · infraestructura | Crear VM Ubuntu 24.04 LTS ARM64 elegible, disco y red; acceso SSH con clave, reglas 22 sólo desde IP administrativa y 80/443 públicos. Revisar firewall del host y de OCI. | SSH probado antes de cerrar acceso; 3001/3000/9090/9091 inaccesibles desde internet. No vaciar reglas de firewall de la imagen ni desactivar controles para resolver conectividad. |
| H2 · empaquetado | Instalar Docker/Compose siguiendo [Docker Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Revisar imágenes/dependencias para ARM64, fijar revisión Git y construir. | Build, arranque, salud y dependencias nativas correctos en ARM64. La prueba x86 previa no acredita ARM64. Registrar versión y hash de imagen. |
| H3 · persistencia | Inicializar volúmenes, secretos y configuración del servidor. Usar el procedimiento de [operación](operacion-admin.md); no copiar el `.env` de desarrollo al servidor. | Bases distintas, privadas, persistentes y fuera de `dist`; reinicio y recreación del contenedor conservan datos sintéticos. |
| H4 · HTTPS | Registrar hostname, apuntarlo a IP de la VM, instalar/configurar Caddy y obtener certificado público. | Cadena TLS válida desde una red externa, redirección HTTP y configuración de renovación verificadas. |
| H5 · administración | Activar origen HTTPS exacto, crear cuenta nominal por CLI, configurar TOTP y guardar recuperación. | Acceso por rol; anónimo rechazado; CSRF/origen inválidos rechazados; foto privada no pública. Deshabilitar y restablecer acceso en ensayo. |
| H6 · observabilidad y recuperación | Confirmar scrape, dashboard por SSH, retención, alertas y copia cifrada externa. Ensayar restauración en otra ubicación. | Métricas sin datos personales; caída y recuperación observables; copia íntegra y acceso recuperado. Definir guardia/canal: las reglas existentes no envían notificaciones por sí solas. |
| H7 · Android y piloto | Compilar APK con HTTPS; instalarlo en un teléfono; enviar reporte sintético, revisar y publicar desde panel. | Funciona con Wi-Fi/datos, sin USB; respeta consentimiento; offline conserva navegación local. Aprobar piloto cerrado antes de admitir datos reales. |
| H8 · operación | Registrar inventario, costes, responsables, versión y recuperación; actualizar [matriz OWASP](matriz-owasp.md). | Responsable acepta pendientes, límites y calendario de revisión. No declarar certificación ni servicio permanente a partir de un arranque correcto. |

## Configuración de producción a preparar

Partir de [production.env.example](../ops/production.env.example), copiar a un archivo privado del servidor y reemplazar hostname y secreto, sin valores reales en Git:

```dotenv
ADMIN_ENABLED=true
ADMIN_ORIGIN=https://HOSTNAME_REAL
ADMIN_ALLOW_INSECURE_LOCALHOST=false
ADMIN_AUTH_SECRET=
CORS_ORIGINS=https://HOSTNAME_REAL,https://localhost,capacitor://localhost
```

Completar el secreto con `openssl rand -hex 32` en el servidor y conservarlo en un gestor privado. El valor vacío impide iniciar administración. El Compose proporciona las rutas `/data/regiomovil.sqlite` y `/data/admin-auth.sqlite`, y la imagen fija `NODE_ENV=production`. `ADMIN_ORIGIN` no lleva barra final ni `/admin`. El archivo anterior es una plantilla para sustituir los marcadores, no una configuración ejecutable.

**Mejora implementada:** Compose ya propaga `CORS_ORIGINS` al contenedor. La prueba con el perfil de producción verifica orígenes HTTPS/Android exactos, excepción HTTP desactivada, bases separadas y publicaciones sólo loopback. El perfil mantiene el secreto vacío y exige completarlo antes del arranque. Falta verificar CORS HTTP desde el hostname y el teléfono reales.

La [secuencia operativa](hosting-ejecucion.md) fija un único archivo privado y el proyecto `regiomovil-pilot`. No se omite `--env-file` en operaciones posteriores: cambiar proyecto/configuración accidentalmente puede crear volúmenes nuevos y aparentar pérdida de datos. Incluye el procedimiento `exec app node scripts/admin-user.mjs ...` para la cuenta nominal. No registrar contraseñas como argumentos.

No reutilizar `ADMIN_ALLOW_INSECURE_LOCALHOST=true`, orígenes HTTP locales ni el secreto de una prueba. El proxy termina TLS; la aplicación sigue escuchando sólo tras loopback. Los límites por socket actuales agruparán usuarios tras el proxy: probar login y reportes con varias personas. No habilitar confianza indiscriminada en `X-Forwarded-For`; si se necesita IP original, diseñar confianza limitada al proxy y pruebas anti-suplantación antes de cambiar el código.

## Comprobaciones y políticas iniciales

- **Capacidad:** medir CPU, RSS, event loop, tamaño de bases/WAL y fotos antes de anunciar número de usuarios. El grafo y SQLite síncronos no garantizan alta concurrencia. Logs Docker ya acotados mediante `json-file`, `max-size=10m`, `max-file=3` para los tres servicios; verificar su aplicación al recrear contenedores. Falta fijar y medir el espacio libre mínimo del destino.
- **Objetivos propuestos, pendientes de ensayo:** respaldo diario, RPO de hasta 24 horas y RTO de 4 horas. Conservar siete copias diarias cifradas fuera de la VM, sujeto a política de privacidad/capacidad aprobada. No usar snapshots como sustituto de la copia online verificada ni prometer esos objetivos sin medirlos.
- **Actualizaciones:** escoger un commit aprobado y guardar respaldo antes de construir/recrear; registrar versión anterior. Volver a una imagen no revierte una migración de datos: revisar compatibilidad y restaurar sólo con procedimiento explícito. Nunca usar `down -v` como actualización.
- **Exposición:** sin puertos de bases, métricas o consolas públicos; acceso mínimo al host/proveedor y MFA del proveedor. No montar el socket Docker dentro de la aplicación. Caddy tampoco debe abrir su API administrativa a internet.
- **Gastos:** revisar cómputo, arranque/bloques, IP, egress, snapshots, logs y destino de respaldos. No crear balanceador, NAT Gateway, discos o imágenes comerciales por defecto. Si no encajan en cuota, detenerse y presupuestar, sin prometer que las alertas evitan cobros.
- **Disponibilidad:** la gratuidad no garantiza capacidad ni continuidad. Si el piloto necesita atención institucional sostenida, presupuesto para infraestructura con garantías y responsable operativo, aunque se mantenga gratuito para pasajeros.

## Continuidad: qué queda para la siguiente interacción

1. Confirmar cuenta OCI y disponibilidad A1; si falla, elegibilidad Azure for Students y presupuesto educativo. Las credenciales se introducen directamente en la consola del proveedor.
2. Confirmar hostname y responsable de respaldos. No se necesita un dominio comprado para el ensayo.
3. Aplicar las plantillas HTTPS y producción, comprobar límites de logs y completar el procedimiento de actualización/restauración del destino, sin alterar el panel ciudadano.
4. Ejecutar H1–H8 con evidencia fechada y commit; registrar si ARM64, TLS, restauración o dispositivo no pudieron verificarse. No trasladar los 422 tests de la entrega anterior como resultado de pruebas nuevas.
5. Tras aprobar piloto, reconstruir y distribuir el APK apuntando al hostname definitivo. El panel será `https://HOSTNAME_REAL/admin` y los usuarios compartirán el mismo backend.

## Confirmación y evidencia del 30 de octubre

- Oferta OCI y alternativa Azure revisadas de nuevo en fuentes oficiales. Se confirma la recomendación como mejor ajuste entre las opciones evaluadas, sujeta a disponibilidad y condiciones. La elegibilidad de Azure Students requiere verificación académica; no deriva de que el proyecto sea social.
- Tres pruebas interpretan el Compose real: defaults, perfil de producción y sobrescritura CORS. Verifican rotación, aislamiento de puertos y almacenamiento configurado sin leer `.env`, imprimir secretos ni iniciar servicios.
- `Caddyfile.example` validado con Caddy **2.11.7**, imagen oficial fijada por digest, en contenedor efímero sin red ni puertos. La CI repite esa validación. No se solicitaron certificados públicos.
- `pnpm docs:check`: 62 archivos y 353 enlaces locales válidos; diff sin errores de espacios. Las tres pruebas Compose pasaron, ninguna omitida. Se omiten explícitamente si la herramienta no está instalada; la CI vuelve a comprobarlas en el runner.

No se ha contratado hosting, verificado ARM64 ni completado H0–H8. La configuración está preparada para ensayo; el servidor remoto y su coste real aún no están confirmados.
