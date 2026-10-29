# Seguridad y comunicación de vulnerabilidades

RegioMóvil es un piloto. `main` contiene la base de revisión; no existe todavía una política de versiones con soporte ni una evaluación de conformidad OWASP completada. Ver [controles y brechas](docs/seguridad-y-operacion.md).

## Comunicar un hallazgo

No publicar en issues ni PR abiertas vulnerabilidades explotables, reportes/fotos privados, secretos o detalles que permitan acceder al servidor. Contactar al mantenedor por un canal privado ya acordado. Si la pestaña **Security** del repositorio ofrece **Report a vulnerability**, se puede usar ese formulario privado; este documento no afirma que esté habilitado.

Antes de ampliar el piloto, el responsable debe habilitar y anunciar un canal privado y una política de atención. Actualmente no se promete un plazo de respuesta, recompensa ni autorización general para probar servicios publicados.

Incluir versión o commit, componente, condiciones necesarias, impacto y pasos mínimos reproducibles sobre un entorno propio. Usar datos ficticios y omitir secretos. Coordinar la divulgación de detalles tras corregir y verificar.

## Pruebas e incidentes

Ejecutar pruebas en una copia local con base temporal y autorización para el entorno evaluado. No hacer pruebas destructivas, de carga o extracción sobre usuarios o proveedores externos. Auditorías de dependencias, tests y cabeceras HTTP son evidencias parciales; no equivalen a certificación ni a una prueba de penetración completa.

Ante una exposición confirmada: restringir acceso, preservar evidencia mínima privada, rotar credenciales comprometidas cuando aplique, corregir y verificar recuperación. No borrar bases ni modificar evidencia para ocultar el incidente. Formalizar responsables y procedimientos antes de ampliar operación; ver [hoja de ruta](docs/hoja-de-ruta.md).
