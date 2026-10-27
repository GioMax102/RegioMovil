# Quejas comunitarias de infraestructura y unidades

La funcionalidad recoge título, descripción, categoría y una foto opcional. Cada reporte identifica una estación de Metro, una ruta y variante exactas, o una unidad de esa ruta. Las fallas de parada o recorrido pueden incluir un cruce o referencia del lugar; la referencia no se convierte en una estación ni en coordenadas verificadas.

El número económico es un campo independiente. Los códigos repetidos del catálogo nunca se usan para adivinar una variante. Al cambiar de estación a unidad tampoco se adjunta automáticamente la estación que estaba abierta en la aplicación.

## Publicación y revisión

Los reportes nuevos quedan privados en estado `pending`. El consentimiento para publicación es opcional: sin él se puede enviar el reporte, pero no publicarlo. El texto y la fotografía se muestran en la estación o ruta correspondiente sólo después de una revisión humana de contenido. Esta revisión no acredita que la falla esté verificada en campo.

Estados:

- `pending`: privado, por revisar.
- `published`: público, problema abierto.
- `resolved`: público, marcado como resuelto por la persona revisora; se separa del recuento abierto.
- `rejected`: privado. Retirar una publicación la devuelve a `pending`.

Las fotografías se reducen en el dispositivo a JPEG de hasta 400 KB. El servidor valida la estructura del archivo y elimina metadatos antes de guardarlo. La publicación de una foto sigue la misma política, consentimiento, estado y caducidad que el texto. El endpoint de fotos usa `no-store`; los reportes no entran en el caché offline ni en el precache de la app.

## Operación local

Se necesita Node 24 o posterior y acceso al archivo SQLite del servidor. `DATABASE_PATH` configura su ubicación; por defecto es `.data/regiomovil.sqlite`. El directorio y el archivo contienen información privada. Deben residir en almacenamiento persistente con respaldo si se opera un servidor público. La compilación del frontend no actualiza automáticamente el backend remoto.

La revisión se realiza desde una terminal del servidor. No existe una API pública que publique quejas.

```sh
node scripts/moderate-report.mjs .data/regiomovil.sqlite list --status pending
node scripts/moderate-report.mjs .data/regiomovil.sqlite show ID
node scripts/moderate-report.mjs .data/regiomovil.sqlite export-photo ID /ruta/privada/revision.jpg
node scripts/moderate-report.mjs .data/regiomovil.sqlite publish ID --reviewer "Nombre de revisión" --reviewed --note "Contenido y foto revisados"
node scripts/moderate-report.mjs .data/regiomovil.sqlite resolve ID --reviewer "Nombre de revisión" --note "Estado revisado en campo"
node scripts/moderate-report.mjs .data/regiomovil.sqlite unpublish ID --reviewer "Nombre de revisión" --note "Retirar mientras se revisa el contenido"
node scripts/moderate-report.mjs .data/regiomovil.sqlite summary --status public
```

`export-photo` crea una copia privada con permisos 0600 y rechaza sobrescribir archivos. Antes de publicar deben revisarse texto y foto: datos personales, rostros o placas, contenido abusivo, pertinencia y asociación al lugar correcto. `--reviewed` deja constancia de esa revisión. Las transiciones registran quién revisó, fecha y nota. `reject` permite rechazar un reporte pendiente.

La retención es de 90 días. El almacenamiento admite hasta 5000 reportes y 50 MB de fotos vigentes. Al agotarse la cuota se informa el error; no se elimina evidencia reciente para aceptar el siguiente reporte. La migración de la base es transaccional y conserva las observaciones antiguas como privadas cuando no tienen consentimiento o destino inequívoco.

## Valor público y uso para inversión

La visibilidad contextual permite reconocer problemas recurrentes mientras se consulta una estación o ruta y mostrar cuándo se marca una incidencia como resuelta. Los resúmenes separan problemas abiertos y resueltos por destino y categoría, lo que sirve para preparar inspecciones y justificar dónde reunir más evidencia.

Los conteos son de reportes, no de personas únicas, pasajeros afectados o fallas verificadas. La aplicación no tiene autenticación de pasajeros, deduplicación de incidentes ni aforo real: una ruta muy utilizada o con más usuarios de la app puede acumular más reportes sin tener peor infraestructura. Tampoco deben confundirse reportes resueltos con problemas vigentes.

La decisión de inversión requiere combinar esta señal con inspección física, gravedad, accesibilidad, población afectada, oferta de transporte y costos. Para una etapa pública de mayor escala quedan la revisión operativa sostenida, un canal de rectificación, identificación de duplicados y medición de representatividad. La aplicación muestra el origen comunitario y el estado de los reportes; no produce una clasificación automática de inversión.
