# Inicio según boceto · desarrollo y continuidad

Fecha: **5 de noviembre de 2026**, America/Monterrey. Rama `codex/inicio-boceto-transporte`, base `4173963` de `codex/evaluadores-optimizacion`. Continúa **P8** del [plan P1–P10](PLAN_PRODUCTO_COMUNIDAD_2026-10-31.md) y la [entrega web anterior](ENTREGA_EVALUADORES_2026-11-01.md). Este lote prepara revisión; no integra `main` ni instala un APK nuevo.

## Boceto y resultado

El [boceto original del usuario](evidencia/2026-11-05/boceto-inicio-usuario.png) propone elegir transporte, encontrar un punto cercano o seleccionarlo, consultar un recorrido y participar mediante reportes. Se adapta a los datos y capacidades existentes:

| Elemento | Implementación y aceptación |
| --- | --- |
| Metro / autobús | Dos opciones con iconos, estado seleccionado, teclado y paneles accesibles. Encabezado y acceso al planificador más compactos; se conservan guardados y navegación. |
| Selección manual / cercana | Metro reutiliza el selector de estación. Autobús permite buscar ruta y elegir una parada elegible del recorrido. GPS sólo por acción explícita y con alternativa manual. |
| Vista del recorrido | Esquema geográfico pequeño de la línea o del trazo importado, marcador seleccionado y acceso a Red. No descarga mapas de calles ni la red regional al abrir Inicio. |
| Llegadas / afluencia | Se conservan los datos de Metro, rotulados como simulación, horario, favoritos y detalles. Llegadas por sentido en tarjetas desplazables en móvil. No se inventan llegadas ni afluencia de autobús. |
| Participación | «Crear reporte» conserva contexto general; «Reportar aquí» asigna únicamente la estación o ruta elegida. La selección de parada orienta el mapa: no agrega un ID de parada al contrato actual del reporte. |
| Comunidad | Hasta cinco tarjetas recientes por estación o ruta, con estados y recuentos públicos del servidor; texto y foto se abren bajo demanda. Carga, error con reintento y vacío real son estados diferentes. |
| Estrellas del boceto | Pendientes de **P10**, [medición del servicio](propuesta-medicion-servicio.md). No hay puntuaciones, estrellas ni NPS fabricados. |

Componentes: [Inicio](../src/components/HomeDashboard.tsx), [selector y contexto](../src/components/HomeTransportHub.tsx), [esquema](../src/components/HomeTransportMap.tsx), [comunidad](../src/components/HomeCommunityFeed.tsx) y [funciones geográficas](../src/components/homeTransport.ts).

## Reglas de datos, ubicación y privacidad

- El catálogo de autobuses se solicita al abrir esa opción; el paquete de una ruta se solicita al seleccionarla. No se mezclan variantes por compartir número.
- La lista de paradas aplica las mismas reglas de elegibilidad geométrica del preparador del grafo: coordenadas regionales válidas, IDs únicos, exclusión de propuestas sin existencia publicada y distancia máxima de **160 m** a un segmento. `experimentalRouting: false` conserva consulta visual sin ofrecer paradas/GPS para abordaje. Esto no verifica infraestructura en campo ni operación actual.
- Los segmentos separados se dibujan separados. Metro es un esquema que une coordenadas de estaciones; no representa con exactitud la vía férrea. La tarjeta indica «Esquema orientativo».
- La ubicación cercana se calcula en el dispositivo, en línea recta, hasta **15 km**, con precisión reportada entre **0 y 1 500 m**. Para autobús sólo compara puntos de la ruta ya elegida; no recomienda automáticamente el mejor autobús ni calcula una caminata segura. No crea un watcher ni guarda coordenadas nuevas.
- Una selección manual, cambio de modo o desmontaje invalida resultados GPS tardíos. Las respuestas de catálogo/trazo antiguas no reemplazan la selección actual.
- Fuente, fecha y alcance quedan disponibles por ruta; si el orden no está confirmado, se informa. Los enlaces externos admiten sólo HTTPS sin credenciales incrustadas.
- La comunidad usa el endpoint público existente, con cancelación al cambiar contexto. Sólo renderiza estados publicados/resueltos. Las fotos se solicitan al expandir la observación. La moderación/consentimiento siguen a cargo del servidor; «resuelto» no acredita reparación inspeccionada.
- No se modifican cuentas, MFA, permisos, esquema de base de datos ni caché de información administrativa. No se insertan reportes sintéticos en la base real.

## Eficiencia y recuperación

Inicio no solicita `mobility-network.json` (**8 971 720 bytes** en esta revisión). La pestaña Autobús obtiene el catálogo de **208 692 bytes** y después un paquete por ruta; reutiliza el índice de búsqueda existente. La elegibilidad de paradas y las proyecciones se memorizan según sus entradas.

Los módulos nuevos de transporte y comunidad son diferidos y quedan fuera del precache inicial. Una primera apertura sin conexión puede carecer de estos módulos: la frontera local mantiene la consulta básica de estación, fuentes y acción de reporte, con reintento. Un error del módulo de comunidad conserva el resto del inicio. No se promete disponibilidad offline de observaciones públicas. El formulario mantiene sus propias reglas de conexión y borrador.

