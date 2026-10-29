# Mejora de formulario y guía · 28 de octubre de 2026

Continúa la [entrega de producto](ENTREGA_PRODUCTO_2026-10-28.md) sobre `f7ab65b`, rama `feature/queja`. Petición del usuario: “mejora”. Alcance: reducir fricción y pérdida accidental de datos en reportes y guía; sin cambios de cobertura, administración o visión.

## Cambios

- Formulario: controles de al menos 44 px, entradas de 16 px, etiquetas legibles, asteriscos con color adaptado al tema oscuro. Foto y consentimiento agrupados; cámara, galería y archivos tienen estilos propios y disposición consistente. No se usa sólo color para indicar obligatoriedad.
- Descartar requiere confirmación. La acción inicial enfoca **Conservar borrador**; Escape cancela la confirmación, no borra ni cierra el formulario. Texto y foto se conservan hasta confirmar. La confirmación explica que descartar un borrador no retira un reporte ya enviado.
- Si falla el guardado local al cerrar, se conserva el formulario y se ofrecen **Seguir editando** o **Cerrar sin guardar**. No se cierra silenciosamente perdiendo cambios. La salida explícita no afirma borrar un borrador anterior inaccesible.
- Un primer rechazo estructurado del servidor permite corregir campos conservando el identificador y el contenido del borrador. Red/timeout, respuestas no identificables y errores de servidor siguen siendo recepción incierta: el intento permanece inmutable para reintentar sin duplicar. Un 429 después de un intento incierto no habilita cambiar su contenido.
- La comparación y eliminación/actualización del borrador usan una única transacción de IndexedDB. Un resultado de un formulario anterior no puede borrar o reemplazar el borrador vigente entre la comprobación y la escritura.
- Al restaurar un reporte con checkpoint ausente o de otro paso, el formulario se recupera directamente. Se informa que la guía anterior no está disponible; no se vuelve a preguntar si se desea retomar el borrador durante esa recuperación automática. Abrir voluntariamente un destino diferente sigue preguntando antes de cambiar el borrador.
- Guía: **Volver al paso anterior** permite corregir un avance accidental. Después de completar aparece **Volver al último paso**, incluso en viajes de una etapa. Se restaura el tramo, mapa y foco; GPS y voz quedan pausados y se elimina la evidencia de ubicación/checkpoint obsoleta. No se reaprovechan muestras antiguas como ubicación actual.

## Verificación de esta revisión

- **85/85 pruebas de regresión pertinentes**: formulario, IndexedDB, API de reportes, shell, guía/recuperación y recursos. Sin fallos, cancelaciones u omisiones. No se presenta la suite completa de la entrega anterior como si se hubiera repetido en esta revisión.
- TypeScript/build web y APK debug correctos. Recursos comprobados de nuevo después del APK final: precache **614 110 bytes**, límite 614 400; CSS/JS comprimidos dentro del presupuesto. Se conservan mapas/guardados offline.
- APK: `output/android/regiomovil-debug.apk`, SHA-256 **`f47ee4aa8b8af7795f939d94b007acdfdee975e4efe3894c944a36f200c4614a`**, API local `http://localhost:4173` por USB.
- Logs temporales: `/tmp/regiomovil-refine-tests.log`, `/tmp/regiomovil-refine-build.log`, `/tmp/regiomovil-refine-android.log`.
- No había dispositivos en `adb devices -l`. El APK quedó compilado, sin instalación ni prueba física nueva. La revisión visual de navegador continúa pendiente por el bloqueo de URL de CUA ya documentado; no se intentó sortearlo.

### Instalación física posterior solicitada por el usuario

El 28 de octubre se reconstruyó el APK desde `892e386` y se instaló sobre la app existente del Xiaomi M2103K19G mediante USB, conservando sus datos: `adb install -r` respondió **Success**. El hash coincide con el indicado arriba. `am start -W` devolvió **Status: ok / COLD** y Android confirmó `mx.regiomovil.app/.MainActivity` como **RESUMED**.

Se inició la API actual en `127.0.0.1:4173`; `android-connect` comprobó salud/CORS y el túnel USB al dispositivo. Quedó abierta para que el usuario revise los cambios. Esta evidencia confirma instalación y arranque; cámara/galería/Archivos, permisos, recreación y gestos del mapa siguen pendientes de prueba y comentarios del usuario. Mantener USB/API activos para probar envíos a la API local; no hubo despliegue remoto.

## Continuidad

Conservar los siguientes pendientes del plan: Xiaomi real (cámara/galería/archivos, permisos, cancelación y recreación), revisión de layout/gestos del mapa y guía, y las 18 rutas sin fuente suficiente. Cobertura permanece **191/209 buses + 3 Metro**. T6/T7 siguen siendo propuestas posteriores.

Para probar este APK, iniciar la API actual en loopback/puerto 4173, ejecutar `./regiomovil android-connect`, instalar con `adb install -r output/android/regiomovil-debug.apk` y abrir `mx.regiomovil.app/.MainActivity`. Reiniciar una API antigua para que use el código vigente y el contrato idempotente de SQLite v3. No hubo despliegue remoto en esta revisión.
