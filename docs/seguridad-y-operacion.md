# Seguridad y operación

Estado revisado: **29 de octubre de 2026**. Alcance: código del repositorio; no se verificó la configuración de un servidor público ni se realizó una prueba de penetración en esta entrega. Este documento sustituye como referencia vigente a las revisiones de seguridad fechadas; éstas conservan valor histórico.

## 1. Posición actual

RegioMóvil es un piloto con API pública anónima, SQLite y moderación mediante una herramienta local. No hay autenticación administrativa web, Prometheus, Grafana, `/metrics` ni una evaluación de conformidad OWASP completada. Las pruebas automatizadas comprueban controles concretos; sus resultados no acreditan por sí solos la seguridad del despliegue.

La exposición pública requiere un responsable de operación, HTTPS, volumen persistente, respaldo recuperable y capacidad de revisar/retirar contenido. CORS restringe navegadores; **no identifica personas ni impide solicitudes de clientes ajenos a un navegador**.

## 2. Activos, límites de confianza y amenazas

| Activo o frontera                         | Riesgo principal                                           | Defensa actual / trabajo pendiente                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Dispositivo → API anónima                 | Abuso de solicitudes, spam, contenido falso                | Validación y cuotas por socket; falta protección compartida en el ingreso y estrategia de abuso para varias réplicas.                     |
| Foto/texto → almacenamiento → publicación | Datos personales, contenido dañino, archivos manipulados   | Privado por defecto, consentimiento, revisión humana y validación de imagen. No hay detección ni difuminado automático de rostros/placas. |
| API → proveedores de lugares              | Agotamiento de cuota, fuga de consultas, SSRF              | URL configurada en servidor, restricciones de transporte y respuesta. Revisar proveedor y contrato de tratamiento antes de escalar.       |
| Host → SQLite y CLI                       | Lectura de evidencia privada, alteración de moderación     | Permisos locales y transacciones. Quien controla el host/base puede cambiar registros; la bitácora no es inmutable.                       |
| Cliente → mapa, GPS y guardados           | Exposición de localización o pérdida de borradores         | GPS de primer plano y guardados explícitos; el almacenamiento local no es una caja fuerte frente a un dispositivo comprometido.           |
| Dependencias, CI y artefactos             | Introducción de código vulnerable o publicación incorrecta | Lockfile, build/pruebas en CI y hashes de entrega; faltan controles continuos de cadena de suministro y revisión del despliegue.          |

No se reciben datos de localización de unidades operadoras. Las estimaciones sintéticas y los reportes comunitarios son fuentes distintas y deben seguir siéndolo.

## 3. Controles implementados y evidencia

