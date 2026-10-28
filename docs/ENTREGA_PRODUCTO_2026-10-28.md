# Entrega de mapas, trayectos y comunidad · 28 de octubre de 2026

Continúa el [plan de las nueve anotaciones](PLAN_PRODUCTO_COMUNIDAD_2026-10-27.md) en `feature/queja`, sobre `082e920`. No incorpora el panel de administración ni visión computacional; esas propuestas permanecen en el documento de modelo social.

## Cambios entregados

### T1 · Borrador y fotografía (C6, C7)

- Se aisló una causa reproducible: el `cancel` de un `<input type=file>` burbujeaba hasta el listener del diálogo y lo cerraba. `Dialog` ahora responde sólo a su propio evento de cancelación. El test verifica también que Escape del diálogo conserve su función.
- El formulario persiste un único borrador versionado en IndexedDB con título, descripción, destino exacto, categoría, consentimiento y foto JPEG procesada; no guarda el archivo original. Recuperación durante 24 horas, borrado al enviar correctamente o descartar; caducados se eliminan en el siguiente acceso. El marcador de reapertura sólo contiene una caducidad, no campos del formulario.
- Abrir una observación de otro destino pregunta si se retoma el borrador anterior o se descarta para empezar allí. Se informa si el almacenamiento no está disponible; el texto sigue en memoria. No se envía un borrador automáticamente.
- Tres acciones: Tomar foto, Elegir de galería y Elegir archivo. Camera/App oficiales de Capacitor v8 se cargan de forma diferida. Android usa captura/galería nativas; web ofrece entradas correspondientes. El selector de archivos queda disponible en ambas plataformas. Cancelar no elimina texto ni foto previa; un reemplazo fallido conserva la foto anterior hasta quitarla explícitamente.
- Mientras se selecciona se evita un cierre accidental; existe “Volver al formulario” si el selector no abre o no devuelve un evento. Resultados nativos restaurados sólo se asocian al identificador del borrador que inició la captura, con caducidad.
- Campos obligatorios con asterisco rojo y semántica `required`; se quitaron las etiquetas “(opcional)”. El consentimiento público conserva su carácter opcional.
- Envíos con UUID estable e idempotencia en servidor/SQLite v3. Reintentar exactamente el mismo envío devuelve el recibo original; cambiar contenido bajo esa clave produce 409. Después de un intento se mantienen sus campos para poder reintentarlo sin duplicar; una observación distinta se inicia descartando el borrador anterior. Cierres asíncronos protegidos contra doble acción y respuestas tardías; una respuesta anterior no cierra ni elimina otro borrador.

No se demuestra todavía cancelación física de cámara/galería/Archivos, permisos denegados ni terminación real de proceso en el Xiaomi: no estaba conectado. La corrección del evento y la recuperación del estado sí están cubiertas por pruebas DOM/IndexedDB y de contrato de API; no equivalen a una prueba de dispositivo.

### T2 y T4 · Guía y participación (C1, C5, C8, C9)

- Estación/ruta invitan a “Ayuda a mejorar este lugar / Compartir observación”. Acción verde, textura y espaciado propios; recuentos y texto de alcance quedan en “Ver reportes”, sin bloque de ceros dominante. Se mantienen carga/error/reintento.
- “Reportar algo en este tramo” funciona dentro de la guía compartida por viajes nuevos y guardados. Pausa GPS y voz, abre el formulario por encima y conserva la etapa. Cerrar o enviar vuelve a la misma guía pausada; reanudar requiere una acción explícita.
- Ruta/variante por ID exacto del grafo; Metro por `stationId` explícito, con confirmación de estación. El destino del paso se propone como referencia, nunca como prueba de ubicación del usuario. No se adivinan códigos repetidos ni se convierte una parada bus en Metro.
- Se guarda un checkpoint acotado del viaje para el regreso desde el reporte: subset de paradas/rutas/fuentes, sin historial GPS, límite 1 MB, TTL 24 horas. Al recuperar se exige viaje y paso coincidentes; si no existe un checkpoint válido, se recupera sólo el formulario. Terminar la guía elimina el checkpoint.
- Etapas con franjas e iconos para caminar, servicio y transbordo; resumen compacto y detalles secundarios desplegables. Se conservan incertidumbres de sentido, acciones de estación y datos offline.

### T3 · Mapa como pantalla (C2, C4)

- El explorador conserva una sola instancia de mapa al ampliar. Oculta cabecera, navegación y catálogo; mantiene buscador, filtros, zoom, ubicación, atribución y salida. No abre una tarjeta/diálogo de detalle.
- Historial, Escape/Atrás y salida preservan encuadre/filtros y restauran foco. Se distingue tap de arrastre; el encuadre descuenta overlays y zonas seguras.
- A escala regional se omiten nodos y hit targets de paradas; zoom cercano los revela con control de densidad. Extremos, selección y puntos esenciales de una etapa conservan excepciones. No se esconden sólo las etiquetas dejando círculos interactivos invisibles.
- Las pruebas de interacción no sustituyen la revisión visual con layout real ni el gesto/pinch/Atrás físico. CUA rechazó enlazar `http://localhost:5173/` mediante su política de URL; no se intentó sortear ese bloqueo por otra superficie.

