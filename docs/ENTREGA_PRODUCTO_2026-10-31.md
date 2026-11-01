# Implementación y continuidad · 31 de octubre de 2026

Plan: [P1–P10](PLAN_PRODUCTO_COMUNIDAD_2026-10-31.md). Base `0bba29e`. Móvil `0c558f8` en `codex/mapa-movil-reportes`; administración `ce6bac7` y corrección del build Android `138e959` en `codex/admin-mapa-reportes` (rama apilada). Esta entrega no cambia cuentas, MFA ni bases reales. Las pruebas usan bases temporales; no se copió evidencia privada.

## Cambios

| Entrega | Implementación | Cierre pendiente |
| --- | --- | --- |
| P1 | Dock medido común para ficha, información y atribución; nombres completos, scroll y controles libres. Una sola entrada de información. | Capturas E1–E4 en teléfono, orientación/fuentes/teclado/áreas seguras. |
| P2 | Arrastrar/pellizcar cambia a exploración; GPS no la deshace. Seguirme conserva zoom. Encuadre útil, rAF para gestos, proyección cacheada y limpieza al salir. | Perfiles comparables de frames/memoria y diez ciclos físicos. No se afirma una mejora medida de fps. |
| P3 | [Revisión parcial de fuentes](auditoria-pendientes-2026-10-31.md), con [registro nuevo](../data/route-pending-review-2026-10-31.json). Sin trazos nuevos acreditables. | 18 buses sin geometría suficiente; L4/L6 siguen excluidas en el inventario. No copiar variantes ni inventar paradas. |
| P4 | Una entrada Añadir foto; selector Android Cámara/Galería/Archivos, URI en cache compartida restringida y asociación solicitud/borrador. Web adaptativa; cancelar conserva foto/campos. | Cámara OEM, retorno, rotación y recreación de proceso físicos. La revisión estática no reproduce por sí sola el fallo original. |
| P5 | Retirado sólo el párrafo redundante del segundo descarte; conservar/descartar/foco y error de almacenamiento permanecen. | Verificación de lector de pantalla en teléfono. |
| P6 | Mapa administrativo de consentidos aprobados, filtros/estados, lista enlazada e indicadores coherentes. Estaciones por catálogo; ruta bajo demanda; unidades sin pin inventado. MFA/RBAC/CSP/no-store conservados. | Ubicación observada con migración, paginación de grupos y enlace a expedientes con el mismo periodo; QA visual autenticada. |
| P7 | Generador privado nuevo, 240 observaciones ficticias y manifiesto: 120 abiertas, 40 resueltas, 50 pendientes, 30 rechazadas. Rótulo sintético persistente. [Comandos de demo](demo-administracion.md). | Operador crea cuenta separada y completa MFA para la revisión visual. No hay bypass de autenticación. |
| P8 | Crear/continuar reporte en Inicio, después del planificador, sin asignar silenciosamente estación. Contextos de ficha/guía se conservan. | Ensayo físico del flujo completo desde Inicio y guía. |
| P9 | Ajustes agrupados y tarjetas de red documentada/simulación/comunidad, con fuentes y metodología desplegables. Ambas vistas disponibles al abrirlas por primera vez offline. | TalkBack y fuente ampliada en dispositivo. |
| P10 | [Instrumento y metodología VDP](propuesta-medicion-servicio.md) conservados como diseño versionado. | Validación del cuestionario con participantes y responsable de datos antes del piloto. No se habilitó recolección, alertas ni publicación oficial. |

El mapa muestra **reportes**, no daños únicos ni una prioridad automática de inversión. La ubicación de una estación no es el punto exacto de una falla. Los grupos de unidad son referencias declaradas, sin catálogo de flota verificado. Las opciones estación/ruta dependen del conjunto mostrado (hasta 250 grupos); limpiar filtros amplía la consulta. La bandeja paginada sigue separada del agregado.

## Verificación y límites

La integración fuerza React de producción aunque `.env` configure la API en modo desarrollo. Se conserva el límite de 600 KiB, la carga diferida administrativa y las fuentes/iconos locales. Se retiraron selectores CSS sin uso y declaraciones incondicionales reemplazadas por reglas posteriores; las reglas de tema/contraste y contextos activos se conservan.

Resultados finales de integración, registrados al continuar el 1 de noviembre de 2026:

