# Planeación, red y apariencia · 17 de octubre de 2026

La planeación empieza por origen y destino, seguidos por las prioridades y el mapa.
Ambos extremos aceptan lugares, calles, direcciones, ubicación autorizada o un punto
en el mapa. Los filtros de transporte se aplican a las alternativas encontradas.

El buscador consulta Photon automáticamente después de una pausa de 650 ms, a partir
de tres caracteres. Cancela consultas anteriores, respeta la composición del teclado
y admite navegación por flechas. Los resultados mantienen su dirección publicada y
eliminan objetos duplicados con el mismo nombre y dirección. Sin conexión muestra
paradas oficiales y lugares incluidos en trayectos guardados. Estos últimos abren su
paquete existente; no habilitan un cálculo nuevo con coordenadas arbitrarias.
Véase [búsqueda y privacidad](lugares-y-privacidad.md).

Los enlaces a pie entre dos transportes de menos de tres minutos y 250 metros se
presentan como cambios de transporte compactos. Las caminatas inicial y final, así
como las conexiones más largas, conservan sus etapas. La presentación no modifica
las geometrías, tiempos ni distancias guardadas.

El fondo local utiliza un extracto real de OpenStreetMap que cubre todo el rectángulo
de exploración de la ZMM, con un SVG de 508 355 bytes. El mapa del detalle adapta su
proyección al espacio disponible en celulares para evitar franjas por diferencia de
proporción y conservar visibles los extremos. La exploración mantiene sus límites
regionales. [Procedencia del mapa](../src/data/monterrey-map.md).

Inicio ofrece planeación, acceso a guardados y a Red, dos próximas unidades y un
pronóstico breve. Red abre el mapa de sistemas y el catálogo de 214 fichas; sus
filtros sincronizan mapa y lista. Los 54 recorridos con geometría documentada se
cargan al entrar a Red, con una simplificación visual de hasta 200 puntos por
segmento. Los datos del motor y los detalles conservan la geometría completa. Los
servicios en construcción permanecen en las fichas y fuera del cálculo.

Ajustes incorpora tema del sistema, claro u oscuro y un control de animaciones.
Se conservan en este dispositivo; las solicitudes de movimiento reducido del sistema
siempre se respetan. Guardar y navegar utilizan confirmaciones breves, también
visibles con las animaciones apagadas. Los módulos públicos bloqueados no leen ni
escriben las preferencias personales de apariencia.

## Verificación

- `./regiomovil build`: TypeScript y empaquetado correctos; recursos iniciales de
  487 KiB. Los estilos y scripts mantienen sus presupuestos de transferencia.
- `./regiomovil test`: 159 pruebas, sin fallos. Incluyen orden del formulario,
  paquetes offline desde el buscador, sugerencias automáticas y cancelación,
  transbordos cortos, encuadre regional, persistencia de apariencia y navegación.
- Navegador a 390 × 844: búsqueda real de Parque Fundidora, Las Estaciones al Tec
  mediante Transmetro y Metro, guardado, mapas claro/oscuro y filtro RegioRuta
  sincronizado con sus siete fichas; sin desbordamiento horizontal.
- `./regiomovil android --dev-local-api`: APK debug compilado y firma v2 verificada.
  Se restauró después la compilación web sin dirección de API fija.
- Servidor reiniciado y comprobado en `http://localhost:4173/api/health`.
  No había un dispositivo ADB conectado al intentar restablecer el túnel USB.

Las capturas de verificación están en `output/qa/`, y el APK en
`output/android/regiomovil-debug.apk` (ambos ignorados por Git).

Los tiempos, la afluencia y las condiciones de las unidades siguen siendo simulados.
La disponibilidad de trazos no confirma la operación actual ni el sentido o el orden
de paradas de un autobús. El servicio público de Photon es configurable y no ofrece
un SLA para un despliegue de producción; los límites y alternativas están documentados
en la política de búsqueda enlazada arriba.

## Contraste y estaciones en los mapas

La vista de Red utiliza el mismo fondo vectorial discreto de los detalles, incluso
con conexión. Las rutas se dibujan opacas, con halo claro y contorno oscuro para
conservar también el amarillo de Línea 1. Metro se dibuja encima de los autobuses.
Una leyenda identifica líneas, sistemas y el símbolo de estación o parada.

Los círculos proceden de las paradas publicadas de los servicios seleccionados;
ningún vértice del trazo se convierte en una estación. Se prioriza Metro y se
separan visualmente los puntos cercanos de autobús al acercar el mapa, con hasta
240 marcadores por ventana. La vista de Metro muestra sus 38 estaciones, incluidas
las compartidas. El detalle del trayecto muestra sus propias paradas. El botón de
centrar recupera el encuadre de los recorridos seleccionados.

Se verificaron los temas claro y oscuro a 390 × 844, las tres líneas Metro, las 54
rutas juntas y la leyenda; en esa vista conjunta se dibujaron 122 círculos. La suite
completa pasa sus 165 pruebas. Se recompiló y verificó el APK debug, se restauró el
build web y se comprobó el servidor junto con el túnel USB de Android en el puerto
4173. Las capturas están en `output/qa/metro-contraste-estaciones.jpg` y
`output/qa/metro-contraste-oscuro.jpg`.

## Exploración de recorridos y consulta de estaciones

Red permite aislar un recorrido documentado mediante «Recorrido en el mapa»;
la selección sincroniza su sistema con el catálogo y se limpia al cambiar de red.
«Ampliar mapa» abre la misma información en un diálogo con mayor superficie de
exploración. Sólo se monta un mapa a la vez, y al cerrar se conserva el recorrido
elegido. No cambia la cobertura ni incorpora servicios en construcción al cálculo.

Tocar una bolita sin arrastrar abre una ficha breve con el nombre publicado y las
líneas o recorridos de esa parada. La información de una estación compartida
conserva sus otras conexiones aunque el mapa muestre sólo una línea. La ficha no
cambia el origen o el destino. También puede consultarse con el selector nativo
dentro de «Consultar una estación», sin depender de tocar un punto pequeño.
Se descartan los gestos arrastrados o cancelados para evitar selecciones accidentales.
Los nombres de terminales y conexiones aparecen progresivamente, con hasta cinco
rótulos en una ventana móvil y nueve en una grande; las coordenadas no se desplazan.

El buscador de origen o destino recibe el foco después de abrir el diálogo nativo,
incluido React StrictMode. Esto permite empezar a escribir directamente y conserva
el bloqueo de interacción y desplazamiento de la pantalla del fondo. El fondo del
mapa también adopta el tema oscuro.

La verificación incluye 170 pruebas, compilación Android y firma v2. En navegador
de 390 × 844 se probó aislar Línea 1, ampliar, tocar Cuauhtémoc y comprobar sus
conexiones con Líneas 1 y 2; también se comprobó el foco real del buscador. Las
capturas están en `output/qa/mapa-ampliado-conexiones.jpg` y
`output/qa/mapa-ampliado-oscuro.jpg`. No se detectó un dispositivo ADB al intentar
activar el túnel de esta ejecución. El servidor queda activo en el puerto 4173;
al conectar el teléfono se ejecuta `./regiomovil android-connect` antes de Run.