### T5 · Cobertura (C3, parcial)

Se recuperaron seis mapas oficiales IMA que se insertan mediante iframes después de la carga inicial: 218 Fleteros, 223 Héctor Caballero, 226 Palmiras–Sendero, 228 Santa Isabel–Félix U. Gómez, 233 Raúl Salinas–UANL y 527 Misión San Javier. Se contrastó identidad de página, mapa y KML.

**191/209 buses**, más 3 Metro: **194 recorridos y 10 806 puntos**. Los nuevos mapas publican sólo dos puntos cada uno; no se inventaron paradas intermedias. El cálculo sigue siendo experimental, con orden/sentido de autobús sin verificación operativa.

La tarjeta grande ya está dentro de “Información del catálogo”. No se declaró cobertura completa: quedan 18 buses y las dos líneas en construcción fuera del grafo. Ver [auditoría de las 24 variantes](auditoria-pendientes-2026-10-28.md), [registro estructurado](../data/route-pending-audit-2026-10-28.json) e [inventario vigente](inventario-rutas-2026-10-28.csv).

## Recursos y compatibilidad

Se conserva el presupuesto inicial de 600 KiB y Red disponible offline. Cámara, reporte y recuperación de guía son módulos diferidos. CSS de producción se optimiza con Lightning CSS. Fuentes locales mantienen todos los caracteres y el rango de pesos usado por la app (300–750); se eliminan extremos sin uso y metadatos de menú de escritorio, con licencias OFL preservadas. Reproducir opcionalmente con `scripts/optimize-local-fonts.py`; Python/fonttools no se requieren para compilar normalmente.

Comprobación de fuentes: mismo mapa de caracteres; todos los pesos usados entre 300 y 750 comparados. La instanciación introduce redondeo máximo de contorno de 1,63/1000 unidades en Montserrat y 1/2048 en Inter (menos de 0,04 px a 24 px), sin cambio de familia, glifos disponibles ni pesos solicitados. No se afirma una comparación visual de navegador que no se hizo.

## Verificación y APK

Resultado final: **365/365 pruebas Node/React**, sin fallos, cancelaciones ni omisiones; **4/4 pruebas Python del importador**. TypeScript, build web, inventario `--check` y compilación Android correctos. Se mantienen los límites de desempeño/paquetes offline. Precache del APK final: **614 110 bytes**, bajo 614 400 (600 KiB); quedan 290 bytes de margen. No añadir módulos iniciales sin revisar ese presupuesto.

Registro: `/tmp/regiomovil-product-final-suite.log`; compilación: `/tmp/regiomovil-product-build.log`; Android: `/tmp/regiomovil-product-android.log`. Son evidencia temporal, no archivos compartidos entre máquinas.

APK debug con API local USB: `output/android/regiomovil-debug.apk`, **13 566 565 bytes**, SHA-256 **`b5e7445721ded3aa4ea67323be9ffc398cecd923f8d1b150102766fb5351b7c5`**, compilación web/nativa correcta, plugins Camera/App integrados. No se reinstaló: no había dispositivo ADB conectado. Para probarlo usar la API en `127.0.0.1:4173`, `./regiomovil android-connect` e instalar con `adb install -r`; no hace falta abrir puertos de la red Wi-Fi. Reiniciar la API local para cargar SQLite v3/código actual antes de probar idempotencia.

No hay despliegue de frontend/API remotos ni publicación de reportes reales. Las pruebas usan bases temporales y fotos sintéticas.

## Próxima interacción

1. Con el Xiaomi conectado, instalar el APK de esta entrega y comprobar cámara/galería/archivos: cancelar, sustituir foto, permisos denegados, rotación y regreso tras recreación. Completar evidencia de C7 antes de declararlo cerrado físicamente.
2. Revisar mapa en layout real (390×844, 926×1025 y 320 px), teclado virtual, pinch, foco y Atrás; corregir cualquier diferencia visual antes de declarar C2/C4 cerrados visualmente.
3. Probar guía nueva y guardada: reportar a pie/Metro/bus/transbordo, cancelar/enviar, volver al mismo paso, GPS/voz pausados y recuperación tras reinicio.
4. Continuar las 18 fuentes pendientes desde la auditoría individual, empezando por enlace 218 Plutarco E. Calles y contradicción 38/310. No sustituir variantes ni fabricar trazos para alcanzar el 100 %.
5. Sólo después de esas correcciones, concretar operación/revisión para T6. T6/T7 no están autorizados como una construcción inmediata de panel o visión en esta iteración del plan.
