# RegioMóvil · mejoras de usabilidad

Implementación en `fixes`, sobre React 19 + TypeScript + Capacitor 8. La web, API y APK públicos no se sustituyen en esta iteración.

## 1. Diseño, tarjetas y navegación

| Requerimiento            | Código e integración                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diferenciar los datos    | `src/components/Primitives.tsx` → `ArrivalCard` y `Occupancy`; `arrivalCard.css`. La llegada usa un intervalo visible, la afluencia tiene etiqueta propia y «aire acondicionado» evita confundirlo con clima meteorológico.                                                         |
| Inicio con jerarquía     | `HomeDashboard.tsx` y `homeDashboard.css`: llegada, pronóstico y accesos tienen superficies e iconos distintos. Se conservan los avisos de simulación.                                                                                                                              |
| Líneas de Metro visibles | `MetroStationBrowser.tsx` + CSS: filtros antes de la búsqueda, cabecera independiente del desplazamiento de resultados, objetivos de 44 px y selección con texto y marca además de color. `App` conserva filtros controlados para restablecerlos al abrir la estación desde Inicio. |
| Tema                     | `src/theme.css` centraliza las superficies y colores semánticos claros/oscuros. El verde conserva la identidad; azul y ámbar organizan la información. No se añadieron fuentes ni texturas de mapa de bits.                                                                         |
| Navegación               | `usePageFocus.ts`: al cambiar de pantalla restablece el desplazamiento y enfoca el título. No vuelve a enfocar al terminar una petición o al actualizar pronósticos. `SectionLoading.tsx` ofrece un estado intermedio sin porcentajes falsos.                                       |

La transición usa opacidad durante 180 ms, sin desplazar el contenedor con controles adhesivos. Los ajustes y `prefers-reduced-motion` la desactivan. Las etiquetas de navegación admiten salto de línea con texto ampliado.

Los pares semánticos del tema pasan el umbral de texto normal 4.5:1 de [WCAG 2.2, criterio 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). La prueba calcula luminancia sin redondear. Esto no equivale a certificar toda la aplicación ni sustituye TalkBack o pruebas con personas.

## 2. Ubicación y mapas

- `MobilityPlanner.tsx` reutiliza el adaptador de ubicación existente. «Usar mi ubicación actual» obtiene una posición puntual bajo permiso; no inicia seguimiento. Los errores conservan la búsqueda manual y cerrar el selector invalida respuestas tardías.
- `EndpointPicker.tsx` y `endpointMapSearch.css` muestran el único mapa de planeación dentro del selector. En escritorio se divide en dos paneles; en móvil el mapa queda encima de la búsqueda y los resultados tienen desplazamiento independiente.
- Las sugerencias actualizan una vista previa con marcador `?`. No sustituyen A/B ni confirman un extremo hasta elegir el resultado. `LocationMap.tsx` desactiva la inspección de estaciones en esa vista para no ofrecer acciones cuya ficha está oculta.
- Al elegir una sola ruta, se conservan todos los vértices de sus segmentos publicados. La vista general de múltiples rutas sigue simplificada para contener el coste. Los tramos separados no se unen con geometrías inventadas. `NetworkExplorer` informa esa discontinuidad.
- Sin conexión se mantienen estaciones/paradas oficiales y datos guardados; las búsquedas por internet y el GPS no sustituyen esos extremos.

Integración del mapa en el selector:

```tsx
<EndpointPicker
  onPreview={setSearchPreview}
  map={
    <LocationMap
      network={network}
      online={online}
      origin={originPoint}
      destination={destinationPoint}
      focus={searchPreview || mapFocus || destinationPoint || originPoint}
      preview={searchPreview}
      inspectStops={false}
    />
  }
  // Los callbacks de selección, permisos y cierre permanecen en el planificador.
/>
```

El fragmento ilustra los nuevos puntos de integración; las propiedades completas están en `MobilityPlanner.tsx`.

## 3. Reconocer una parada y preparar el pago

