# Preparación de publicación · 19 de octubre de 2026

La candidata **1.1.0**, Android **versionCode 2**, se prepara en `fixes`. Este procedimiento no hace merge, push ni publica por sí mismo. [Notas de la versión](releases/1.1.0.md).

## Publicación anterior documentada

- Aplicación: https://regiomovil.pages.dev/
- Enlace para compartir: https://regiomovil.pages.dev/acceso.html
- Privacidad: https://regiomovil.pages.dev/privacidad.html
- API: https://regiomovil-api.onrender.com/api/health
- Piloto anterior: https://github.com/GioMax102/RegioMovil/releases/tag/v1.0.0-piloto
- Descarga estable para siguientes versiones: https://github.com/GioMax102/RegioMovil/releases/latest

Según la configuración documentada del piloto del 18 de octubre, Pages recibe cargas directas y **no** está integrado con GitHub. Render construye el Dockerfile de la rama `codex/movilidad-multimodal`, servicio `regiomovil-api`, instancia Free. Es necesario confirmar los ajustes actuales en ambos paneles antes de actualizar; cambiar Git no demuestra un despliegue. No se han vuelto a verificar aquí sesiones, permisos ni configuración de esas cuentas.

## Preparar un paquete revisable

Requisitos: Node 24+, pnpm 11.25.0, JDK 21, Android SDK 36 y Python 3 estándar para crear el ZIP. No se necesitan claves de mapas, un dominio de pago ni una base de datos de pago.

1. Dejar los cambios finales en un commit de `fixes`. El APK y el paquete anotan ese commit. Revisar `git status`; no distribuir una mezcla de archivos de distintas revisiones.
2. Ejecutar, **en secuencia** y sin otra compilación que reemplace `dist`:

```sh
VITE_API_BASE_URL=https://regiomovil-api.onrender.com ./regiomovil build
./regiomovil test
VITE_API_BASE_URL=https://regiomovil-api.onrender.com ./regiomovil android --release --offline
./regiomovil prepare-release
```

`--offline` sólo reutiliza dependencias Gradle ya instaladas; retirarlo si faltan. El release reconstruye siempre la web, no acepta `--skip-web` ni API HTTP. Compilar Android Lint por separado antes de aprobar la entrega:

```sh
cd android
./gradlew :app:lintRelease --no-daemon --max-workers=2 --offline
```

El lanzador de Android localiza JDK/SDK; la llamada directa a Gradle necesita `JAVA_HOME`/`ANDROID_HOME` válidos en esa terminal.

3. Inspeccionar `output/publicacion/1.1.0/`:

| Archivo                 | Uso                                                            |
| ----------------------- | -------------------------------------------------------------- |
| `regiomovil-web.zip`    | Carga directa en Pages; contiene `index.html` en la raíz.      |
| `regiomovil.apk`        | Distribución Android con la firma de publicación existente.    |
| `NOTAS.md`              | Descripción y límites para la release.                         |
| `release-manifest.json` | Versión real, versionCode, commit, API, recursos web y hashes. |
| `SHA256SUMS.txt`        | Integridad de ZIP, APK, notas y manifiesto.                    |

El empaquetador exige un árbol Git limpio, metadatos release de la revisión actual, la API HTTPS pública y coincidencia exacta entre `dist` y los recursos del APK. Rechaza enlaces simbólicos, archivos ocultos y extensiones ajenas a recursos públicos. El ZIP usa orden, permisos y fechas fijos; el mismo contenido produce el mismo ZIP con la misma versión de Python/zlib. No incorpora repositorio, `.env`, datos privados, llaves ni metadatos locales de firma.

Los metadatos Android se conservan por variante en `output/android/regiomovil.json` y `regiomovil-debug.json`; `build-info.json` sigue describiendo la última compilación para compatibilidad. No usar el debug con `http://localhost:4173` ni el ZIP antiguo del piloto como entregables de esta actualización. El script se detiene si ya existe el directorio de versión para evitar reemplazar una entrega revisada por accidente.

## Conservar la firma

Respaldar de forma privada `output/android/signing/regiomovil-release.jks` y `store-password.txt`, juntos y fuera del repositorio. No subirlos a Pages, Releases, issues ni al chat. El script reutiliza la llave; si hay un APK de publicación y falta su llave, se detiene para no generar una identidad distinta.

