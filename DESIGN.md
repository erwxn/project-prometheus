# Prometheus interface direction

Purpose: help researchers and Space Apps participants explore the MODIS–VIIRS resolution and diurnal observation gap. Existing React, Vite, MapLibre and deck.gl behavior is retained.

Palette: warm paper #F4F4F0, instrument white #FCFCFA, charcoal ink #26343C, muted blue #365F76, selected blue #E6EDF0. Fire markers retain their yellow-to-red scientific scale.

Type: DM Sans for navigation, readable controls and the compact display headline. Tabular figures keep changing observations stable. Small secondary timeline ticks use the existing technical type treatment.

Layout: left-aligned instrument rail, dominant geospatial canvas, and an aligned horizontal time explorer. Mobile puts the map first and groups filters beneath it.

    Brand | Fire explorer | Data help | Export
    Analysis rail | Global thermal map
                  | Time explorer

Material: Swiss-inspired editorial minimalism across the explorer, analytics, and data guide. Flat paper surfaces, hairline dividers, and 3–6px control corners replace raised cards. A continuous header and underlined active navigation establish the grid. Analytics statistics sit in a ruled row; charts and sensor comparisons use spacing and typography rather than boxes. Solid navy map tools use explicit selected states. Shadows are reserved for floating timeline and navigation menus. Keep keyboard focus visible, numbers tabular, and geography and thermal colors crisp. Shared tokens and surface rules live in client/src/editorial.css, loaded after each page's structural styles. Decorative hero ornaments and redundant labels are omitted so the globe and observation data carry the visual interest.

Interactions: source filtering, region camera presets, three visualization modes, hourly playback, 24-hour overview, map theme switching, filtered GeoJSON export, and keyboard-accessible data information. Sample provenance is explicit even when the API is online.

Map appearance: selectable flat atlas and 3D globe projections share vector geography and the scientific thermal scale. Dark maps use blue slate land against deep navy oceans; light maps use pale mineral land and muted blue water. Place labels and boundaries stay secondary to observations. The globe adds a static, sparse star field and native atmospheric scattering that tracks its actual horizon. No animated stars or imagery requests are added. Dark outlines keep yellow hotspots legible on the light basemap.
