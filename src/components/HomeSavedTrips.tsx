import { useEffect, useState } from 'react';
import { Bookmark, BriefcaseBusiness, GraduationCap, House } from 'lucide-react';
import {
  readSavedMobilityTrips,
  savedMobilityEvent,
  savedMobilityKey,
} from '../mobility/savedTrips';
import type { SavedMobilityTrip } from '../mobility/types';

/** Saved shortcuts are secondary to the immediately available Metro information. */
export default function HomeSavedTrips({ onOpen }: { onOpen: (trip: SavedMobilityTrip) => void }) {
  const [trips, setTrips] = useState(readSavedMobilityTrips);
  useEffect(() => {
    const refresh = () => setTrips(readSavedMobilityTrips());
    const storage = (event: StorageEvent) => {
      if (event.key === savedMobilityKey || event.key === null) refresh();
    };
    window.addEventListener(savedMobilityEvent, refresh);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener(savedMobilityEvent, refresh);
      window.removeEventListener('storage', storage);
    };
  }, []);
  if (!trips.length) return null;
  return (
    <nav className="home-shortcuts" aria-label="Trayectos guardados">
      {trips.map((trip) => {
        const label = trip.label
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        const Icon = /casa|hogar/.test(label)
          ? House
          : /escuela|universidad|tec|estudio/.test(label)
            ? GraduationCap
            : /trabajo|oficina/.test(label)
              ? BriefcaseBusiness
              : Bookmark;
        return (
          <button
            key={trip.id}
            type="button"
            onClick={() => onOpen(trip)}
            aria-label={`Abrir trayecto ${trip.label}`}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{trip.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
