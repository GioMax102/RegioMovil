export const networkLabel = (id?: string) =>
  ({
    metrorrey: 'Metro',
    transmetro: 'Transmetro',
    regioruta: 'RegioRuta',
    'muevo-leon': 'Ruta urbana',
    ecovia: 'Ecovía / GMG',
    'troncales-integradas': 'Ruta integrada',
  })[id || ''] || 'Autobús';
