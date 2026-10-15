# Monterrey offline basemap

`../assets/monterrey-map.svg` contains a simplified geographic extract of actual streets,
parks and waterways in Monterrey, San Nicolás de los Garza and Guadalupe. It is
bundled with the app; displaying or saving a journey never requests map tiles.
The map is for journey context, not pedestrian turn-by-turn navigation.

Source: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright
License of this geographic database: Open Database License (ODbL) 1.0,
https://opendatacommons.org/licenses/odbl/1-0/

Downloaded 2026-10-15 using https://overpass.kumi.systems/api/interpreter.
The server reported a source snapshot of 2026-05-31T22:37:44Z.
Bounding box: south 25.63, west -100.40, north 25.80, east -100.22.

Overpass query:

```overpass
[out:json][timeout:45];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](25.63,-100.40,25.80,-100.22);
  way["waterway"~"^(river|stream)$"](25.63,-100.40,25.80,-100.22);
  way["leisure"="park"]["name"](25.63,-100.40,25.80,-100.22);
  way["natural"="water"](25.63,-100.40,25.80,-100.22);
);
out tags geom;
```

Coordinates use an equirectangular local projection centered at 25.7° N, with
origin (longitude -100.4, latitude 25.8), 100000 units per latitude degree, and
longitude multiplied by cos(25.7°). Paths use Douglas–Peucker simplification
with 10 map units tolerance (approximately 11 m), then round to integer map
units. Tertiary streets and park/water polygons under approximately 5,000 m²
are omitted to keep the local map below 100 KB. SVG path commands use relative
coordinates for compact storage. `monterrey-map.json` records the geographic
transform, source metadata and place labels. Transit station coordinates are projected identically, preserving scale
in both axes. Label positions are centroids of source geometry vertices.

The OSM data's ODbL license is independent from the app's source code license.
