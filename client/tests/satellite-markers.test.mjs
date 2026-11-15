import assert from 'node:assert/strict';
import { test } from 'node:test';
import { satelliteMarker, satelliteName, visibleSatelliteMarkers } from '../src/satellite-markers.ts';

test('archive and upload platform codes resolve to distinct markers and names', () => {
  const records = [
    ['MODIS', 'T', 'terra', 'Terra'],
    ['MODIS', 'Aqua', 'aqua', 'Aqua'],
    ['VIIRS', 'SNPP', 'snpp', 'Suomi NPP'],
    ['VIIRS', 'NOAA-20', 'n20', 'NOAA-20'],
    ['VIIRS', 'N21', 'n21', 'NOAA-21'],
  ];
  for (const [satellite, platform, marker, name] of records) {
    assert.equal(satelliteMarker({ satellite, platform }), marker);
    assert.equal(satelliteName({ satellite, platform }), name);
  }
  assert.deepEqual(visibleSatelliteMarkers(records.map(([satellite, platform]) => ({ properties: { satellite, platform } }))), records.map(record => record[2]));
});

test('modeled records and sensor-only detections preserve missing platform provenance', () => {
  assert.equal(satelliteMarker({ satellite: 'Harmonized', platform: 'Aqua' }), 'harmonized');
  assert.equal(satelliteName({ satellite: 'Harmonized', platform: 'Aqua' }), 'Aqua');
  assert.equal(satelliteMarker({ satellite: 'VIIRS' }), 'unknown');
  assert.equal(satelliteName({ satellite: 'VIIRS' }), 'Not supplied');
});
