# Entrega: administración y seguridad

Fecha: **29 de octubre de 2026**. Rama: `codex/administracion-ciberseguridad`, creada desde `9906643` de `codex/documentacion-profesional`. La revisión depende del PR #5 de documentación; no implica su integración ni un despliegue. Git y la PR identifican el commit revisado.

## Resultado

Se entrega un panel privado en `/admin`, separado del paquete ciudadano. Incluye ingreso, inscripción TOTP y recuperación, roles de análisis/moderación, indicadores, filtros paginados, expedientes y fotografías privadas, historial y decisiones con control de concurrencia. Viene deshabilitado y sin cuentas predeterminadas. La [guía de operación](operacion-admin.md) permite habilitarlo y crear la primera cuenta; el [contrato de API](api-administracion.md) documenta las operaciones.

Las sesiones usan cookies protegidas, caducidad absoluta, verificación de origen y CSRF. Las pruebas incluyen revocación mientras una solicitud espera su cuerpo y un ingreso con contraseña anterior que termina durante el restablecimiento. El servidor vuelve a comprobar permisos antes de moderar y descarta sesiones creadas durante cambios de acceso. Se conserva una bitácora acotada, sin contenido de fotos, contraseñas o secretos.

Se incorporan respaldo consistente de SQLite, limpieza periódica de registros vencidos, métricas privadas, stack local Prometheus/Grafana y controles continuos de dependencias, secretos, reglas estáticas y configuración de alertas. Los indicadores describen reportes retenidos: no acreditan daños, personas únicas o prioridades de inversión.

## Evidencia de validación

Ejecutada sobre el contenido de esta rama antes de su publicación; no equivale a certificar producción.

| Comprobación | Resultado |
| --- | --- |
| `pnpm build` | Correcto: TypeScript, preparación de datos, empaquetado y verificación de recursos. Precache inicial: **613 967 bytes**, dentro del límite de 600 KiB. |
| `node --import tsx --test --test-concurrency=4 tests/*.test.mjs tests/*.test.tsx` | **422/422** pruebas; incluye 19 casos de interfaz administrativa, autenticación/MFA, roles, CSRF, privacidad, concurrencia, revocación, respaldo, métricas y funcionamiento sin conexión. |
| Importador Python | **4/4** pruebas. El inventario conserva 214 servicios, 194 con geometría y 20 sin ella; este lote no añade trazos. |
| `pnpm audit --audit-level high` | Sin vulnerabilidades conocidas informadas por el registro consultado. |
| Semgrep | Tres reglas locales, 92 archivos JS/TS, sin hallazgos; alcance limitado a esas reglas. |
| Gitleaks | Historial previo y contenido preparado sin hallazgos, con salida redactada y red deshabilitada. El ejemplo de secreto se dejó vacío para no introducir excepciones al escáner. La CI repite el análisis del historial completo al publicar. |
| `pnpm docs:check` | 60 archivos y 341 enlaces locales válidos; no comprueba URLs externas ni anclas. |
| Prometheus | Seis reglas válidas y pruebas de transiciones correctas mediante `promtool`. Recolección real con `up=1` en stack temporal. |
| Grafana | Servicio saludable, ocho paneles provisionados, acceso autenticado correcto y acceso anónimo rechazado. |
| Métricas privadas | Respuestas 401 sin credencial o con credencial incorrecta; 200 y `no-store` con credencial válida. Puerto de métricas sin publicación al host. |
| Respaldo y restauración | Ensayo en contenedores con dos reportes sintéticos, un evento y una cuenta administrativa; integridad correcta y copias con permisos `0600`. |
| Caché ciudadano | El panel, sus recursos y la API quedan fuera del service worker. Continúan las comprobaciones de Red sin conexión y presupuesto de descarga. |

El ensayo Docker usó un proyecto, volúmenes y secretos temporales propios. Se eliminaron al finalizar; no se cambiaron bases ni servicios existentes. La imagen de producción rechazó la excepción HTTP administrativa. El workflow de CI también construye la imagen y comprueba salud y administración deshabilitada por defecto.

## Límites de esta entrega

- No hubo prueba visual en navegador real ni instalación nueva en un teléfono. La interfaz pasó pruebas DOM; cámara, accesibilidad asistida y tamaños físicos necesitan revisión posterior.
- No se desplegó el panel ni se instaló monitoreo en un servidor remoto. HTTPS, ingreso, custodia de secretos, responsables, canales de alerta y recuperación del proveedor requieren configuración operativa.
- La [matriz OWASP](matriz-owasp.md) identifica cobertura y pendientes. No hay certificación ni conformidad integral ASVS/WSTG, prueba de penetración independiente o prueba de carga.
- Quedan pendientes tiempo de inactividad de sesión, límites de sesiones concurrentes, comprobación de contraseñas comprometidas y procedimiento global de revocación. La sesión sí tiene caducidad absoluta y revocación por cuenta.
- Las copias de ambas bases son instantáneas independientes; cifrado externo, periodicidad, retención de respaldos y objetivos RPO/RTO requieren definición y ensayo propios.
- La bitácora no es inmutable frente a quien controla el host. La retención automática depende de que el proceso esté en ejecución; no elimina copias externas.
- No se implementaron consolidación de incidencias duplicadas, asignación institucional, comprobación de reparaciones ni visión computacional. El estado administrativo `resolved` no acredita reparación física.

## Continuidad

1. Revisar y aprobar el código y la documentación en su PR; consultar allí los resultados de CI del commit exacto.
2. Ensayar el panel en HTTPS con datos sintéticos: cada rol, TOTP/recuperación, sesión vencida, fotografías, conflictos y navegación con teclado; validar apariencia en móvil y escritorio.
3. Ejecutar la evaluación independiente definida en la matriz OWASP y resolver hallazgos antes de una exposición pública. Completar los controles de sesión pendientes según el modelo de riesgo.
4. Designar responsables, políticas de conservación y respuesta; ensayar recuperación, calibrar alertas y configurar TLS/segmentación en el entorno elegido.
5. Separar el siguiente lote de producto: incidencias consolidadas, estado de atención y evidencias de mejora. Mantener los datos observados separados de simulaciones y detecciones automáticas.

El [plan del lote](plan-administracion-seguridad.md) y la [hoja de ruta](hoja-de-ruta.md) conservan criterios de aceptación y dependencias. Registrar nuevas pruebas y despliegues con su fecha y commit, sin sustituir esta evidencia histórica.
