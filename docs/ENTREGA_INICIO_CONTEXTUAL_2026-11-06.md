# Inicio contextual · entrega y continuidad

**6 de noviembre de 2026 · rama `codex/inicio-contextual`.** Implementación del [plan I1–I7](PLAN_INICIO_CONTEXTUAL_2026-11-05.md), desde el commit documental `58cf9ac`. Amplía P8; mantiene abiertos los pendientes físicos, cobertura y seguridad de [P1–P10](PLAN_PRODUCTO_COMUNIDAD_2026-10-31.md). No incluye merge a `main` ni despliegue remoto.

## Cambios entregados

| Bloque | Resultado |
| --- | --- |
| I1 | Metro inmediato, independiente del selector/mapa/comunidad. Próxima llegada por sentido real y línea; afluencia y simulación visibles. Terminales y horario conservados. |
| I2 | Vehículo SVG local en círculo accionable. Selector finito por swipe, flechas y teclado; diálogo manual con búsqueda, selección tentativa y confirmación. Se retira el CTA grande de planificación. |
| I3 | Índice público de cercanía: 191 variantes de autobús y 10 768 puntos elegibles. Misma normalización e IDs del grafo. Inicio no descarga el grafo regional. |
| I4 | Cercanía voluntaria en primer plano. Radio de 1.2 km, ampliación explícita a 3 km y hasta ocho candidatos. Muestras de hasta 60 s; aproximadas requieren elección manual. Sin coordenadas enviadas ni persistidas por este flujo. |
| I5 | Mapa local de una sola ruta, parada canónica, zoom y encuadre conservados en memoria. Ampliar abre su variante exacta en Red; regresar recupera contexto, cámara y foco. |
| I6 | Planear desde aquí, Guardados y Reportar aquí separados. Sin parada confirmada, se solicita origen y no se inventa destino. Comunidad limitada al contexto y a publicaciones revisadas; fotos bajo demanda. Borrador preservado. |
| I7 | Pruebas de integración, errores de módulos, permisos, cancelación, integridad de datos y cámara; portal de evaluación actualizado. Evidencia y límites registrados abajo. |

Autobús muestra «Llegadas y afluencia no disponibles». No se añaden estrellas, telemetría ni tiempos ficticios. Las valoraciones siguen en P10.

## Datos, privacidad y carga

- `scripts/prepare-mobility.mjs` genera `public/home-nearby.json` y el grafo usando `shared/published-route.mjs`. La regeneración conserva el grafo existente byte por byte: revisión `cc353bbf5bca`, 194 servicios y 10 806 puntos. No agrega trazos sin fuente; siguen pendientes 18 variantes de autobús.
- El índice ocupa **370 947 B**, **85 658 B gzip**; queda fuera de la precarga y se obtiene al activar cercanía. Sólo contiene puntos públicos y metadatos de rutas.
- Distancias en línea recta, no vehículos en vivo ni accesos peatonales garantizados. Precisión automática máxima 200 m, límite aceptado 1 500 m. Permiso nativo revocado entre consulta y lectura no provoca otra solicitud automática. En web, una lectura nueva requiere acción explícita.
- Se persiste únicamente la preferencia de cercanía. Muestra GPS, candidatos y cámaras de mapa quedan en memoria; doce cámaras como máximo. Se cancelan lecturas/peticiones al cambiar manualmente, abrir reportes, pasar a segundo plano o desmontar.
- Los paquetes versionados verifican SHA-256 sobre sus bytes antes de usarlos o guardarlos. Se requiere contexto seguro del navegador; `localhost` y el WebView HTTPS de Android lo ofrecen. El hash comprueba coincidencia de revisión, no autenticidad institucional de la fuente.
- Guardados, vigilancia del borrador y retorno de foco se cargan con el Hub secundario. Metro, Red, ajustes y fuentes conservan su precarga básica. El selector/mapa opcional puede fallar sin reemplazar la pantalla completa.

## Verificación

