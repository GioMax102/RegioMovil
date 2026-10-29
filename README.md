# RegioMóvil

**Tu ciudad, a tu ritmo.** Iniciativa social para consultar transporte público de Nuevo León, explorar trayectos y compartir observaciones sobre estaciones, recorridos y unidades.

Este repositorio contiene un piloto funcional para web/PWA, Android y pantallas de parada. La planificación es experimental: **arribos, duración, afluencia y condiciones de unidades son simulados**. No hay conexión con GPS de operadores, pagos ni atención institucional de reportes.

## Documentación para evaluar el proyecto

| Documento                                                | Contenido                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Especificación técnica](docs/especificacion-tecnica.md) | Arquitectura, servidor, almacenamiento, algoritmos, configuración y límites. |
| [Contrato de API](docs/api.md)                           | Endpoints, entradas, respuestas, errores y ejemplos.                         |
| [Propuesta social](docs/propuesta-social.md)             | Problema, aportación, participación comunitaria e indicadores de impacto.    |
| [Pitch](docs/pitch.md)                                   | Presentación breve para personas y organizaciones interesadas.               |
| [Seguridad y operación](docs/seguridad-y-operacion.md)   | Controles existentes, riesgos, revisión OWASP y plan de monitoreo.           |
| [Hoja de ruta](docs/hoja-de-ruta.md)                     | Prioridades, dependencias y criterios de aceptación.                         |
| [Guía de revisión técnica](docs/revision-tecnica.md)     | Recorrido de evaluación y evidencia para un equipo técnico.                  |

El [índice documental](docs/README.md) distingue referencias vigentes, guías especializadas y registros históricos. Las cifras de una entrega anterior no acreditan el estado actual.

## Inicio rápido

Requisitos: **Node.js 24 o posterior y pnpm 11.25.0**, fijado en `package.json`. Usar el lockfile del repositorio.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Abrir [http://localhost:5173](http://localhost:5173). Vite redirige `/api` al servidor de `127.0.0.1:3001`. El modo de desarrollo escucha la web en todas las interfaces; utilizarlo en una red de confianza. Para ejecutar la compilación con un solo servidor:

```sh
pnpm build
pnpm start
```

Abrir [http://127.0.0.1:3001](http://127.0.0.1:3001). `pnpm start` lee `.env` si existe; copiar [.env.example](.env.example) cuando se necesite configurar puertos, CORS, proveedores de lugares o persistencia. Sin configuración se usa `.data/regiomovil.sqlite`, que contiene reportes privados y queda fuera de Git. El proceso API de `pnpm dev` usa las variables exportadas en la terminal, sin cargar `.env` automáticamente.

El lanzador `./regiomovil dev|build|start|test` admite las mismas tareas y puede localizar el Node 24 del entorno de Codex. En otros equipos se recomienda instalar los requisitos anteriores; ese runtime local no se distribuye con el proyecto.

## Qué está disponible

- Catálogo, fuentes y mapas de redes, estaciones de Metro y rutas.
- Planificación local en un Web Worker, alternativas multimodales y guía por etapas en primer plano.
- Viajes guardados y paquetes para consulta sin conexión, sujetos a descarga y almacenamiento disponibles.
- Observaciones con título, descripción y fotografía desde cámara, galería o archivos; recuperación de borrador y envío con idempotencia.
- Publicación contextual con consentimiento y revisión humana mediante una herramienta de terminal del servidor.
- Preferencias de apariencia y accesibilidad; modo de parada: `/?kiosk=1&locked=1&station=padre-mier`.

Inventario local revisado el **29 de octubre de 2026**: **214 servicios**, de ellos **209 de autobús**; **191 autobuses y 3 líneas de Metro** tienen geometría en el grafo experimental, con **10 806 puntos identificados por ruta**. Hay 38 estaciones únicas de Metro. Permanecen 18 autobuses sin geometría suficiente; L4 y L6 quedan fuera del grafo según el estado fechado de las fuentes. Estas cifras describen archivos del repositorio, no operación en vivo ni paradas verificadas en campo. El [inventario estructurado](data/route-coverage-inventory.json) identifica cada variante.

## Comandos de trabajo

| Comando                                                | Propósito                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `pnpm build`                                           | Compilar TypeScript, regenerar catálogo/grafo y producir `dist/`. No descarga fuentes nuevas. |
| `pnpm test`                                            | Pruebas Node/React; algunas requieren sockets de loopback.                                    |
| `pnpm docs:check`                                      | Comprobar enlaces locales e integridad básica de documentación.                               |
| `node scripts/prepare-coverage-inventory.mjs --check`  | Contrastar inventario y artefactos actuales.                                                  |
| `python3 -m unittest discover -s tests -p '*_test.py'` | Verificar el importador; Python es opcional para el uso ordinario.                            |
| `pnpm model:train`                                     | Regenerar modelos sintéticos; revisar los cambios antes de incorporarlos.                     |
| `pnpm android:build`                                   | Compilar APK debug; requiere JDK 21 y Android SDK 36.                                         |
| `./regiomovil prepare-release`                         | Preparar artefactos revisables; no despliega.                                                 |

Para Android con API remota, configurar `VITE_API_BASE_URL` con HTTPS **antes de compilar** y permitir `https://localhost` en el CORS del servidor. Sin API accesible no funcionan envíos de reportes ni consultas de lugares en línea. La [guía Android](docs/android.md) explica instalación y pruebas por USB; la [guía de publicación](docs/publicacion.md) conserva el procedimiento y antecedentes de despliegue, que deben verificarse en los proveedores antes de publicar otra versión.

## Estructura

```text
src/        Interfaz, mapas, worker de movilidad y almacenamiento del dispositivo
server/     API HTTP Node, dominio, geocodificación y almacenamiento SQLite
data/      Catálogos, grafo generado y auditorías de procedencia
models/     Modelos entrenados con datos sintéticos y documentación
public/     Recursos públicos, paquetes de rutas y política de privacidad
android/    Proyecto nativo Capacitor
scripts/    Generación, importación, moderación, compilación y publicación
tests/      Contratos, regresiones, seguridad y presupuestos de recursos
docs/       Especificaciones, guías y evidencia histórica
```

## Preparación para operación pública

Faltan una evaluación de seguridad con alcance y evidencia OWASP, monitoreo de servidor, respaldo y restauración ensayados, administración web autenticada, validación de rendimiento en dispositivos y revisión sostenida de reportes. Prometheus, Grafana y visión computacional son propuestas; **no están instalados ni integrados**. La [hoja de ruta](docs/hoja-de-ruta.md) define cómo avanzar.

Para contribuir o revisar cambios: [CONTRIBUTING.md](CONTRIBUTING.md). Para comunicar vulnerabilidades: [SECURITY.md](SECURITY.md). Revisar las [licencias y datos](docs/licencias-y-datos.md) antes de redistribuir. No existe todavía una licencia general del código propio; el repositorio no concede por sí solo una licencia de código abierto.