`StationStreetView.tsx` está integrado mediante divulgación progresiva en el detalle de estación y en la ficha de parada inspeccionada en el mapa. Se incluye una foto real de Talleres, de Omaaar, en dominio público, tomada en 2007: está rotulada como histórica y se sirve localmente en WebP de 62,516 bytes. No representa el estado actual ni se utiliza para otra parada. Autor, licencia, procedencia y hash están en `public/licenses/station-photos.json`.

Las demás paradas ofrecen una URL de Street View en Google Maps con coordenadas de la parada pública validadas dentro de la ZMM. No se consulta Google hasta pulsar el enlace ni se envía el GPS. No se añadió una API de pago o una clave al cliente. [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) permite esta integración sin clave; una vista incrustada mediante la [API Street View](https://developers.google.com/maps/documentation/streetview/usage-and-billing) requeriría configuración y facturación adicionales. La disponibilidad de imágenes de calle depende del proveedor.

```tsx
<StationStreetView station={currentStation} />
<StationStreetView station={busStop} kind="bus" />
```

`ServiceIdentity.tsx` separa la presentación de `src/data/serviceIdentity.ts`. Está en el detalle del catálogo y en «Unidad y pago» de cada etapa de transporte del trayecto. Sus chips abren un diálogo explicativo; cerrarlo conserva el detalle del viaje.

```tsx
<ServiceIdentity
  networkId={route.networkId}
  routeId={route.id}
  code={route.code}
  mode={route.mode}
  status={route.status}
/>
```

Se muestra el número/código publicado. La pintura del autobús no se deduce del color de una línea en el mapa. Hay una referencia verde documentada para el circuito Mederos–El Uro; el resto indica «Color por confirmar» cuando falta evidencia específica. No se asignan efectivo o Feria por suposición.

Fuentes consultadas el 23 de octubre de 2026:

- [Metrorrey](https://www.metrorrey.mx/): orientación de Me Muevo y QR Urbani para sus servicios.
- [Gobierno de Monterrey](https://www.monterrey.gob.mx/noticias/invita-monterrey-a-tramitar-con-anticipaci%C3%B3n-la-tarjeta-regio-ruta/): Regio Ruta gratuito, con tarjeta de acceso requerida desde septiembre de 2026.
- [IMA](https://www.imanuevoleon.mx/atencionciudadana): información general; no confirma el validador de todas las rutas urbanas.
- [Gobierno de Nuevo León](https://beta.nl.gob.mx/es/boletines/inicia-gobernador-operaciones-de-la-ruta-transmetro-garza-sada-carretera-nacional): referencia histórica de unidades eléctricas verdes de Mederos.
- [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Arriving_Train_Talleres_Station.jpg): fotografía de Talleres y licencia.

## Verificación y límites

- 256 pruebas reales en 36 archivos, sin fallos ni omisiones. Incluyen permisos denegados y tardíos, cancelación, vista previa sin confirmación, geometría completa, pagos con información desconocida y diálogos anidados.
- TypeScript y compilación de producción correctos; carga inicial precargada de aproximadamente 585 KiB. La foto y el mapa base grande no se precargan.
- Revisión visual en navegador: 390×844, 390×520 (altura reducida como aproximación al teclado abierto) y 320×740 con tema oscuro, texto ampliado y alto contraste. Se comprobó búsqueda Padre Mier → Tec de Monterrey, alternativas Metro/autobús y cierre del diálogo de pago conservando el trayecto.
- Android recibe el mismo bundle mediante `cap sync android`, con API HTTPS. Esto no demuestra una ejecución en teléfono físico.
- Pendiente en teléfono: teclado virtual real, precisión GPS en recorrido, TalkBack y rendimiento en dispositivos modestos. No se promete seguimiento ni avisos en segundo plano.
- Google Maps permanece como enlace externo; no hay fotos verificadas de todas las paradas ni pintura/medios de pago específicos de todas las unidades. La interfaz muestra esas limitaciones.

Los logs y capturas de la revisión se conservan en `output/qa/usabilidad-20261024/`. Para esta revisión se ejecutó cada archivo con Node 24 y `--test-isolation=none` en procesos independientes, porque el aislamiento predeterminado del entorno no mostraba los subtests.
