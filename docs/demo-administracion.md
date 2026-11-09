# Demostración aislada del mapa administrativo

P6/P7, 31 de octubre de 2026. Usa geografía del catálogo y **observaciones ficticias**, nunca cuentas, fotos o reportes reales. El generador crea una base nueva, identidad administrativa separada y configuración privada en un directorio explícito; no sobrescribe destinos ni admite `.data`, sus alias o el `DATABASE_PATH` configurado como destino.

Desde la raíz, con Node 24 y dependencias instaladas:

```sh
pnpm build
demo_dir="/tmp/regiomovil-admin-demo-prueba-$(date +%s)"
pnpm admin:demo --directory "$demo_dir" --seed regiomovil-31
node --env-file="$demo_dir/demo.env" scripts/admin-user.mjs create demo@example.org admin "Revisión de demostración"
node --env-file="$demo_dir/demo.env" server/index.mjs
```

La contraseña se introduce en la terminal interactiva y no se escribe como argumento. Abrir [administración demo](http://localhost:4180/admin), iniciar sesión con esa cuenta y completar TOTP con una aplicación autenticadora. No hay credenciales predeterminadas ni excepción de MFA. La configuración local sólo permite HTTP loopback y el puerto 4180; no es un despliegue público. Si ese puerto está ocupado, detener la demo anterior antes de repetir.

El generador escribe `manifest.json`, `reports.sqlite`, `demo.env` y después la CLI crea `identity.sqlite`. Directorio `0700`, configuración/manifiesto `0600`; mantenerlos fuera de Git. No publicar el archivo de entorno ni códigos de recuperación. `--date ISO` fija el reloj de generación para pruebas; una fecha antigua puede activar la purga de retención al iniciar el servidor. Para probar hoy, omitirla.

| Conteo esperado | Valor |
| --- | ---: |
| Total | 240 |
| Publicados abiertos | 120 |
| Resueltos | 40 |
| Pendientes | 50 |
| Rechazados | 30 |
| Aprobados incluyendo resueltos | 160 |
| Aprobados por entidad | 80 estación / 60 ruta / 20 unidad |

La semilla reproduce distribución, categorías y contextos; UUIDs y claves de cuenta se generan normalmente. Hay concentraciones deliberadas, referencias de unidad repetidas y una ruta sin geometría si existe en el catálogo. Las estaciones se ubican por catálogo; las rutas/unidades carecen de punto observado. El rótulo «Demostración · datos sintéticos» permanece en el panel y el mapa, también al revisar expedientes.

## Comprobación manual

1. En «Dónde mejorar la red», estado inicial: 120 abiertos. Incluir resueltos: 160; estados privados no aparecen en el mapa.
2. Cambiar categoría, tipo y periodo; aplicar y comparar indicadores con la lista de grupos. Limpiar filtros amplía las opciones de estación/ruta.
3. Tocar una estación muestra el mismo grupo seleccionado en la lista; elegir una ruta carga sólo su trazo. Una unidad no recibe un pin ficticio.
4. Revisar un pendiente desde la bandeja; las decisiones requieren motivo/confirmación y actualizan indicadores. Después de moderar, los conteos dejan de coincidir con el manifiesto inicial.
5. Para repetir desde cero, detener este servidor con Ctrl+C y generar **otro directorio nuevo**. No borrar bases reales para restaurar la demo.

Pruebas automáticas: [agregación/aislamiento y 5.000 reportes](../tests/report-map.test.mjs), [MFA/roles](../tests/admin-backend.test.mjs), [filtros/cancelación de interfaz](../tests/admin-report-map.test.tsx). El fixture no acredita operación real ni rendimiento del teléfono.

## Corpus comunitario ampliado · 8 de noviembre

`--profile community` genera 1,200 registros y conserva el perfil original al omitir esa opción. Hay 1,020 públicos, 120 pendientes y 60 rechazados; distribución por los 209 recorridos de autobús y 38 estaciones. Los focos son Félix U. Gómez/L3 y TM San Bernabé–No Reelección. Textos naturales sin rótulos individuales; procedencia sintética persistente y visible en el entorno. El manifiesto incorpora hash y conteos. No sobrescribe destinos ni cambia la base real.

Consultar [entrega, ruta persistente y comandos](ENTREGA_UI_REPORTES_2026-11-08.md). Usar el `demo.env` generado mantiene identidad separada; la sesión de visualización de 4173 descrita allí conserva la identidad administrativa local y cambia únicamente la base de reportes mediante variable del proceso.