- `./regiomovil build`: TypeScript, catálogo, grafo y Vite correctos. Precache **613.966 bytes**, menor que 614.400 (600 KiB); el margen es sólo 434 bytes. JS/CSS cumplen los techos comprimidos existentes.
- `node --import tsx --test --test-concurrency=4 tests/*.test.mjs tests/*.test.tsx`: **450/450** aprobadas, sin omitidas; ejecución local 41,9 s. Incluye mapa 25, guía 19, formulario 21, adaptador 6, geografía administrativa 6, interfaz administrativa 7 y contrato MFA/roles.
- `python3 -m unittest discover -s tests -p '*_test.py'`: **4/4**. Inventario `--check`: correcto, 214 fichas /194 mapas /20 sin mapa.
- `node scripts/check-docs.mjs`: 68 archivos, 412 enlaces locales válidos en esta pasada. No verifica fuentes externas ni anclas. `git diff --check`: limpio.
- Navegador a **390 × 844 CSS px**: Inicio con Crear/Continuar reporte, formulario sin estación asignada, hoja web de fotografía, ruta L2 y selección San Nicolás en mapa normal/completo. [Captura de implementación](evidencia/2026-10-31/06-mapa-ficha-corregida-web-390.png). Es prueba web; no acredita áreas seguras OEM ni cámara física.
- APK debug compilado desde `138e959`, versión 1.1.0/código 2, **13.567.177 bytes**, API local `http://localhost:4173`. SHA-256 `739e62ab39ac8a7cca0dc4658ae610193c61de0c3712c0f43284f4803929f569`; web bundle `8ae1daa360d0342b583fbd8279e7368851afe411f515e1104ee726c12fad3ceb`. El script contrastó los recursos web copiados y el bundle; firma debug v2 válida, misma huella de certificado que la instalación anterior. El precache con URL local suma **614.008 bytes** (392 de margen); sus 12 pruebas de offline/presupuesto pasan.
- `./regiomovil android-connect`: sin dispositivo detectado al comprobar. **No instalado** ni validado físicamente en esta entrega. APK y metadatos están en `output/android/`, fuera de Git.
- Servidor normal levantado en loopback 4173, sin cambiar cuentas/MFA. Fixture sintética preparada en `/tmp/regiomovil-admin-demo-20261101`, con base/env propios y 240 observaciones; nunca se mezcló con datos reales. La demo requiere crear su cuenta separada y completar MFA mediante el flujo normal.

La prueba de servidor con 5.000 reportes aprobados y 20 filtros mantiene 250 grupos, total 5.000 y aviso de truncamiento. Una ejecución local en memoria observó p95 10,47 ms y 2.115 bytes gzip; es consulta/agregación de fixture en esta computadora, sin HTTP, disco persistente, frontend ni garantía de latencia del teléfono.

## Reanudación

1. Leer esta acta y el plan; comprobar rama/commit y `git status`. No asumir que navegador/APK sirven el mismo código.
2. Probar P1/P2/P4 en M2103K19G y otro Android: anchos 320/390/412, horizontal, texto ampliado, navegación por botones/gestos y teclado; cámara/galería/archivos, cancelar y retorno a guía sin pérdida.
3. Iniciar demo P6/P7 en 4180 y completar MFA desde el autenticador propio. Comparar 120/160, categoría, periodo, unidades/sin punto, ruta sin trazo y retirada de publicación. Registrar capturas sólo sintéticas.
4. Segunda entrega administrativa: definir ubicación observada/precisión/consentimiento; migración aditiva compatible con APK anteriores. Añadir navegación/paginación sin descargar fotos masivamente ni revelar referencias privadas al analista.
5. P3: recuperar ficha STCM y enlaces IMA corregidos, o equivalencias oficiales. Las solicitudes preparadas no se enviaron. Importar por variante con procedencia/derechos y regenerar grafo/inventario.
6. P10: validar comprensión, duración, saltos y denominadores con usuarios; definir responsable/retención antes de recoger encuestas. Alertas y acuerdos legales/institucionales permanecen posteriores.

Las compilaciones y pruebas locales no acreditan un pentest OWASP completo, despliegue HTTPS, cámara física ni representatividad de la participación. El siguiente chat debe continuar los pendientes anteriores, sin rehacer borradores/seguridad ya implementados.

## Probar el APK preparado

Con el teléfono conectado y depuración USB autorizada, mantener el servidor de esta computadora activo en 4173 y ejecutar desde la raíz:

```sh
./regiomovil android-connect
"$HOME/Android/Sdk/platform-tools/adb" install -r output/android/regiomovil-debug.apk
"$HOME/Android/Sdk/platform-tools/adb" shell am start -n mx.regiomovil.app/.MainActivity
```

`install -r` actualiza conservando datos; no desinstalar para resolver una firma diferente. Administración normal: `http://localhost:4173/admin`. La [demo](demo-administracion.md) usa otro puerto y cuenta, sin copiar identidades ni autenticadores existentes.
