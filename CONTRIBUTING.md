# Contribuir a RegioMóvil

El piloto distingue datos publicados, simulaciones, observaciones comunitarias y hechos verificados. Empezar por la [documentación](docs/README.md) y la [hoja de ruta](docs/hoja-de-ruta.md).

## Entorno

Usar Node 24+ y pnpm 11.25.0. Desde la raíz:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm start` carga `.env`; el servidor hijo de `pnpm dev` usa variables exportadas en la terminal. Vite carga sus variables según el modo. `.env.example` contiene referencias, nunca credenciales. Todo valor `VITE_` puede terminar en el cliente: no usarlo para secretos.

Las pruebas deben usar SQLite temporal y fotos sintéticas, sin reutilizar reportes del servidor ni enviar observaciones reales. La navegación puede consultar Photon/teselas externas; revisar las guías de lugares antes de modificar proveedores.

## Cambios revisables

1. Crear una rama desde la base acordada, con prefijo `codex/` o `feature/` según el trabajo. Mantener una finalidad clara por PR.
2. Describir problema, resultado y criterios de aceptación; enlazar anotaciones o prioridad de la hoja de ruta.
3. Hacer cambios acotados; separar refactorizaciones amplias de cambios de comportamiento. Actualizar contrato y especificación cuando corresponda.
4. Ejecutar controles pertinentes y revisar el diff, incluidos archivos generados. No atribuir a una revisión pruebas hechas sobre otra.
5. Presentar evidencia y pendientes en la PR. Un push no actualiza el servidor ni el APK instalado; seguir el procedimiento de publicación.

## Controles

```sh
pnpm docs:check
pnpm build
pnpm test
node scripts/prepare-coverage-inventory.mjs --check
```

Si se modifica el importador:

```sh
python3 -m unittest discover -s tests -p '*_test.py'
```

CI ejecuta documentación, build, pruebas Node/React, inventario e importador Python. Android, revisión visual, lectores de pantalla y mediciones físicas se verifican por separado según alcance. Para cambios sólo documentales, comprobar enlaces y contrastar afirmaciones con código suele ser suficiente; no añadir tests que repliquen texto.

## Criterios por área

- **Interfaz:** teclado/foco, móvil/escritorio, tema oscuro y estado sin conexión cuando aplique. No usar sólo color para distinguir estados.
- **API/reportes:** validación, idempotencia, límites, privacidad, moderación y compatibilidad con clientes previos. Ejemplos sin datos personales.
- **Rutas:** identidad exacta de variante, fuente fechada, derechos de reutilización, hashes y segmentos separados. No fabricar paradas, sentidos ni geometría. Regenerar artefactos mediante scripts.
- **Algoritmos/rendimiento:** escenarios reproducibles y límites de búsqueda/memoria. Las métricas sintéticas no describen precisión real. Mantener los presupuestos de `tests/performance.test.mjs`.
- **Seguridad:** amenaza, control y prueba negativa pertinente. Consultar [SECURITY.md](SECURITY.md) antes de divulgar hallazgos sensibles.

## Pull requests y entregas

Explicar problema y resultado, alcance, validación (comando, resultado y entorno), impacto en datos/contratos y limitaciones. Adjuntar capturas sin información personal si cambia la interfaz. Para migración o despliegue, indicar respaldo, compatibilidad y recuperación.

No incorporar `.env`, bases/respaldos, fotos privadas, APK, llaves de firma ni logs de usuarios. Resolver las [condiciones de licencia](docs/licencias-y-datos.md) antes de redistribuir; ausencia de licencia general no equivale a permiso de reutilización.
