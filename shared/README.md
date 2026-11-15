# Country boundary source

`countries.json` contains the geometry and identifying names/codes from Natural Earth Admin 0 Countries, 1:50m, version 5.1.2.

Source: https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_50m_admin_0_countries.geojson

Natural Earth data is public domain: https://www.naturalearthdata.com/about/terms-of-use/

The original coordinate geometry is retained, including islands and holes. Only unrelated descriptive properties were removed. Boundaries are cartographic representations, not precise legal or operational boundaries. Client and archive backend use the same pinned geometry for consistent filters. Small territories missing from this source explicitly report that boundary filtering is unavailable; they are not replaced with camera bounding boxes.

## Morocco study-area override

The MAR geometry uses the exact OCHA COD-AB ADM0 polygon in `server/config/morocco.geojson`, rather than the Natural Earth outline. Source: https://data.humdata.org/dataset/cod-ab-mar (Le Haut Commissariat au Plan data; CC BY 3.0 IGO; reviewed 2024-12-19). The selected study area represents Western Sahara separately. The canonical GeoJSON SHA-256 is `cbbdf0725be84e16be86ca4cbc96fae56e983b9b204278b35fee35b86d6bfcfd`. The client country search offers Morocco only; the existing generic country helpers retain their other upstream definitions.