| Control real                                                                                                   | Evidencia revisable                                                                                                          | Límite                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSP, `nosniff`, bloqueo de enmarcado, política de referencias y permisos                                       | [Servidor](../server/app.mjs), [cabeceras estáticas](../public/_headers), [regresiones](../tests/backend-security.test.mjs)  | Estilos inline permitidos; HSTS/TLS no se configuran en Node. Revisar proxy y orígenes efectivos.                                                                                        |
| Orígenes explícitos; rechazo de comodín; errores sin cuerpo de solicitud ni stack público                      | [Servidor](../server/app.mjs)                                                                                                | No equivale a autenticación ni protección contra abuso distribuido.                                                                                                                      |
| Cuotas por minuto: API 180, planificación compartida 20, reportes nuevos 12 e intentos 120 por IP del socket   | [Servidor](../server/app.mjs), [pruebas](../tests/backend-security.test.mjs)                                                 | Memoria de un proceso; reiniciar pierde contadores. Se ignora `X-Forwarded-For`; un proxy puede concentrar usuarios en una sola cuota.                                                   |
| JSON acotado: 4.096 bytes normalmente, 600.000 para reportes; campos, tipos, destinos y longitudes validados   | [Servidor](../server/app.mjs), [contratos de reportes](../tests/backend-reports.test.mjs)                                    | El límite de cuerpo no sustituye una prueba de carga ni una defensa en el ingreso.                                                                                                       |
| Consultas SQL parametrizadas, migraciones transaccionales, claves foráneas y SQLite WAL; esquema 3             | [Almacenamiento](../server/storage.mjs), [migraciones y cuotas](../tests/backend-reports.test.mjs)                           | `DatabaseSync` y el cálculo del servidor comparten el proceso; medir bloqueo del bucle de eventos.                                                                                       |
| Base/diarios `0600`, directorio nuevo `0700`, `secure_delete`                                                  | [Almacenamiento](../server/storage.mjs), [prueba Unix](../tests/backend-security.test.mjs)                                   | No hay cifrado de base implementado; no garantiza borrar copias, exportaciones o respaldos.                                                                                              |
| JPEG/PNG/WebP de hasta 400.000 bytes y 4 MP en API; validación estructural y eliminación de metadatos          | [Procesamiento](../server/report-photos.mjs), [pruebas](../tests/backend-reports.test.mjs)                                   | La eliminación de EXIF no elimina identificadores visibles en la foto. El cliente acepta un original de hasta 8 MB/24 MP y lo reduce; el servidor valida de nuevo.                       |
| Publicación sólo con consentimiento y transición de revisión; retirada de texto/foto en las consultas públicas | [Almacenamiento](../server/storage.mjs), [CLI](../scripts/moderate-report.mjs), [pruebas](../tests/backend-reports.test.mjs) | `--reviewer` es una declaración del operador local, no una identidad autenticada. Revisar contenido no demuestra el daño físicamente.                                                    |
| Idempotencia con UUID de borrador y hash de contenido; conflicto ante reutilización diferente                  | [Almacenamiento](../server/storage.mjs), [pruebas](../tests/backend-reports.test.mjs)                                        | Dura lo que el reporte retenido; no deduplica observaciones de distintas personas sobre una misma falla.                                                                                 |
| Rutas de estáticos restringidas, comprobación de symlinks y caché de compresión acotada                        | [Servidor](../server/app.mjs), [pruebas](../tests/backend.test.mjs)                                                          | Revisar también el servidor/CDN realmente utilizado.                                                                                                                                     |
| Proveedor HTTPS sin credenciales en URL, redirecciones deshabilitadas y límites de respuesta/tiempo/caché      | [Lugares](../server/places.mjs), [sugerencias](../server/place-suggestions.mjs), [pruebas](../tests/places.test.mjs)         | Las consultas textuales pueden contener direcciones; nunca deben incorporarse sin depuración a logs o métricas.                                                                          |
| GPS nativo de primer plano, sin backup automático Android ni HTTP en release; assets locales                   | [Contratos Android](../tests/android-security.test.mjs), [ubicación](../src/mobility/location.ts)                            | Una prueba sobre fuentes Java no sustituye pruebas físicas de permisos, pausa y recreación. El build de prueba con API local tiene una configuración distinta.                           |
| Service worker excluye API; borrador local con caducidad de 24 h y recuperación                                | [Service worker](../public/sw.js), [borrador](../src/reportDraft.ts), [pruebas](../tests/report-draft.test.tsx)              | El dispositivo conserva datos hasta limpieza por la aplicación o borrado del almacenamiento; no hay envío automático de borradores.                                                      |
| Contenedor en dos etapas y usuario `node` sin privilegios                                                      | [Dockerfile](../Dockerfile)                                                                                                  | La imagen base no se fija por digest. Revisar exclusiones de `.env*`, llaves y evidencia privada en [.dockerignore](../.dockerignore) antes de construir fuera de un entorno controlado. |

## 4. Evaluación OWASP pendiente