Se retiraron el selector duplicado del encabezado y sus reglas CSS sin consumidores. Se conserva el presupuesto de **614 400 bytes** de precache; no se retiraron Red, fuentes ni ajustes del núcleo offline para habilitar este diseño.

## Verificación de la entrega

- Compilación de producción con TypeScript aprobada; precache **613 645 bytes**, margen **755 bytes**. Los módulos nuevos y la comunidad permanecen diferidos. Se conservan límites por JS/CSS comprimido.
- Suite completa: **491/491** Node/React aprobadas, **43.44 s**, concurrencia de cuatro archivos. Después se amplió el caso de pestañas para verificar paneles ARIA y conservar atajos del navegador (Ctrl/Alt/Meta); archivo focal **12/12** aprobado y compilación repetida.
- Regresiones nuevas: descargas bajo demanda, selección y reporte de autobús, segmentos separados, elegibilidad de paradas, GPS denegado/impreciso/lejano y respuestas tardías, cambio de contexto, fuentes seguras, consulta pública y foto diferida. Dos pruebas simulan fallo real de importación ESM del transporte o de la comunidad y comprueban que Inicio siga utilizable.
- Se conservan pruebas de horario/afluencia/fuentes, borradores y reporte general sin estación supuesta. La integración verifica que elegir ruta y abrir «Reportar aquí» precargue esa ruta sin enviar un reporte.
- Importador Python: **4/4** aprobadas. Inventario reproducido: **214 servicios**, **194 con mapa**, **20 pendientes**; no se añadieron trazos ni fuentes en este lote.
- Revisión en navegador local, tamaño móvil **390 × 844** y **320 × 740**, selección de autobús/parada y procedencia, más vista de escritorio. Sin desbordamiento horizontal observado. Es emulación de tamaño; no acredita cámara, GPS físico, batería o fluidez Android.

Evidencia: [Metro móvil](evidencia/2026-11-05/inicio-metro-movil.jpg), [Autobús móvil](evidencia/2026-11-05/inicio-autobus-movil.jpg), [Inicio de escritorio completo](evidencia/2026-11-05/inicio-escritorio.jpg) y [vista inicial](evidencia/2026-11-05/inicio-vista.jpg). Las tarjetas visibles corresponden al estado público local al tomar la captura; los conteos pueden cambiar. No se envió ningún reporte durante esta verificación.

## Probar la revisión

Desde la raíz, con Node 24+ y pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
./regiomovil build
./regiomovil start
```

En esta computadora: [Inicio](http://localhost:4173/), [portal de evaluación](http://localhost:4173/acceso.html) y [administración](http://localhost:4173/admin). La configuración `.env` existente define el puerto; el valor por defecto en otro equipo es 3001. Si el servidor ya está activo, no iniciar una segunda instancia. La cuenta administrativa existente conserva contraseña y MFA.

Para reconstruir y actualizar Android de pruebas por USB:

```sh
./regiomovil android --dev-local-api
adb reverse tcp:4173 tcp:4173
adb install -r output/android/regiomovil-debug.apk
adb shell am start -n mx.regiomovil.app/.MainActivity
adb shell am start -a android.intent.action.VIEW -d http://localhost:4173/admin
```

`--dev-local-api` se limita a debug por túnel USB. Los comandos Android se proporcionan para la siguiente prueba: **no se ejecutaron en este lote**. Conservar datos y firma; ver [guía Android](android.md).

Verificación reproducible:

```sh
pnpm docs:check
node --import tsx --test --test-concurrency=4 tests/*.test.mjs tests/*.test.tsx
node scripts/prepare-coverage-inventory.mjs --check
python3 -m unittest discover -s tests -p '*_test.py'
```

## Próxima interacción y criterios pendientes

1. **P8 · probar el boceto en el teléfono:** actualizar APK de esta rama, comparar Metro/intercambio/autobús, selección manual/GPS, nombres largos, TalkBack, texto ampliado y claro/oscuro. Verificar permiso denegado, regreso desde segundo plano y que el mapa no añada carga regional inicial.
2. **P1/P2/P4 · aceptación física:** conservar pruebas pendientes de fichas/áreas seguras, guía y cámara/galería/archivos, cancelación y borrador. Medir frames y memoria antes de afirmar una mejora de rendimiento en el equipo.
3. **P3 · cobertura:** siguen 18 variantes de autobús pendientes y L4/L6 excluidas en la instantánea. Resolver con la [auditoría de fuentes](auditoria-pendientes-2026-10-31.md); no completar con trazos supuestos.
4. **P6/P7 · administración:** revisar mapa, filtros y métricas con la [demo aislada](demo-administracion.md), sin mezclarla con reportes reales. Mantener MFA y revisión humana.
5. **P10 · puntuaciones:** definir encuesta/denominadores y protección frente a duplicados antes de añadir estrellas, NPS o rankings al inicio.
6. **Integración:** revisar esta rama contra `codex/evaluadores-optimizacion` y los PR apilados anteriores, con CI aprobada; el merge a `main` queda pendiente. Un push no publica frontend, API ni APK. Continuar seguridad/hosting según la [hoja de ruta](hoja-de-ruta.md).

Antes de retomar: leer este registro, `git status`, P1–P10 y la última entrega; confirmar qué commit sirve la web y cuál está instalado. Registrar nuevos cambios, pruebas y limitaciones en otra entrega fechada, sin reemplazar la evidencia histórica.
