# Inicio visible y reportes para visualización

**8 de noviembre de 2026 · `codex/ux-reportes-visibles`.** Continúa la entrega de [Inicio contextual](ENTREGA_INICIO_CONTEXTUAL_2026-11-06.md) y atiende las nuevas solicitudes de UI, colores y contenido sintético. Código de interfaz: `45ed81a`; generador/procedencia: `7d7d48c`. Merge a `main` pendiente.

## Cambios

- Afluencia por hora, consejo y mapa de Metro **abiertos al iniciar**. El usuario puede contraerlos; fuentes y metodología siguen como detalles secundarios. Esta decisión sustituye el mapa/pronóstico cerrados del plan anterior.
- Selector con nombre legible, ilustración, botón «Cambiar transporte» y controles separados. Planear, Reportar y Guardados preceden al mapa. Botones delimitados, texto principal oscuro y descripción completa de los reportes sin abrir «Leer observación».
- Etiquetas sólidas compartidas en Inicio, estaciones, identidad, catálogo y búsqueda del mapa: L1 ámbar, L2 verde, L3 coral; TM verde oscuro, RegioRuta azul, Muevo León lima, Ecovía magenta e integradas violeta. Código/nombre acompañan el color. Contraste de texto verificado ≥4.5:1; mínimo de la paleta 5.05:1.
- Las tarjetas mantienen su ancho y desplazamiento horizontal en móvil. En la revisión visual se corrigió el mínimo flexible que estrechaba cinco tarjetas simultáneamente.

## Base sintética aislada

El perfil `community` añade **1,200 registros** sin modificar el perfil administrativo anterior de 240. Los títulos y descripciones son naturales, sin rótulos repetidos de «demo»; no hay personas, fotos o identificadores reales de flota. La procedencia inventada queda indicada una vez en el contexto público, también en la API y administración.

| Estado | Conteo |
| --- | ---: |
| Públicos abiertos | 840 |
| Resueltos públicos | 180 |
| Pendientes privados | 120 |
| Rechazados privados | 60 |
| Total público | **1,020 (85%)** |

Distribución: **209 rutas y 38 estaciones** con registros públicos. Félix U. Gómez tiene **300 registros, 255 públicos**, con referencias a andén/acceso de Línea 3; la estación es compartida con L1 y el contrato conserva `stationId`, no un nuevo filtro por línea. Transmetro San Bernabé–No Reelección tiene **320 registros, 272 públicos**, entre recorrido y unidades ficticias.

El perfil aplica las transiciones de moderación mediante un revisor generado; no representa revisión humana de daños reales. El manifiesto conserva semilla, fecha, SHA-256 del contenido, distribución y focos. Reportes públicos requieren estados/consentimiento normales; los privados siguen fuera del feed. No se mezclan datos inventados con la base real.

La base activa queda en `output/fixtures/regiomovil-admin-demo-comunidad-20261108/reports.sqlite`, fuera de Git y de `dist`. El servidor de 4173 usa ese archivo mediante una variable del proceso; `.env`, cuentas y MFA existentes no se cambian. La configuración independiente `demo.env` del generador sirve para una administración totalmente separada en 4180; no es la utilizada por la sesión local de 4173.

## Reproducir

Con Node 24 y pnpm, generar una sola vez en un **directorio nuevo**:

```sh
pnpm admin:demo --directory "$PWD/output/fixtures/regiomovil-admin-demo-comunidad-OTRA" --profile community --seed comunidad-08
```

Crear antes el directorio padre `output/fixtures` si no existe. Para la base ya preparada en esta computadora:

```sh
DATABASE_PATH="$PWD/output/fixtures/regiomovil-admin-demo-comunidad-20261108/reports.sqlite" ./regiomovil start
```

No iniciar otro servidor si 4173 está ocupado. Para volver a reportes reales, detener el proceso de visualización y ejecutar `./regiomovil start` sin esa variable; no copiar ni importar los registros sintéticos. Para renovar fechas y retención, generar otro directorio. La retención normal de 90 días sigue activa.

Web: `http://localhost:4173/?page=home`. Elegir Félix U. Gómez, Línea 3, y después TM San Bernabé–No Reelección desde el selector. Administración: `/admin`, con cuenta/TOTP existentes.

## Verificación y continuidad

- **565/565 pruebas Node/React**, cero fallos. Cobertura nueva: corpus, aislamiento, conteos, procedencia pública, contexto sintético/real, respuestas tardías, secciones abiertas y contraste de etiquetas.
- **4/4 pruebas Python**; TypeScript, build, inventario y presupuestos aprobados. Precarga final 609,467 B (~595.2 KiB), bajo 600 KiB; no se elevó el límite. El mapa ahora se solicita al estar abierto; permanece fuera de precache y no descarga el grafo regional en Inicio.
- Comprobación del servidor: Félix 255 = 210 abiertos +45 resueltos; Transmetro 272 = 224 +48. Hasta 20 publicaciones recientes por consulta; Inicio muestra cinco tarjetas y el total completo.
- Revisión web móvil con contenido real del corpus. Capturas sólo locales en `output/qa/ux-reportes-2026-11-08/`, fuera de Git. Las pruebas DOM no acreditan TalkBack, GPS, cámara ni fluidez física.

Android actualizado desde `45ed81a`: APK debug de 13,568,734 B, 273 recursos idénticos a `dist`, firma v2 verificada. SHA-256 `3d49c9e2cecb477c0573c9633f4e225cf000b1fd91ae5cbdffcf61e7fd378e66`. `adb install -r` terminó en Success; el hash instalado coincide y MainActivity quedó iniciada, conservando los datos. API local conectada por túnel USB. No acredita QA física de cámara/GPS.

Para repetir la actualización, con servidor activo y teléfono autorizado:

```sh
./regiomovil android --dev-local-api --offline
adb reverse tcp:4173 tcp:4173
adb install -r output/android/regiomovil-debug.apk
adb shell am start -n mx.regiomovil.app/.MainActivity
```

`--offline` requiere dependencias Gradle previamente descargadas. Conservar USB y servidor para el acceso a la API local. No se ha realizado un despliegue remoto.

Siguiente trabajo: recoger observaciones físicas sobre esta revisión; mantener abiertos los pendientes P1/P2/P4, las 18 variantes sin trazo, seguridad/operación y P10. No usar este corpus para evaluar demanda real, desempeño del transporte o inversiones. Registrar cualquier moderación adicional: sus conteos ya no coincidirán con el manifiesto inicial.