- **550/550 pruebas Node/React**, cero fallos: `node --import tsx --test --test-concurrency=4 tests/*.test.mjs tests/*.test.tsx`. Incluyen llegadas por sentido, selección/cancelación, índice completo contra grafo, permisos/revocación, respuestas tardías, revisión/hash/caché, restauración de cámara/foco, origen canónico y navegación con catálogo/grafo tardíos. Se corrigió una carrera de prueba esperando la persistencia real de la foto antes de verificarla.
- **4/4 pruebas Python**, TypeScript y build de producción aprobados. Precarga final: **607 856 B (593.6 KiB)**, menor que 614 400 B; no se elevó el límite. Presupuestos JS/CSS y empaquetado aprobados por la suite.
- Inventario reproducible: 214 servicios, 194 mapas y 20 sin mapa (18 de autobús y L4/L6). Grafo y cobertura conservados. Documentación y enlaces locales verificados.
- Revisión web en 320/390/412 px y horizontal 844 × 390, sin desbordamiento del documento; selección manual, mapa de una variante, origen explícito, retorno y portal → app comprobados. Sin errores/avisos de consola en el recorrido. Capturas conservadas sólo localmente en `output/qa/inicio-contextual-2026-11-06/`, fuera de Git. La revisión automática rechazó su subida por posible contenido privado; se publica documentación sin imágenes. La hora de captura está fuera del servicio; se muestra apertura, sin inventar llegadas.
- Android `assembleDebug` y `lintDebug`: cero errores, siete advertencias preexistentes. APK final compilado desde **`0414d33`** con API local; 272 recursos idénticos a `dist`, firma v2 válida y sin sourcemaps. Instalación por `adb install -r`: **Success** y actividad iniciada; datos conservados.
- APK: **13 568 630 B**, SHA-256 `d9ba0dc393f3fa3c66bf261d8540cf3b3e1b9d0f86829c6cf3559298afe823c8`. Generado el 6 de noviembre a las 02:08 de Monterrey; detalles reproducibles en `output/android/build-info.json` (archivo privado local, fuera de Git).

Las pruebas DOM y el arranque instalado no acreditan fluidez física, consumo de batería, TalkBack, cámara OEM ni exactitud del GPS. No se modifica la cuenta administrativa, MFA o base privada. El servidor local está activo en 4173 y el túnel USB queda preparado; no se ha desplegado a Internet.

## Probar y actualizar

Desde la raíz del repositorio, con el celular autorizado por USB:

```sh
./regiomovil build
./regiomovil start
```

En otra terminal:

```sh
./regiomovil android --dev-local-api --offline
adb reverse tcp:4173 tcp:4173
adb install -r output/android/regiomovil-debug.apk
adb shell am start -n mx.regiomovil.app/.MainActivity
```

La opción `--offline` requiere dependencias Gradle ya descargadas; quitarla para la primera compilación. El túnel ADB requiere conservar USB y servidor activos. `install -r` actualiza conservando datos. El APK usa bundle propio y la API local para pruebas; no es una publicación de producción. Web: `http://localhost:4173/?page=home`; evaluación: `/acceso.html`; administración: `/admin`, con cuenta y TOTP existentes.

Recorrido: Metro → círculo → buscar variante de autobús → confirmar → elegir parada → mapa/Planear/Reportar. Probar cancelar la selección, regresar desde Red/Planear y continuar borrador. Cerca de mí requiere permiso del usuario; no equivale a seguimiento de unidades.

## Siguiente interacción

1. Leer este registro y `git status`; conservar la rama y los PR apilados. No rehacer I1–I6 ni dar por autorizada una fusión a `main`.
2. Completar QA física: ubicación precisa/aproximada/denegada/revocada, cámara/galería/archivos y cancelación, TalkBack, texto ampliado, rotación y diez ciclos Inicio–Red–Planear. Medir memoria y fluidez en un teléfono económico.
3. Revisar con el usuario el resultado visual y las dos direcciones Metro durante horario de servicio. Mantener origen/destino explícitos y avisos de simulación.
4. Continuar P3 sólo con fuentes verificables; P6/P7, hosting/operación y revisión OWASP independiente conservan sus criterios. P10 requiere metodología y datos reales antes de publicar calificaciones.