Usar **ASVS 5.0.0** como catálogo de requisitos y **WSTG 4.2** como guía de pruebas, versiones estables comprobadas el 29 de octubre de 2026. El [estándar](https://asvs.owasp.org/) y la [guía versionada](https://wstg.owasp.org/v4.2/4-Web_Application_Security_Testing/) cumplen propósitos distintos; un escáner no proporciona una aprobación integral.

La siguiente matriz es un mapa inicial de los [capítulos versionados de ASVS](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en), **no una evaluación ni un listado completo de requisitos**. Seguridad debe fijar nivel y alcance, registrar cada requisito aplicable con identificador/versionado, evidencia, resultado, responsable y excepción justificada. Propuesta: evaluar nivel 2 para el futuro servicio que custodie evidencia privada y administración; aún no es un compromiso aprobado.

| Área ASVS 5.0.0                                             | Pruebas WSTG 4.2 a desarrollar                            | Entregable pendiente                                                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 codificación, V2 validación, V4 API, V5 archivos         | 4.7 entradas; 4.10 lógica y cargas                        | XSS almacenado/DOM, inyección, JSON y fotos malformados, duplicación, cuotas y transiciones; adjuntar pruebas negativas.                                                        |
| V3 frontend, V12 comunicación, V13 configuración            | 4.2 configuración; 4.9 criptografía; 4.11 cliente         | HTTPS/cabeceras del despliegue, rutas estáticas, CORS y cachés reales; secretos e imagen de contenedor.                                                                         |
| V6 autenticación, V7 sesiones, V8 autorización              | 4.3–4.6 identidad, autenticación, autorización y sesiones | Diseñar y probar roles del administrador, aislamiento de evidencia, expiración/revocación y CSRF cuando corresponda. No marcar «no aplica» para un panel todavía sin construir. |
| V14 protección de datos, V15 arquitectura, V16 logs/errores | 4.8 errores; 4.10 lógica; 4.11 cliente                    | Borrado/retención, respaldos, fuga de evidencia, abuso, trazabilidad y recuperación.                                                                                            |

Secuencia: modelo de amenazas → matriz de aplicabilidad → revisión de código/configuración y dependencias → pruebas dinámicas sobre un entorno autorizado con datos sintéticos → correcciones → repetición → informe con riesgo residual. Registrar commit, fecha, herramientas/versiones y destino probado. Android necesita además su propia evaluación móvil y de dispositivo.

No hay SAST, DAST, análisis de secretos ni auditoría de dependencias continuos acreditados por el workflow actual de [calidad](../.github/workflows/checks.yml). Una auditoría antigua con cero avisos no prueba el estado de hoy.

## 5. Operación mínima y recuperación

**Despliegue:** servir con TLS en el ingreso, restringir la API interna, configurar `CORS_ORIGINS`, montar `DATABASE_PATH` en almacenamiento persistente y verificar que el usuario del proceso pueda escribir. No alojar SQLite en almacenamiento efímero para un piloto que prometa conservar evidencia. La topología actual recomendada es una instancia con disco local persistente; varias réplicas requieren revisar persistencia, cuotas y migraciones.

**Salud:** `GET /api/health` confirma que el proceso responde; no prueba capacidad de escritura, espacio libre ni disponibilidad de proveedores. Puede devolver 429 por cuota. Diseñar disponibilidad/readiness por separado y probar el recorrido crítico con datos sintéticos sin publicar observaciones reales.

**Moderación:** usar una cuenta del host autorizada y Node 24. La salida puede contener datos privados; no pegarla en incidencias públicas.

```sh
node scripts/moderate-report.mjs /ruta/privada/regiomovil.sqlite list --status pending --limit 50
node scripts/moderate-report.mjs /ruta/privada/regiomovil.sqlite show ID_DEL_REPORTE
node scripts/moderate-report.mjs /ruta/privada/regiomovil.sqlite summary --status all
```

Publicar requiere inspeccionar texto y foto, consentimiento y `publish ID --reviewer NOMBRE --reviewed`. `unpublish ID --reviewer NOMBRE` retira la publicación; no borra la evidencia privada. Procedimiento detallado: [reportes comunitarios](quejas-comunitarias.md).

**Respaldo:** SQLite usa WAL. No copiar solamente el archivo `.sqlite` mientras está activo. Crear una instantánea mediante la [Online Backup API](https://www.sqlite.org/backup.html) o `.backup` de la [CLI oficial](https://www.sqlite.org/cli.html); guardar fuera del directorio web/Git con acceso restringido y cifrado en el destino. Ejemplo manual si `sqlite3` está instalado, usando una ruta de destino nueva y privada:

```sh
umask 077
sqlite3 /ruta/privada/regiomovil.sqlite ".backup '/ruta/privada/respaldos/copia-nueva.sqlite'"
sqlite3 -readonly /ruta/privada/respaldos/copia-nueva.sqlite 'PRAGMA integrity_check;'
```

La comprobación debe devolver `ok`; comprobar también conteos y esquema sobre la copia. El respaldo contiene texto, fotos, claves de borrador y bitácora privados. La CLI de SQLite no viene instalada por este proyecto y este procedimiento no constituye evidencia de un respaldo de producción ejecutado.

**Restauración:** ensayar primero en un destino separado, con la versión de código compatible; validar integridad, migración, estado privado/público, fotos y CLI sin enviar mensajes ni exponer la copia. Para recuperación real, detener el proceso, preservar la base anterior y sus diarios, restaurar a un directorio limpio, ajustar permisos y reiniciar con el `DATABASE_PATH` correcto. No superponer una copia sobre una base abierta ni reutilizar diarios WAL de otra instantánea. Registrar duración y datos recuperados. Frecuencia, retención, RPO y RTO deben aprobarse; hoy no hay objetivos ni automatización acreditados.

**Retención:** 90 días, 5.000 registros y 50.000.000 bytes de fotos en la base activa. La purga por edad ocurre al acceder al almacén, no mediante un trabajo programado; un proceso sin actividad puede conservar registros vencidos. Los respaldos/exportaciones no se purgan con esa operación. Definir limpieza programada y caducidad de copias antes de prometer borrado en plazo fijo.

**Incidentes:** usar [SECURITY.md](../SECURITY.md) para divulgación. En operación, restringir el componente afectado, retirar contenido expuesto cuando proceda, preservar evidencia de acceso en un entorno privado y registrar alcance/medidas. Cambiar secretos comprometidos y comprobar corrección antes de reabrir. Faltan responsables nominales, canal operativo y ejercicio de respuesta; no existe un servicio de atención garantizado.

## 6. Observabilidad propuesta

No se instala infraestructura en esta entrega. Separar tres vistas: salud técnica en Prometheus/Grafana; gestión privada en administración; agregados comunitarios revisados en producto.

Propuesta: aplicación instrumentada → endpoint privado de métricas → Prometheus → Grafana y alertas. Limitar acceso a recolector, consultas y administración; usar TLS/autenticación donde corresponda, sin habilitar APIs administrativas innecesarias. El [modelo de seguridad de Prometheus](https://prometheus.io/docs/operating/security/) obliga a considerar accesible la información métrica a quien alcance su interfaz.

| Medición a implementar                                                                   | Uso y aceptación                                                                                                  |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Solicitudes/duración por plantilla de endpoint, método y clase de estado                 | Identificar errores y latencia; excluir texto de búsquedas, URL completa y cuerpos.                               |
| RSS, heap, CPU, retraso del bucle de eventos, reinicios y disco/WAL                      | Detectar saturación y crecimiento; ensayo de carga y reapertura repetida sin crecimiento sostenido inexplicado.   |
| Duración/fallos de planificación y llamadas a proveedores; tamaño de cachés              | Separar cálculo local/servidor y errores externos; evitar consultas o coordenadas como etiquetas.                 |
| Capacidad de reportes/fotos y edad de pendientes; respaldo exitoso/restauración ensayada | Alertar antes de cuota, pérdida de persistencia o atraso operativo. No exportar contenido privado ni identidades. |

Usar dimensiones finitas y presupuestadas. UUID, GPS, direcciones, referencias de unidad y texto libre no son etiquetas métricas. La [guía de instrumentación](https://prometheus.io/docs/practices/instrumentation/) explica el coste de cada serie. En Grafana, restringir fuentes de datos y acceso por roles; desactivar acceso anónimo para operación e integrar identidad con MFA cuando esté disponible. Ver [autenticación](https://grafana.com/docs/grafana/latest/setup-grafana/configure-access/configure-authentication/) y [endurecimiento](https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/configure-security-hardening/).

Antes de activar: fijar retención/coste, objetivo de disponibilidad y latencia medido, responsables de alertas y prueba de caída/recuperación. No convertir umbrales propuestos en un SLA. Versionar configuración, paneles y reglas revisadas; no versionar credenciales.

## 7. Riesgos que bloquean ampliar el piloto

| Riesgo pendiente                                                                         | Responsable por rol       | Evidencia de cierre                                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| Persistencia, respaldo y borrado no operacionalizados                                    | Operación + privacidad    | Restauración ensayada, RPO/RTO aprobados, limpieza y copias con retención probadas.              |
| Ausencia de identidad/autorización administrativa y trazabilidad resistente a alteración | Backend + seguridad       | Acciones denegadas por rol, sesiones revocables y bitácora con acceso separado.                  |
| Cuotas locales y cálculo síncrono expuestos a saturación                                 | Backend + operación       | Pruebas de carga/abuso con topología real, ingreso limitado y memoria estable.                   |
| Contenido identificable y moderación sin equipo/tiempo comprometido                      | Comunidad + privacidad    | Protocolo de revisión/retirada, responsables y pruebas con imágenes sintéticas.                  |
| Revisión OWASP/despliegue, dependencias y cadena de suministro pendientes                | Seguridad + mantenimiento | Matriz ASVS/WSTG, hallazgos priorizados y repetición documentada; controles continuos revisados. |

Continuar mediante la [hoja de ruta](hoja-de-ruta.md). Estas prioridades son recomendaciones técnicas y aún requieren asignación de personas y capacidad.
