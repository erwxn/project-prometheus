import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// Pass this exact instance to react-map-gl: configuring another copy leaves its
// dynamically imported instance looking for a worker beside Vite's cached chunks.
maplibregl.setWorkerUrl(mapWorkerUrl);
export default maplibregl;
