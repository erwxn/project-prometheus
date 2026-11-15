import { useMemo } from 'react';
import type { FireFeature } from './fire-data';
import { satelliteMarkers, visibleSatelliteMarkers } from './satellite-markers';

export function SatelliteMarkerKey({ features }: { features: FireFeature[] }) {
  const markers = useMemo(() => visibleSatelliteMarkers(features), [features]);
  if (!markers.length) return null;
  return <ul className="satellite-marker-key" aria-label="Satellite marker shapes">
    {markers.map(id => <li key={id}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fillRule="evenodd" d={satelliteMarkers[id].path} /></svg>
      <span>{satelliteMarkers[id].label}</span>
    </li>)}
  </ul>;
}
