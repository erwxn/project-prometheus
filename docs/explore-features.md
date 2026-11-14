# Explore features: implementation notes

## Shareable searches

`explore-share.ts` validates and serializes camera, UTC dates, sensor, metric, selected day, country, drawn region, archive platform, and playback settings. The Share this view control copies a link and exposes a selectable text fallback when clipboard access fails. Research state remains in the shared provider. A link is a query, not a data archive: uploaded files and historical dataset versions are not stored by sharing. The interface explicitly warns that available observations can change. Unknown or malformed parameters fall back safely rather than running arbitrary content.

## Country filters

The pinned Natural Earth 1:50m boundary dataset is in `shared/countries.json`; provenance is in `shared/README.md`. Explore search applies the country filter and moves the camera without drawing a country outline. Browser predicates and server archive queries use the same geometry, retaining multipolygons and holes. A custom region intersects the country filter. Clear region removes both; Reset Filters clears the country too. Analyze and Monitor display a clear-country action for a selection carried over from Explore. Country boundaries are cartographic, not exact legal or operational boundaries.

## Detection details

Point inspection distinguishes acquisition time, sensor/platform, measured versus estimated FRP, confidence, and product/source. Explanations distinguish detected heat from unique fires, fire size, or perimeters. Details remain scrollable on small displays.

## Map rendering

Detections remain individual points at every zoom level. Count-cell aggregation has been removed.

## Remaining boundaries

CSV exports belong to Analyze and were not added here. Large archive selections remain paginated. Share links cannot reproduce an unavailable uploaded file or fetch a removed dataset version. Those limits are intentional and stated in the UI.
