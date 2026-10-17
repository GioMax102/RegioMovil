# ZMM offline basemap

`../assets/monterrey-map.svg` contains a simplified geographic extract of actual roads,
parks and waterways covering the central metropolitan area and its approaches: García,
Santa Catarina, San Pedro, Monterrey, Escobedo, San Nicolás, Guadalupe, Apodaca and
Juárez. The geographic rectangle is not a municipal boundary. The map is bundled with
the app; displaying the journey detail or saving a journey never requests map tiles.
The planner can additionally display online map tiles. This extract is for geographic
context, not pedestrian turn-by-turn navigation or a claim of complete street coverage.

Source: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright
License of this geographic database: Open Database License (ODbL) 1.0,
https://opendatacommons.org/licenses/odbl/1-0/

Downloaded 2026-10-17 using https://overpass-api.de/api/interpreter.
The server reported a source snapshot of 2026-10-17T09:00:50Z. This is a dated
geographic snapshot, not live information about road openings or transit service.
Bounding box: south 25.35, west -100.90, north 26.10, east -99.80.
The previous extract was only 25.63–25.80 / -100.40–-100.22, leaving visible empty
rectangles in trips from Las Estaciones, San Bernabé and the south of Monterrey.

Overpass query:

```overpass
[out:json][timeout:90];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](25.35,-100.90,26.10,-99.80);
  way["waterway"~"^(river|stream)$"](25.35,-100.90,26.10,-99.80);
  way["leisure"="park"]["name"](25.35,-100.90,26.10,-99.80);
  way["natural"="water"](25.35,-100.90,26.10,-99.80);
);
out tags geom;
```

Coordinates use an equirectangular local projection centered at 25.7° N, with
origin (longitude -100.90, latitude 26.10), 100000 units per latitude degree, and
longitude multiplied by cos(25.7°). Paths use Douglas–Peucker simplification
with 15 map units tolerance (approximately 17 m), then round to integer map
units. Park/water polygons under 4,000 square projection units (approximately
5,000 m² on the ground) are omitted. The asset contains 15,897 actual source features
in 508,355 bytes, below the explicit 1 MiB budget. No road geometry is invented to fill
gaps. SVG path commands use relative coordinates for compact storage.
`monterrey-map.json` records the transform, source snapshot, exact input SHA-256,
extent and per-category feature counts. Transit coordinates use the same transform,
preserving scale in both axes. The extract now covers the entire bounded exploration rectangle used by the planner,
so panning inside the allowed region does not expose a rectangular map boundary.
The map deliberately contains principal roads rather than every residential street.

Rebuild from the documented Overpass response (JSON using `out tags geom`):

```bash
python3 scripts/import-offline-basemap.py /path/to/overpass-response.json --places /path/to/city-nodes.json
```

The importer has no network side effects and rejects an SVG above 1 MiB. The original
JSON is not shipped in the app; its checksum identifies the source extract.

The OSM data's ODbL license is independent from the app's source code license.

City labels use exact OSM `place=city|town` nodes from a second query on the same
public endpoint, source snapshot 2026-10-17T09:03:51Z. The importer retains 15 named
municipal seats in the region and stores each OSM node identifier and the input checksum.
The label position is the actual source node, not a guessed municipal centroid.

```overpass
[out:json][timeout:30];
node["place"~"^(city|town)$"]["name"](25.35,-100.90,26.10,-99.80);
out;
```
