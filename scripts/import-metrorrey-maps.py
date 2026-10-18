"""Refresh official Transmetro My Maps route packs discovered on metrorrey.mx.

Manual network import. Ordinary app builds only read the checked-in snapshots.
No street interpolation, invented stops, or reuse of another operator's path.
"""
import concurrent.futures
import hashlib
import json
import pathlib
import re
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
NS = {"k": "http://www.opengis.net/kml/2.2"}
manifest = json.loads((ROOT / "data/metrorrey-map-sources.json").read_text())
catalog_path = ROOT / "data/metrorrey-services.json"
catalog = json.loads(catalog_path.read_text())
SOURCE_ID = "metrorrey-transmetro-maps-20261016"


def import_map(row):
    url = "https://www.google.com/maps/d/kml?mid=" + row["mapId"] + "&forcekml=1"
    req = urllib.request.Request(url, headers={"User-Agent": "RegioMovil/1.0 official public transport data importer"})
    original = urllib.request.urlopen(req, timeout=45).read()
    tree = ET.fromstring(original)
    paths, markers = [], []
    for placemark in tree.findall(".//k:Placemark", NS):
        name = placemark.findtext("k:name", default="", namespaces=NS).strip()
        for line in placemark.findall(".//k:LineString/k:coordinates", NS):
            coordinates = [[round(float(value), 6) for value in point.split(",")[:2]] for point in line.text.split()]
            if len(coordinates) >= 2:
                paths.append(coordinates)
        point = placemark.find("k:Point/k:coordinates", NS)
        if point is None:
            continue
        lng, lat = [round(float(value), 6) for value in point.text.strip().split(",")[:2]]
        if not (-100.9 <= lng <= -99.8 and 25.35 <= lat <= 26.1):
            raise ValueError("Out-of-region published stop: " + row["routeId"])
        # Numeric labels are retained as such; no street name is guessed.
        label = "Parada " + name if re.fullmatch(r"\d+(?:[A-Za-z])?", name) else name
        markers.append({"id": "p" + str(len(markers) + 1), "name": label or "Punto publicado " + str(len(markers) + 1),
                        "publishedName": name, "lat": lat, "lng": lng, "infrastructureStatus": "unknown"})
    if not paths or len(markers) < 2:
        # Do not turn line vertices into fictitious boarding stops.
        return row, len(markers), 0
    pack = {"id": row["routeId"], "sourceUrl": url, "officialPageUrl": manifest["officialPageUrl"],
            "mapTitle": tree.findtext("k:Document/k:name", default=row["name"], namespaces=NS),
            "verifiedAt": manifest["verifiedAt"], "coordinates": paths[0], "segments": paths,
            "additionalPaths": [], "stops": markers, "stopOrderVerified": False,
            "geometryKind": "official-published", "originalKmlSha256": hashlib.sha256(original).hexdigest(),
            "notes": ["KML del mapa My Maps de Metrorrey incrustado en el sitio oficial, sección Rutas Transmetro.",
                      "Trazos y marcadores publicados; coordenadas redondeadas a seis decimales. Sin interpolar paradas.",
                      "El orden se infiere por proyección. La publicación no certifica sentidos, frecuencias, accesibilidad ni estado actual.",
                      "Etiquetas numéricas corresponden a las del mapa oficial y no identifican una dirección de calle."]}
    (ROOT / "public/route-packs" / (row["routeId"] + ".json")).write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n")
    return row, len(markers), len(paths)


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for row, count, paths in pool.map(import_map, manifest["routes"]):
        if paths == 0:
            row["excludedReason"] = "missing-published-path-or-stops"
            print(row["routeId"], "excluded: insufficient published path/stops", count, flush=True)
            continue
        route = next((r for r in catalog["routes"] if r["id"] == row["routeId"]), None)
        if route is None:
            route = {"id": row["routeId"], "code": "TM", "name": row["name"], "networkId": "transmetro",
                     "mode": "bus", "municipalities": [], "from": None, "to": None, "via": [],
                     "sourceIds": [], "planningEligible": False, "notes": []}
            catalog["routes"].append(route)
        route.update({"name": row["name"], "status": "published", "statusAsOf": None,
                      "officialUrl": "https://www.google.com/maps/d/viewer?mid=" + row["mapId"],
                      "geometryPack": row["routeId"], "publishedStopCount": count})
        route["sourceIds"] = list(dict.fromkeys(route.get("sourceIds", []) + [SOURCE_ID]))
        # CSV SIN VALOR/discrepancy notes are historical; replace them with provenance of the usable map.
        route["notes"] = ["Mapa de recorrido y paradas publicado por Metrorrey en su sitio oficial; consultado el 16 de octubre de 2026.",
                          "Disponible para calcular combinaciones experimentales; sentido, orden, operación actual y accesibilidad sin verificar.",
                          "El mapa publicado no indica fecha de actualización; la fecha de consulta no acredita una inauguración."]
        print(row["routeId"], count, "published markers", paths, "paths", flush=True)

catalog["sources"] = [source for source in catalog["sources"] if source["id"] != SOURCE_ID] + [{
    "id": SOURCE_ID, "title": "Metrorrey · Mapas oficiales de rutas Transmetro y GMG",
    "url": manifest["officialPageUrl"], "publisher": "Sistema de Transporte Colectivo Metrorrey",
    "verifiedAt": manifest["verifiedAt"], "publishedAt": None, "license": "not-specified",
    "scope": "32 mapas My Maps enlazados desde Rutas Transmetro; se conserva trazo, marcadores, URL de descarga y SHA-256 de cada KML. No acredita estado de servicio en vivo ni frecuencias."}]
catalog["verifiedAt"] = manifest["verifiedAt"]
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
(ROOT / "data/metrorrey-map-sources.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
