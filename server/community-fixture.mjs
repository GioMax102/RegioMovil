import { createHash } from 'node:crypto';

const day = 86_400_000;
const focusStationId = 'felix-u-gomez';
const focusRouteId = 'transmetro-san-bernabe-no-reeleccion';
export const COMMUNITY_EXPECTED = {
  total: 1200,
  published: 840,
  resolved: 180,
  pending: 120,
  rejected: 60,
  approved: 1020,
  approvedByTarget: { station: 442, route: 425, unit: 153 },
};

// Generated observations belong exclusively to an explicitly marked, isolated
// environment. No photographs, people, ticket numbers or real fleet IDs are used.
const observations = {
  station: {
    crowding: [
      [
        'Fila extensa para entrar al andén',
        'La fila para pasar los torniquetes llega hasta el pasillo de acceso.',
        'Conviene separar las filas de entrada y salida.',
      ],
      [
        'Cruce saturado durante el transbordo',
        'Las personas que bajan y quienes esperan se cruzan en un pasillo estrecho.',
        'Una guía de circulación ayudaría a mantener libre el paso.',
      ],
      [
        'Espera concentrada junto a la escalera',
        'La espera se concentra al final de la escalera y queda poco espacio para circular.',
        'Hace falta distribuir mejor la fila a lo largo del andén.',
      ],
      [
        'Acceso lento en hora de salida',
        'Se forman dos filas que terminan ocupando el mismo acceso.',
        'Sería útil orientar la fila antes de llegar al torniquete.',
      ],
    ],
    climate: [
      [
        'Poca ventilación en la zona de espera',
        'El aire se siente encerrado en el área donde se espera para abordar.',
        'Se solicita revisar la ventilación de ese espacio.',
      ],
      [
        'Zona de espera sin sombra suficiente',
        'El sol entra de frente y la parte cubierta no alcanza para quienes esperan.',
        'Una cubierta más amplia mejoraría la espera.',
      ],
      [
        'Ventilador del pasillo sin funcionar',
        'El ventilador de la zona de circulación permanece apagado mientras los demás funcionan.',
        'Se solicita revisar el equipo y su alimentación.',
      ],
      [
        'Calor acumulado en el acceso',
        'El acceso cubierto acumula calor cuando la fila avanza despacio.',
        'La circulación de aire en ese punto necesita revisión.',
      ],
    ],
    accessibility: [
      [
        'Elevador fuera de servicio',
        'El elevador no abre y sólo queda disponible la escalera para llegar al andén.',
        'Hace falta señalar una alternativa accesible.',
      ],
      [
        'Rampa con paso obstruido',
        'Hay un objeto junto a la rampa que reduce el espacio para pasar con silla de ruedas.',
        'Se necesita liberar la ruta de acceso.',
      ],
      [
        'Guía táctil desgastada',
        'Un tramo de la guía táctil se encuentra liso y cuesta distinguirlo del resto del piso.',
        'Se solicita reponer las piezas de ese recorrido.',
      ],
      [
        'Escalón sin contraste visible',
        'El borde del primer escalón casi no se distingue del piso.',
        'Una marca de contraste ayudaría a identificar el desnivel.',
      ],
    ],
    condition: [
      [
        'Agua acumulada en el pasillo',
        'Quedó agua en una parte del pasillo y varias personas rodean esa zona para pasar.',
        'Se solicita revisar el origen y secar el piso.',
      ],
      [
        'Torniquete con lectura intermitente',
        'El lector marca error en varios intentos antes de permitir el acceso.',
        'La fila avanza con lentitud frente a ese equipo.',
      ],
      [
        'Residuos en el área de espera',
        'Hay envolturas y vasos alrededor de la zona donde se espera el tren.',
        'Se solicita limpieza y revisar la disponibilidad de contenedores.',
      ],
      [
        'Barandal con movimiento',
        'Un tramo del barandal se mueve al sujetarse durante el descenso.',
        'Se necesita revisar sus puntos de fijación.',
      ],
    ],
    infrastructure: [
      [
        'Faltan asientos en la zona de espera',
        'La zona de espera no tiene suficientes asientos y varias personas esperan de pie junto al muro.',
        'Se solicita evaluar la instalación de una banca.',
      ],
      [
        'Luminaria apagada en el acceso',
        'Una luminaria del acceso está apagada y deja un tramo con poca luz.',
        'Se necesita revisar el foco y su conexión.',
      ],
      [
        'Señal de transbordo poco visible',
        'La señal que indica hacia dónde continuar queda detrás de otra estructura.',
        'Reubicarla ayudaría a encontrar el andén sin regresar.',
      ],
      [
        'Goteras bajo la cubierta',
        'La cubierta deja caer agua sobre la franja donde se forma la fila.',
        'Se solicita revisar las juntas y el desagüe.',
      ],
    ],
  },
  route: {
    crowding: [
      [
        'Fila que invade la zona de ascenso',
        'La fila llega hasta la zona donde se detiene la unidad y se mezcla con quienes descienden.',
        'Hace falta ordenar el punto de abordaje.',
      ],
      [
        'Demanda alta al salir de clases',
        'La fila crece después de la salida de clases y no todas las personas logran abordar.',
        'Se solicita revisar la capacidad en ese horario.',
      ],
      [
        'Parada saturada al anochecer',
        'La zona de espera se llena y algunas personas terminan esperando sobre la banqueta lateral.',
        'Se solicita revisar la distribución de la espera.',
      ],
      [
        'Abordaje lento por filas cruzadas',
        'Dos filas se cruzan frente al mismo punto de ascenso.',
        'Un señalamiento de la fila ayudaría a dejar libre el descenso.',
      ],
    ],
    climate: [
      [
        'Parada sin protección del sol',
        'La espera ocurre a pleno sol porque no hay un área cubierta junto al punto de ascenso.',
        'Se solicita evaluar una cubierta para la parada.',
      ],
      [
        'Espera sin resguardo de lluvia',
        'Cuando llueve, el agua cae directamente sobre el lugar donde se forma la fila.',
        'Hace falta un espacio de espera protegido.',
      ],
      [
        'Cubierta que concentra calor',
        'La cubierta del punto de espera acumula calor y deja poca circulación de aire.',
        'Se solicita revisar el diseño de ventilación.',
      ],
      [
        'Sombra insuficiente por la tarde',
        'La sombra queda fuera de la zona donde se detiene la unidad durante la tarde.',
        'Se solicita evaluar una ampliación del resguardo.',
      ],
    ],
    accessibility: [
      [
        'Banqueta estrecha para abordar',
        'El espacio de espera es reducido y no permite maniobrar con silla de ruedas.',
        'Se solicita revisar el acceso al punto de ascenso.',
      ],
      [
        'Falta rampa junto a la parada',
        'La banqueta tiene un desnivel y no hay una rampa cerca del lugar de abordaje.',
        'Hace falta una conexión accesible con el cruce.',
      ],
      [
        'Cruce peatonal poco visible',
        'La pintura del cruce junto a la parada está desgastada y cuesta distinguir por dónde pasar.',
        'Se solicita renovar el señalamiento.',
      ],
      [
        'Paso interrumpido frente a la parada',
        'Un obstáculo ocupa la franja de circulación peatonal antes de llegar a la parada.',
        'Se necesita mantener libre el acceso.',
      ],
    ],
    condition: [
      [
        'Agua estancada junto al ascenso',
        'El agua acumulada queda entre la banqueta y el sitio donde abre la puerta la unidad.',
        'Se solicita revisar el drenaje del punto de abordaje.',
      ],
      [
        'Señal de parada deteriorada',
        'La placa de la parada está doblada y apenas se alcanza a leer.',
        'Se solicita reparar el soporte y renovar la información.',
      ],
      [
        'Residuos alrededor de la parada',
        'Hay bolsas y residuos cerca del lugar donde se espera la unidad.',
        'Se solicita una jornada de limpieza y un contenedor.',
      ],
      [
        'Pavimento irregular al abordar',
        'El pavimento junto a la parada presenta un desnivel que dificulta acercarse a la puerta.',
        'Se necesita revisar la superficie del ascenso.',
      ],
    ],
    infrastructure: [
      [
        'Falta banca en la parada',
        'No hay asientos en el punto de espera y algunas personas se sientan en el borde de la banqueta.',
        'Se solicita evaluar una banca que no obstruya el paso.',
      ],
      [
        'Parada sin letrero de rutas',
        'No hay una señal visible que permita saber qué recorridos se detienen en ese punto.',
        'Se solicita colocar información de las rutas.',
      ],
      [
        'Alumbrado apagado cerca de la parada',
        'El punto de espera queda oscuro porque la luminaria cercana no enciende.',
        'Se solicita revisar el alumbrado de ese tramo.',
      ],
      [
        'Cubierta de parada dañada',
        'La cubierta tiene una sección suelta y deja parte de la zona de espera sin protección.',
        'Se necesita revisar la fijación y reponer la pieza.',
      ],
    ],
  },
  unit: {
    crowding: [
      [
        'Pasillo lleno durante el recorrido',
        'El pasillo se llena y resulta difícil acercarse a la puerta antes de bajar.',
        'Se solicita revisar la capacidad disponible en este horario.',
      ],
      [
        'Ascenso con poco espacio interior',
        'Al subir quedan personas muy cerca de la puerta porque el pasillo ya está ocupado.',
        'Se solicita revisar la distribución del abordaje.',
      ],
      [
        'Zona de descenso obstruida',
        'La zona frente a la puerta de descenso queda ocupada durante varias paradas.',
        'Hace falta mantener libre el espacio para bajar.',
      ],
      [
        'Viaje con alta ocupación',
        'Durante varios tramos no queda espacio para avanzar dentro de la unidad.',
        'Se solicita revisar la capacidad de la ruta en este periodo.',
      ],
    ],
    climate: [
      [
        'Aire acondicionado sin enfriar',
        'El sistema de aire está encendido, pero sale aire tibio y el interior se mantiene caliente.',
        'Se solicita revisar el enfriamiento de la unidad.',
      ],
      [
        'Ventilación insuficiente al fondo',
        'En la parte trasera casi no se percibe circulación de aire.',
        'Se solicita revisar las salidas de ventilación.',
      ],
      [
        'Agua bajo la salida de aire',
        'Se observan gotas que caen desde una salida de aire sobre la zona de asientos.',
        'Se solicita revisar el desagüe del equipo.',
      ],
      [
        'Equipo de clima apagado',
        'El equipo de clima permanece apagado durante el recorrido y el interior acumula calor.',
        'Se solicita revisar su funcionamiento.',
      ],
    ],
    accessibility: [
      [
        'Rampa de acceso sin desplegar',
        'La rampa no logra desplegarse cuando se intenta utilizar en el ascenso.',
        'Se solicita revisar el mecanismo de acceso.',
      ],
      [
        'Espacio accesible con obstáculo',
        'Un objeto ocupa parte del espacio destinado a silla de ruedas.',
        'Se necesita mantener libre esa zona.',
      ],
      [
        'Botón de parada fuera de alcance',
        'El botón cercano al espacio accesible no queda al alcance desde una posición sentada.',
        'Se solicita revisar su ubicación y disponibilidad.',
      ],
      [
        'Asiento preferente sin señal visible',
        'La identificación del asiento preferente está desgastada y ya no se distingue.',
        'Se solicita renovar el señalamiento.',
      ],
    ],
    condition: [
      [
        'Asiento con respaldo flojo',
        'El respaldo de un asiento se mueve al apoyarse y presenta una fijación suelta.',
        'Se solicita revisar y asegurar la pieza.',
      ],
      [
        'Piso mojado cerca de la puerta',
        'Hay agua sobre el piso junto a la puerta de ascenso y se vuelve resbaloso.',
        'Se solicita secar la superficie y revisar el origen.',
      ],
      [
        'Timbre de parada sin respuesta',
        'El botón de aviso no emite señal al presionarlo y se necesita utilizar otro.',
        'Se solicita revisar el circuito del timbre.',
      ],
      [
        'Ventana con cierre deteriorado',
        'Una ventana no cierra bien y vibra durante el recorrido.',
        'Se solicita revisar el seguro y la fijación.',
      ],
    ],
    infrastructure: [
      [
        'Pasamanos con fijación suelta',
        'El pasamanos junto a la puerta se mueve al sujetarse.',
        'Se necesita revisar sus puntos de fijación.',
      ],
      [
        'Luz interior sin funcionar',
        'Una franja de iluminación permanece apagada en la parte central de la unidad.',
        'Se solicita revisar la luminaria.',
      ],
      [
        'Letrero de destino difícil de leer',
        'El letrero exterior tiene segmentos apagados y cuesta reconocer el destino.',
        'Se solicita revisar el panel de información.',
      ],
      [
        'Escalón de ascenso desgastado',
        'La superficie del primer escalón perdió parte del material antiderrapante.',
        'Se solicita reponer el recubrimiento.',
      ],
    ],
  },
};