Antes de sustituir el piloto, comparar la huella pública del certificado de ambos APK con `apksigner verify --print-certs`. Esa huella no es la contraseña. La versión 1.1.0 debe conservar `mx.regiomovil.app`, la misma firma y un `versionCode` mayor que el ya distribuido. Si el panel o el APK publicado revela un código superior a 1, ajustar la candidata antes de compilar.

## Merge y actualización posterior

Estos pasos requieren la solicitud de publicación correspondiente. Mantener disponible la revisión y los artefactos anteriores para regresar a una versión funcional.

1. Actualizar referencias remotas y comprobar qué cambios tiene `main`; el estado de una referencia local no acredita el remoto. Revisar la PR de `fixes` hacia `main` y que los checks hayan aprobado. CI ejecuta build y pruebas en Node 24; Android Lint/firma se validan por separado. No hacer force push.
2. Integrar la revisión aprobada. Si el merge crea otro commit, reconstruir y empaquetar desde ese commit en `main`: el manifiesto debe identificar la revisión publicada. No reutilizar un APK de un commit diferente presentándolo como si fuera del merge.
3. En Render, confirmar CORS y las variables, cambiar la rama de despliegue a `main` y desplegar ese commit. Esperar un health check correcto. La web anterior debe seguir funcionando con la API nueva; probar `/api/health`, carga de red y sugerencias antes de continuar.
4. CORS debe incluir al menos `https://regiomovil.pages.dev` y `https://localhost` para Android. Conservar sólo los orígenes de prueba que realmente se utilicen, sin `*`. No añadir credenciales al cliente. El Dockerfile usa Node 24 y escucha en `HOST=0.0.0.0` y el puerto de Render.
5. En Pages, crear una implementación de producción mediante carga directa y subir **sólo** `regiomovil-web.zip`. Comprobar HTTPS, `_headers`, CSP, service worker y acceso a `acceso.html`. La CSP permite la API HTTPS actual y los tiles OSM; si cambia el dominio de API, actualizar también CSP y reconstruir Android y web.
6. En GitHub crear la release estable `v1.1.0` desde el commit aprobado y adjuntar APK, hash/manifiesto y notas. Comparar la firma con el piloto y probar actualización sobre una instalación previa. Marcarla como última versión estable para que el enlace `/releases/latest` lleve al APK nuevo. No prometer Google Play: la distribución sigue siendo directa.
7. Probar la web publicada desde una sesión nueva y una PWA anterior: entrar a **Red de transporte**, filtrar sistemas, abrir mapas, planear lugares reales, guardar y guiar con controles manuales. Verificar respuesta offline después de completar la descarga y restauración al volver a conectar. Probar Android con permisos denegados y concedidos; GPS, TalkBack y conservación de guardados requieren un teléfono físico.

## Volver a la versión anterior

Si falla la candidata, detener su distribución y restaurar la implementación anterior de Pages. Regresar Render al commit compatible anterior si el problema está en la API; conservar la API nueva mientras se comprueba el frontend anterior cuando sea compatible. Dejar la release previa como última estable y documentar el incidente.

Android no permite volver a un `versionCode` menor como actualización normal. Distribuir una corrección firmada con la misma llave y un código **mayor**, incluso si reutiliza el comportamiento anterior. Desinstalar puede borrar guardados locales; no recomendarlo como rollback automático.

## Límites gratuitos y validación pendiente

- Render puede entrar en reposo; la primera búsqueda puede tardar cerca de un minuto. La búsqueda es cancelable y la planificación descargada continúa en el dispositivo.
- SQLite no tiene persistencia garantizada en el servicio gratuito. Los guardados pertenecen al dispositivo y no constituyen respaldo en la nube.
- Photon público tiene capacidad compartida y cobertura incompleta. No se garantiza escala masiva gratuita ni equivalencia de cobertura con Google Maps.
- Arribos, duración, afluencia y condiciones de unidades son simulados. La guía no promete ejecución ni avisos en segundo plano.
- Los checks y hashes definitivos deben tomarse de la candidata final. Las cifras de pruebas y APK del piloto del 18 de octubre no validan la actualización.
