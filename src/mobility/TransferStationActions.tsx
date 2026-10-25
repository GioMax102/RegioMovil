import StationActions from '../components/StationActions';
import { resolveTransferStation, type JourneyTransfer } from './transferStations';
import type { MobilityNetwork } from './types';
import './transferStationActions.css';

export default function TransferStationActions({
  transfer,
  network,
}: {
  transfer: JourneyTransfer;
  network: MobilityNetwork;
}) {
  const sameStop = transfer.fromId === transfer.toId;
  const points = sameStop
    ? [{ id: transfer.fromId, label: 'Transbordo en', name: transfer.from }]
    : [
        { id: transfer.fromId, label: 'Baja en', name: transfer.from },
        { id: transfer.toId, label: 'Aborda en', name: transfer.to },
      ];
  return (
    <div className="transfer-station-actions" role="group" aria-label="Estaciones del transbordo">
      {points.map((point) => {
        const station = resolveTransferStation(network, point.id);
        return (
          <div className="transfer-station-point" key={point.id}>
            <span>
              <small>{point.label}</small>
              <strong>{station?.name ?? point.name}</strong>
            </span>
            {station && <StationActions key={station.stopId} station={station} />}
          </div>
        );
      })}
    </div>
  );
}