export function communityFixture({ network, catalog, seed, date }) {
  const stations = [...network.stations].sort((a, b) => a.id.localeCompare(b.id));
  const routes = catalog.routes
    .filter((route) => route.mode !== 'metro' && route.status === 'published')
    .sort((a, b) => a.id.localeCompare(b.id));
  const station = stations.find(
    (item) => item.id === focusStationId && item.lineIds?.includes('L3'),
  );
  const route = routes.find((item) => item.id === focusRouteId);
  if (!station || !route)
    throw new Error(
      'El perfil community requiere Félix U. Gómez (L3) y Transmetro San Bernabé – No Reelección.',
    );
  const otherStations = stations.filter((item) => item !== station);
  const otherRoutes = routes.filter((item) => item !== route);
  if (!otherStations.length || !otherRoutes.length)
    throw new Error('El perfil community requiere otras estaciones y rutas publicadas.');
  let state = createHash('sha256').update(seed).digest().readUInt32BE(0);
  const choose = (items) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return items[Math.floor((state / 0x1_0000_0000) * items.length)];
  };
  const offset = choose(Array.from({ length: otherRoutes.length }, (_, index) => index));
  const ages = Array.from({ length: 70 }, (_, index) => index);
  // Approved observations cover the complete published route catalog first;
  // pending/rejected rows do not leave holes in public route coverage.
  const publicOrdinal = (index) => Math.floor(index / 20) * 17 + Math.min(index % 20, 16);
  const records = Array.from({ length: COMMUNITY_EXPECTED.total }, (_, index) => {
    const targetType =
      index < 300 || (index >= 620 && index < 840)
        ? 'station'
        : (index >= 540 && index < 620) || index >= 1100
          ? 'unit'
          : 'route';
    const selectedStation =
      targetType !== 'station'
        ? null
        : index < 300
          ? station
          : otherStations[(index - 620) % otherStations.length];
    const selectedRoute =
      targetType === 'station'
        ? null
        : index < 620
          ? route
          : otherRoutes[
              (publicOrdinal(index >= 1100 ? index - 1100 : index - 840) + offset) %
                otherRoutes.length
            ];
    const category = ['crowding', 'condition', 'infrastructure', 'accessibility', 'climate'][
      index % 5
    ];
    const [title, observation, impact] = choose(observations[targetType][category]);
    const locationReference =
      targetType === 'station'
        ? index < 300
          ? choose(['Andén de Línea 3', 'Acceso a Línea 3', 'Pasillo de transbordo L1–L3'])
          : choose(['Acceso principal', 'Zona de espera', 'Pasillo de acceso'])
        : targetType === 'unit'
          ? choose(['Parte delantera', 'Parte central', 'Parte trasera'])
          : choose([
              'Punto de ascenso',
              'Zona de espera de la parada',
              'Acceso peatonal a la parada',
            ]);
    const time = choose(['durante la mañana', 'al mediodía', 'durante la tarde', 'al anochecer']);
    const createdAt = new Date(
      date.getTime() - choose(ages) * day - (3 + (index % 19)) * 3_600_000 - (index % 60) * 60_000,
    ).toISOString();
    const status =
      index % 20 < 14
        ? 'published'
        : index % 20 < 17
          ? 'resolved'
          : index % 20 < 19
            ? 'pending'
            : 'rejected';
    return {
      targetType,
      stationId: targetType === 'station' ? selectedStation.id : undefined,
      routeId: targetType !== 'station' ? selectedRoute.id : undefined,
      // References identify only fictional units within this isolated fixture.
      unitReference: targetType === 'unit' ? `Unidad ${4100 + (index % 72)}` : undefined,
      locationReference,
      category,
      title,
      detail: `${observation} Se observó ${time} (${locationReference}). ${impact}`,
      publicationConsent: status === 'published' || status === 'resolved',
      createdAt,
      status,
    };
  });
  return {
    records,
    expected: COMMUNITY_EXPECTED,
    contentSha256: createHash('sha256').update(JSON.stringify(records)).digest('hex'),
    coverage: {
      stations: new Set(records.map((item) => item.stationId).filter(Boolean)).size,
      routes: new Set(records.map((item) => item.routeId).filter(Boolean)).size,
      categories: Object.keys(observations.station),
      focus: [
        { targetType: 'station', stationId: station.id, lineId: 'L3', total: 300, approved: 255 },
        { targetType: 'route-and-unit', routeId: route.id, total: 320, approved: 272 },
      ],
    },
  };
}
