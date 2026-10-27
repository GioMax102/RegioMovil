/** Small, reviewed catalogue. Never substitute another station's photograph. */
export interface StationPhoto {
  src: string;
  width: number;
  height: number;
  alt: string;
  taken: string;
  year: string;
  author: string;
  sourceUrl: string;
  license: string;
}

export const stationPhotos: Readonly<Record<string, StationPhoto>> = {
  'metro:talleres': {
    src: '/assets/station-photos/talleres-2007-07f15f134e2f.webp',
    width: 768,
    height: 555,
    alt: 'Tren llegando al andén de la estación Talleres de Metrorrey en 2007.',
    taken: '2007-08-15',
    year: '2007',
    author: 'Omaaar',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Arriving_Train_Talleres_Station.jpg',
    license: 'Dominio público',
  },
};
