# Ampliación de Metrorrey

Consulta: **15 de octubre de 2026**, `America/Monterrey`.

`data/network-expansion.json` incorpora información de las futuras líneas 4 y 6. El [boletín oficial del 12 de octubre de 2026](https://nl.gob.mx/es/boletines/muy-pronto-nuevo-leon-estrenara-el-nuevo-metro-samuel-garcia) todavía describe construcción y pruebas pendientes; señala que la inauguración se anunciará después. Por ello ambas conservan `status: "construction"` y `planningEligible: false`. No se convierten promesas de apertura anteriores en disponibilidad de servicio.

El [mapa de red de abril de 2026 de Metrorrey](https://www.metrorrey.mx/_files/ugd/f8686c_91419c4d7b504f9fab01aefc6a87412a.pdf) se inspeccionó visualmente. Aporta siete referencias de estación en L4 y quince en L6, incluida su extensión a Aeropuerto. Esos conteos describen lo dibujado, no certifican totales contractuales ni estaciones abiertas. Los nombres y su orden están transcritos en el JSON; los municipios describen el corredor esquemático. La precisión de fecha del mapa es mensual.

No se asignan coordenadas a estaciones futuras a partir de un plano esquemático. `routeGeometryVerified: false` impide interpretar la lista como un recorrido geográfico levantado. La futura Parque Fundidora de L6 conserva su nombre; no se sustituye por Arena Monterrey de L1. Ginecología aparece en ambos corredores y no crea una conexión utilizable.

La [comunicación oficial del 26 de febrero de 2025](https://www.nl.gob.mx/es/boletines/con-mas-frentes-de-trabajo-en-las-lineas-4-y-6-se-garantiza-la-conclusion-del-metro) describe la propuesta denominada Línea 5 como Transmetro hacia La Estanzuela. No se incorpora como Metro ni se inventa una secuencia de paradas. La ficha histórica que aún agrupa proyectos 4, 5 y 6 no basta para atribuir operación actual o un trazado ferroviario vigente a L5.

Para habilitar una ampliación en el planificador se necesita un aviso oficial de servicio al público, catálogo verificable de estaciones y coordenadas, conexiones confirmadas y revisión de la vigencia. Cambiar únicamente `planningEligible` no satisface esos requisitos.
