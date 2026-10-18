# Publicación del piloto · 18 de octubre de 2026

- Aplicación: https://regiomovil.pages.dev/
- Enlace para compartir: https://regiomovil.pages.dev/acceso.html
- Privacidad: https://regiomovil.pages.dev/privacidad.html
- API: https://regiomovil-api.onrender.com/api/health
- APK y QR: https://github.com/GioMax102/RegioMovil/releases/tag/v1.0.0-piloto

## Servicios gratuitos

Cloudflare Pages sirve `dist` mediante carga directa. El ZIP sólo incluye recursos públicos compilados. La integración GitHub no está conectada; publicar nuevos commits no actualiza Pages automáticamente. Crear una nueva implementación de producción desde el panel y subir el ZIP actualizado.

Render ejecuta el Dockerfile del repositorio público, rama `codex/movilidad-multimodal`, servicio `regiomovil-api`, instancia **Free** en Virginia. Health check `/api/health`. Confirmar desde el panel el despliegue más reciente al actualizar; la fuente pública no requiere conceder acceso privado a repositorios.

`CORS_ORIGINS=https://regiomovil.pages.dev,https://localhost,capacitor://localhost,http://localhost:4173,http://localhost:5173`

La web y Android se compilan con `VITE_API_BASE_URL=https://regiomovil-api.onrender.com`. El servidor no requiere secretos de búsqueda ni tarjeta de pago. No hay dominio de pago, disco persistente ni base de datos de pago.

## Actualizar web y APK

```sh
VITE_API_BASE_URL=https://regiomovil-api.onrender.com ./regiomovil build
VITE_API_BASE_URL=https://regiomovil-api.onrender.com ./regiomovil android --release
```

Empaquetar el contenido de `dist` en la raíz del ZIP para Pages. No cargar `.env`, repositorio completo, datos locales ni llaves. Los metadatos del APK están en `output/android/build-info.json`.

La primera compilación release crea `output/android/signing/regiomovil-release.jks` y `store-password.txt`. **Respaldar juntos en un lugar privado y seguro**: son necesarios para firmar futuras actualizaciones. No están en Git ni en las descargas públicas. El APK de publicación usa una firma distinta al APK debug; si Android informa conflicto con la versión de pruebas, respaldar los trayectos que interese conservar antes de desinstalar aquella versión. Aumentar `versionCode` para siguientes versiones.

## Límites del piloto

- Render entra en reposo tras inactividad; la primera consulta puede tardar cerca de un minuto. La búsqueda permite hasta 75 s, muestra un aviso tras 6 s y cancela consultas cuando cambia el texto o se cierra el selector. La planeación sobre la red descargada funciona en el dispositivo.
- Los reportes SQLite del servidor pueden perderse al reiniciar o entrar en reposo Render. Los trayectos guardados pertenecen al dispositivo. No se promete persistencia de reportes en este plan.
- Photon público tiene capacidad compartida y no garantiza disponibilidad ni cobertura de cada negocio. No se garantiza uso masivo ilimitado gratuito.
- Arribos, tiempos de viaje y afluencia son simulados y se identifican como tales.
- El APK firmado se distribuye directamente; no está publicado en Google Play. La instalación puede requerir autorización del navegador para instalar aplicaciones.

## Validación

170 pruebas del proyecto aprobadas. APK release optimizado con R8 y firma v2/v3 verificada; API HTTPS incorporada y ausencia de llaves dentro del APK comprobadas. API pública respondió 200 y CORS permitió Pages. Consulta real de «Venustiano Carranza» devolvió seis sugerencias Photon. En la web pública se calculó Las Estaciones → Tec de Monterrey con tres alternativas combinando Metro y Transmetro/RegioRuta. No se afirma una instalación de este APK release en un teléfono físico durante esta validación.
