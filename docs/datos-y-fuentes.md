# Datos regionales y procedencia

Consulta de fuentes: **15 de octubre de 2026**, zona horaria `America/Monterrey`.

`data/network.json` contiene un catálogo verificable para el prototipo de RegioMovil. La red describe estaciones y conexiones; no certifica que una estación esté abierta ni que el servicio opere normalmente en este momento.

## Qué se usa como información real

- Coordenadas publicadas por STC Metrorrey en el catálogo estatal, con corte de septiembre de 2025. Se convirtieron de grados, minutos y segundos a latitud/longitud decimal, con oeste negativo.
- Nombres y orden de estaciones de las líneas 1, 2 y 3 contrastados con el mapa oficial de abril de 2026.
- Correspondencias: Cuauhtémoc entre L1 y L2; Félix U. Gómez entre L1 y L3. La guía turística oficial describe la continuidad L2–L3 en Zaragoza sin necesidad de descender: `throughServices` permite que el planificador evite presentarla como un transbordo obligatorio.
- Destinos regionales documentados por Turismo NL y UANL. Cada elemento de `places` tiene `coordinateRole: "station-anchor"`: sus coordenadas son las de la estación asociada, no las del edificio ni de su acceso. Sirven como atajos de búsqueda por destino. El prototipo no calcula el recorrido peatonal final.

### Conteo de estaciones

El CSV oficial contiene **38 ubicaciones únicas**. La cifra institucional de 40 corresponde a 19 estaciones de L1, 13 de L2 y 8 de L3, contando las correspondencias en cada línea y sin sumar Zaragoza otra vez a L3. El grafo del prototipo incluye Zaragoza al principio de L3 para expresar la continuidad: por eso sus listas tienen 19, 13 y 9 referencias, respectivamente, que apuntan a los mismos 38 nodos únicos. No se agregaron estaciones para forzar un total de 40 ubicaciones.

### Normalización y discrepancias

- Se corrigió la errata `Cuahuctemoc` del CSV a **Cuauhtémoc**.
- El CSV etiqueta a Félix U. Gómez como transferencia L1/L2. El mapa oficial permite corregir su membresía a **L1/L3**.
- El CSV llama **Parque Fundidora** a la estación que el mapa de abril de 2026 denomina **Arena Monterrey**. Se conserva el ID estable `fundidora` y los alias de búsqueda `Parque Fundidora` y `Fundidora`. No debe confundirse con la estación Parque Fundidora dibujada en la futura L6.
- Los municipios se contrastan con el mapa, el directorio histórico de ubicaciones del Gobierno estatal y los anexos de infraestructura para Hospital Metropolitano. Son etiquetas de localización; no describen la cobertura completa de cada estación.
- Los colores de línea se obtuvieron del mapa: L1 `#F9B12C`, L2 `#44BB62`, L3 `#ED1C24`. Deben acompañarse del número y nombre de línea; el color por sí solo no transmite toda la información.

Las coordenadas originales tienen precisión de un segundo de arco, aproximadamente decenas de metros. El redondeo a seis decimales facilita el cálculo y **no añade precisión**. Los puntos no identifican banquetas, rampas, elevadores o accesos seguros. La aplicación debe solicitar confirmación de estación cuando la posición del dispositivo sea imprecisa.

## Operación, tarifa y pagos

La página oficial de Metrorrey consultada indica operación general del Metro de **05:00 a 00:30**, con acceso desde las 04:45. Expresa excepciones: 24 y 31 de diciembre el servicio termina a las 23:00; 25 de diciembre y 1 de enero empieza a las 07:00. Son horarios de servicio, no horarios de llegada por estación.

La imagen de tarifa enlazada en ese sitio muestra **$9.90 MXN para Metro** en la fecha de consulta. Es una referencia fechada que debe actualizarse; no se extrapolan reglas tarifarias, descuentos ni costos de rutas urbanas. La guía turística advierte ajustes mensuales y remite al sitio de Metrorrey.

El prototipo enlaza a **Urbani** y a atención ciudadana del **Instituto de Movilidad y Accesibilidad**. No está afiliado a estos servicios, no accede a saldos y no emite un QR de transporte. Un QR de demostración nunca debe presentarse como boleto válido.

## Qué permanece desconocido o simulado

`accessibility: "unknown"` significa **accesibilidad operativa sin verificar**. El sitio institucional enumera estaciones con elevadores y/o escaleras eléctricas, pero no ofrece en esa lista un estado operativo verificable en tiempo real. Se evita convertir la presencia nominal de infraestructura en una garantía de acceso.

