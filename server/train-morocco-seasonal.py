"""Train and backtest a nationwide conditional VIIRS detection-location model."""

from datetime import date
import hashlib
import json
from pathlib import Path
import sqlite3

import numpy as np
from pyproj import Transformer
from scipy.ndimage import gaussian_filter
from shapely import contains_xy, prepare
from shapely.geometry import box, mapping, shape
from shapely.ops import transform, unary_union


ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
BOUNDARY = DATA / 'rif-viirs-daily/morocco.geojson'
BOUNDARY_SHA = '200b03e1a392b18a04e306d70965f2aa326f0cb0ca10ba6bf41ca1bac2ef16b8'
GRID_M = 10000
SOURCE = 'NASA FIRMS · NOAA-20 VIIRS archive'
PROJECT = Transformer.from_crs(4326, 6933, always_xy=True).transform
UNPROJECT = Transformer.from_crs(6933, 4326, always_xy=True).transform


def rounded(nodes):
    if isinstance(nodes, (list, tuple)):
        return [rounded(node) for node in nodes]
    return round(nodes, 5)


def grid(country):
    projected = transform(PROJECT, country)
    prepare(projected)
    west, south, east, north = np.floor(np.array(projected.bounds) / GRID_M).astype(int)
    indices, geometries, areas = {}, [], []
    for y in range(south, north + 1):
        for x in range(west, east + 1):
            west_m, south_m = x * GRID_M, y * GRID_M
            footprint = box(west_m, south_m, west_m + GRID_M, south_m + GRID_M)
            if not projected.intersects(footprint):
                continue
            clipped = footprint if projected.covers(footprint) else projected.intersection(footprint)
            if clipped.area <= 0:
                continue
            polygons = [clipped] if clipped.geom_type == 'Polygon' else [p for p in clipped.geoms if p.geom_type == 'Polygon']
            indices[x, y] = len(geometries)
            geometries.append([rounded(mapping(transform(UNPROJECT, polygon.simplify(100, preserve_topology=True)))['coordinates'])
                               for polygon in polygons])
            areas.append(clipped.area / GRID_M ** 2)
    return indices, geometries, np.array(areas), (west, south, east, north)


def observations(country, indices):
    db = DATA / 'vis-test.sqlite'
    with sqlite3.connect(db.as_uri() + '?mode=ro', uri=True) as con:
        rows = con.execute("""
            SELECT date, lon, lat FROM observations WHERE platform='N20' AND instr(source, '/fire_archive_') > 0
            AND date >= '2019-01-01' AND date < '2026-01-01'
            AND lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?
        """, tuple(country.bounds[i] for i in (0, 2, 1, 3))).fetchall()
    detections = set()
    for day, lon, lat in rows:
        if contains_xy(country, lon, lat):
            east, north = PROJECT(lon, lat)
            cell = int(np.floor(east / GRID_M)), int(np.floor(north / GRID_M))
            detections.add((date.fromisoformat(day), indices[cell]))
    if {day.year for day, _ in detections} != set(range(2019, 2026)):
        raise ValueError('Expected archived detection records in each year from 2019 through 2025.')
    return sorted(detections)


def distributions(detections, indices, areas, bounds):
    west, south, east, north = bounds
    width, height = east - west + 1, north - south + 1
    x, y = np.array(list(indices)).T
    lookup = y - south, x - west
    counts = np.zeros((12, height, width))
    for day, i in detections:
        counts[day.month - 1, lookup[0][i], lookup[1][i]] += 1

    def density(activity):
        smoothed = gaussian_filter(activity, sigma=1.5, mode='constant')[lookup] + 0.001
        probability = smoothed * areas
        return probability / probability.sum()

    annual = density(counts.sum(axis=0))
    seasonal = np.stack([0.85 * density(counts[i] + 0.5 * (counts[i - 1] + counts[(i + 1) % 12]))
                         + 0.15 * annual for i in range(12)])
    return {'uniform': np.broadcast_to(areas / areas.sum(), seasonal.shape),
            'annual': np.broadcast_to(annual, seasonal.shape), 'seasonal': seasonal}


def scores(predictions, detected):
    month, cell = zip(*[(day.month - 1, cell) for day, cell in detected])
    top_count = int(np.ceil(predictions.shape[1] / 10))
    thresholds = np.partition(predictions, -top_count, axis=1)[:, -top_count:]
    cutoffs = thresholds.min(axis=1)
    greater = predictions > cutoffs[:, None]
    ties = predictions == cutoffs[:, None]
    tie_credit = (top_count - greater.sum(axis=1)) / ties.sum(axis=1)
    capture = greater[month, cell] + ties[month, cell] * tie_credit[list(month)]
    return {'detection_cell_days': len(cell),
            'mean_log_loss': float(-np.log(predictions[month, cell]).mean()),
            'top_decile_capture': float(capture.mean())}


def main():
    boundary = BOUNDARY.read_bytes()
    if hashlib.sha256(boundary).hexdigest() != BOUNDARY_SHA:
        raise ValueError('Unexpected Morocco boundary.')
    country = unary_union([shape(f['geometry']) for f in json.loads(boundary)['features']])
    indices, geometries, areas, bounds = grid(country)
    detected = observations(country, indices)
    train = [row for row in detected if row[0].year <= 2023]
    validation = [row for row in detected if row[0].year == 2024]
    test = [row for row in detected if row[0].year == 2025]
    dated = distributions(train, indices, areas, bounds)
    checked = {name: scores(values, validation) for name, values in dated.items()}
    model = min(('annual', 'seasonal'), key=lambda name: checked[name]['mean_log_loss'])
    final = distributions(train + validation, indices, areas, bounds)
    evaluation = {name: scores(values, test) for name, values in final.items()}
    if evaluation[model]['mean_log_loss'] >= evaluation['uniform']['mean_log_loss']:
        raise ValueError(f'No improvement over the uniform baseline: {evaluation}')
    updated = distributions(detected, indices, areas, bounds)
    info = {'source': SOURCE, 'training_end_by_year': {'2025': 2024, '2026': 2025}, 'chosen_model': model,
            'validation_2024': checked, 'test_2025': evaluation, 'grid_cells': len(geometries), 'grid_size_m': GRID_M}
    data = {'version': 1, 'bounds': country.bounds, 'cells': geometries,
            'monthly': {f'{year}-{i + 1:02d}-01': np.rint(row * 1_000_000).astype(int).tolist()
                        for year, distribution in ((2025, final), (2026, updated))
                        for i, row in enumerate(distribution[model])},
            'evaluation': info}
    path = ROOT.parent / 'client/public/data/morocco-predictions.json'
    path.write_text(json.dumps(data, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
    print(json.dumps(info, indent=2))


if __name__ == '__main__':
    main()
