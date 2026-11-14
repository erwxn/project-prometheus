"""Temporary, local-only FIRMS ZIP ingestion. Original archives are never changed."""
import csv
import datetime as dt
import io
import json
import math
import os
from pathlib import Path
import sqlite3
import sys
import zipfile

source = Path(sys.argv[1]).resolve()
destination = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else Path(__file__).resolve().parent / 'data'
destination.mkdir(exist_ok=True)
working = destination / 'vis-test.building.sqlite'
if working.exists():
    working.unlink()
db = sqlite3.connect(working)
db.execute('PRAGMA journal_mode=OFF')
db.execute('PRAGMA synchronous=OFF')
db.execute('PRAGMA cache_size=-131072')
db.execute('CREATE TABLE observations(sensor TEXT, platform TEXT, lat REAL, lon REAL, date TEXT, time TEXT, frp REAL, confidence TEXT, version TEXT, source TEXT, PRIMARY KEY(platform,lat,lon,date,time)) WITHOUT ROWID')
report = []
archives = sorted(source.glob('*.zip'))
if not archives:
    raise SystemExit('No ZIP archives found')
# Archive products take precedence over overlapping near-real-time observations.
for kind in ('archive', 'nrt'):
    for archive in archives:
        with zipfile.ZipFile(archive) as zipped:
            for member in zipped.namelist():
                if not member.lower().endswith('.csv') or f'fire_{kind}_' not in member.lower():
                    continue
                read = rejected = inserted = 0
                batch = []
                with zipped.open(member) as stream:
                    for row in csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig')):
                        read += 1
                        try:
                            lat, lon, frp = (float(row[key]) for key in ('latitude', 'longitude', 'frp'))
                            date = row['acq_date']
                            if dt.date.fromisoformat(date).isoformat() != date:
                                raise ValueError()
                            clock = row['acq_time'].zfill(4)
                            if len(clock) != 4 or not clock.isdigit() or int(clock[:2]) > 23 or int(clock[2:]) > 59:
                                raise ValueError()
                            platform = row['satellite'].strip()
                            sensor = 'MODIS' if platform in ('Terra', 'Aqua', 'T', 'A') else 'VIIRS' if platform in ('SNPP', 'N20', 'N21') else None
                            if not sensor or not all(map(math.isfinite, (lat, lon, frp))) or abs(lat) > 90 or abs(lon) > 180 or frp < 0:
                                raise ValueError()
                            confidence = row['confidence'].strip()
                            if sensor == 'MODIS' and not (0 <= float(confidence) <= 100):
                                raise ValueError()
                            if sensor == 'VIIRS' and confidence.lower() not in ('l', 'n', 'h', 'low', 'nominal', 'high'):
                                raise ValueError()
                            batch.append((sensor, platform, lat, lon, date, clock[:2]+':'+clock[2:], frp, confidence, row.get('version', ''), archive.name+'/'+member))
                        except (ValueError, KeyError, TypeError):
                            rejected += 1
                        if len(batch) >= 10000:
                            before = db.total_changes
                            db.executemany('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?,?,?,?)', batch)
                            inserted += db.total_changes-before
                            db.commit()
                            batch.clear()
                before = db.total_changes
                db.executemany('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?,?,?,?)', batch)
                inserted += db.total_changes-before
                db.commit()
                result = dict(archive=archive.name, member=member, rows=read, inserted=inserted, rejected=rejected, duplicates=read-rejected-inserted)
                report.append(result)
                print(json.dumps(result), flush=True)
db.execute('CREATE INDEX by_partition ON observations(platform,date,time)')
db.execute("CREATE TABLE partitions AS SELECT sensor,platform,substr(date,1,7) month,count(*) count FROM observations GROUP BY platform,substr(date,1,7)")
db.commit()
total = db.execute('SELECT count(*) FROM observations').fetchone()[0]
db.close()
os.replace(working, destination/'vis-test.sqlite')
(destination/'vis-test-report.json').write_text(json.dumps(dict(temporary=True, total=total, files=report), indent=2), encoding='utf-8')
print(f'Indexed {total:,} unique observations. Remove with npm run test-data:clear.', flush=True)