El catálogo no aporta GPS de unidades, aforo actual, estado del aire acondicionado, limpieza, fallas, tiempos de llegada ni incidencias vigentes. Los valores de afluencia, condiciones, predicción o ETA creados por el sistema pertenecen a un **escenario simulado**, deben permanecer rotulados así y no constituyen una predicción validada del servicio real.

Los indicadores mensuales públicos no equivalen a ocupación actual de una unidad. No se estimó ni atribuyó afluencia real a una estación a partir de datos inventados. Los reportes de usuarios, si se habilitan, son declaraciones pendientes de verificación, con antigüedad y alcance visibles.

Las líneas 4 y 6 figuran en construcción en el mapa utilizado y se excluyen del grafo. Este alcance deliberado no sustituye la revisión de avisos oficiales sobre ampliaciones, cierres u operativos. Tampoco se inventaron recorridos de rutas urbanas o Transmetro que no cuenten con un catálogo de paradas verificadas.

## Fuentes primarias

| ID | Fuente | Alcance |
| --- | --- | --- |
| `nl-paradas-2025` | [Paradas Oficiales STC Metrorrey](https://catalogodatos.nl.gob.mx/dataset/paradas-oficiales-stc-metrorrey) y [CSV original](https://catalogodatos.nl.gob.mx/dataset/74e80633-632c-4104-a84e-ce27f65802c4/resource/1606b958-185e-4dd9-b76e-29cf39f7c38b/download/2024_2025_paradas_stcm.csv) | Coordenadas, nombres al corte de septiembre de 2025. El portal no especifica una licencia propia para este conjunto. |
| `metrorrey-mapa-2026` | [Mapa de Red oficial, abril de 2026](https://www.metrorrey.mx/_files/ugd/f8686c_91419c4d7b504f9fab01aefc6a87412a.pdf) | Nombres, colores, orden y conexiones. |
| `metrorrey-servicio` | [Metrorrey](https://www.metrorrey.mx/) | Horarios generales, avisos y medios de pago. |
| `metrorrey-tarifa-2026` | [Imagen de tarifa enlazada por Metrorrey](https://static.wixstatic.com/media/f8686c_2da39eabac874445986cbf9f59968fcd~mv2.png) | Referencia de $9.90 MXN consultada el 15 de octubre de 2026. |
| `nl-guia-turistica-2025` | [Guía turística Metrorrey, Turismo NL](https://www.nl.gob.mx/sites/default/files/repositorio/Dependencias/Secretar%C3%ADa%20de%20Turismo/Micrositios/Guia_Sostenibilidad/20251113_guia_turistica_metrorrey.pdf) | Destinos y continuidad L2–L3 por Zaragoza. |
| `uanl-transporte-2023` | [UANL: Transporte público en Ciudad Universitaria](https://www.uanl.mx/wp-content/uploads/2023/03/Mesa-12-anexo.pdf) | Conexión del campus con estaciones de L2. |
| `nl-direcciones` | [Directorio histórico de ubicaciones del Gobierno estatal](https://subasta.nl.gob.mx/docs/2_935.pdf) | Contraste de municipios de L1 y L2. |
| `nl-infraestructura` | [Tercer informe: anexo estadístico de infraestructura](https://www.nl.gob.mx/sites/default/files/migrate-files/3er_informe_2015-2021_anexo_estadistico_.pdf) | Municipio de la estación Hospital Metropolitano. |
| `urbani` | [Urbani](https://www.urbani.com.mx/) | Información externa del proveedor de pago y recargas. |
| `nl-muevo-leon` | [IMA: Atención ciudadana](https://www.imanuevoleon.mx/atencionciudadana) | Medios de pago y atención de movilidad en Nuevo León. |

## Actualización y paso a operación real

Para actualizar la red se debe descargar una versión fechada del catálogo, contrastar los cambios con el mapa oficial, verificar coordenadas y correspondencias y documentar las discrepancias. Debe conservarse un historial de cambios y la fecha de consulta. Los nodos de transferencia mantienen un ID compartido.

Una futura integración operativa necesita autorización y un contrato de datos del proveedor: identificador de unidad/ruta, ubicación y marca de tiempo, ocupación y su método de medición, condiciones y vigencia, incidencias confirmadas y disponibilidad de equipos de accesibilidad. El backend debe distinguir observación, reporte, estimación y dato vencido; al perder la señal debe mostrar que la información está desactualizada.
