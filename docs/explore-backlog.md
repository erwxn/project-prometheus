# Explore workstream backlog

Explore is the public map experience. It shares region/date selections with Analyze, while Monitor owns the advancing live window. No accounts, subscriptions, or user roles are required.

## Implemented refinement

`client/src/ExploreControls.tsx` owns the simple period shortcuts and selection summary. The shortcuts end at the latest observation in the current selection and are labeled accordingly; they never present a historical file as today's live fires. `explore-presets.ts` holds the date math. Custom datasets/dates stay available in an expandable panel. Analyze and Monitor links navigate without replacing shared state.

## Suggested next work, in order

| Priority | Idea | What done looks like |
| --- | --- | --- |
| 1 | Share the exact view | URL restores the map camera, selected region, UTC dates, source, and dataset version. Opening it on another device reproduces the selection or explains unavailable data. |
| 2 | Make country search select an area | Separate camera navigation from actual geographic filtering. A country choice can explicitly apply its boundary, and the map shows the active selection with a clear reset. Bounding boxes must not be described as exact country boundaries. |
| 3 | Improve detection details | Clicking a point explains detection time, measured versus estimated FRP, source, and observation age in plain language. Call it a detection, not a unique fire or perimeter. |
| 4 | Handle dense maps | At distant zooms, use count aggregation or a density layer; clearly label counts as detections. Keep point inspection when zoomed in. Avoid making arbitrary marker radius imply burned area. |
| 5 | Download the exact search | Offer CSV alongside the PDF. Include selection, UTC timestamps, units, provenance, and version; make loaded-page versus full-search scope explicit. |
| 6 | Add a compact first-visit guide | Three short instructions next to the real controls: find a place, select a period, inspect a detection. Dismissible without an account. |
| 7 | Improve mobile inspection | A point opens a bottom sheet with a close action; it must leave enough of the map visible and support keyboard/screen-reader use. |

## Coordinate with the data teammates

Before integrating their Airflow/GCP output, agree on one sample response/file and a written contract: coordinates, UTC acquisition time, stable observation ID, harmonized value and units, model/product version, publication timestamp, dataset version, and null handling. Agree whether each publication is a complete replacement or a delta. The current feed adapter expects complete snapshots; deltas need explicit merge/deletion behavior.

Expose the pipeline's latest successful publication separately from the latest satellite observation. Distinguish no detections from missing coverage. Preserve the last valid dataset on a failed or partial update. Publish a complete version before making it available to the web service. These are integration requirements to coordinate, not changes made to the pipeline here.

Primary files for Explore: `client/src/App.tsx`, `ExploreControls.tsx`, `explore-presets.ts`, `FireObservations.tsx`. Coordinate edits to shared `FireMap.tsx`, `DashboardProvider.tsx`, and CSS. Work stays on `rayane`.
