"""Import five official SETME maps for consultation, without adding routing edges.

Manual network refresh only: python3 scripts/import-ima-view-maps.py.
Source URLs are already present in the IMA catalog, linked by its public dataset.
No inference of street geometry, stop sequence, vehicle direction or live service.
"""
import concurrent.futures
import hashlib
import json
import math
import pathlib
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
VERIFIED_AT = "2026-10-25"
SOURCE_ID = "ima-view-maps-20261025"
DATASET_URL = "https://catalogodatos.nl.gob.mx/dataset/2024_2025_tpe_publico_setme"
IDS = (
    "ima-13-remanente-soriana-sendero-lincoln",
    "ima-39-directa-san-bernabe-centro",
    "ima-109-remanente-aeropuerto-y-griega",
    "ima-124-alimentadora-quinta-colonial-ruiz-cortines-por-anillo",
    "ima-310-remanente-portal-de-lincoln-estacion-san-bernabe",
)
NS = {"k": "http://www.opengis.net/kml/2.2"}
catalog_path = ROOT / "data/ima-services.json"
catalog = json.loads(catalog_path.read_text())


def position(value):
    coordinates = [round(float(item), 6) for item in value.strip().split(",")[:2]]
    if len(coordinates) != 2 or not all(math.isfinite(item) for item in coordinates):
        raise ValueError("Invalid published coordinate")
    lng, lat = coordinates
    if not (-100.9 <= lng <= -99.8 and 25.35 <= lat <= 26.1):
        raise ValueError("Published coordinate outside current ZMM coverage")
    return coordinates


def import_map(route_id):
    route = next(row for row in catalog["routes"] if row["id"] == route_id)
    official_url = route["officialUrl"]
    parsed = urllib.parse.urlparse(official_url)
    if parsed.hostname != "www.google.com":
        raise ValueError("The selected route must already reference an official public My Maps")
    mid = urllib.parse.parse_qs(parsed.query)["mid"][0]
    url = "https://www.google.com/maps/d/kml?" + urllib.parse.urlencode({"mid": mid, "forcekml": "1"})
    req = urllib.request.Request(url, headers={"User-Agent": "RegioMovil/1.1 public IMA map importer"})
    with urllib.request.urlopen(req, timeout=45) as response:
        original = response.read(8 * 1024 * 1024 + 1)
    if len(original) > 8 * 1024 * 1024:
        raise ValueError("Source exceeds bounded import size")
    # Public KML is data, not executable HTML. Do not process entities or DTDs.
    if b"<!DOCTYPE" in original.upper() or b"<!ENTITY" in original.upper():
        raise ValueError("Unsupported KML declaration")
    tree = ET.fromstring(original)
    segments, markers, seen_ids = [], [], set()
    for placemark in tree.findall(".//k:Placemark", NS):
        for line in placemark.findall(".//k:LineString/k:coordinates", NS):
            path = [position(pair) for pair in (line.text or "").split()]
            if len(path) >= 2:
                segments.append(path)
        point = placemark.find("k:Point/k:coordinates", NS)
        if point is None:
            continue
        lng, lat = position(point.text or "")
        fields = {row.attrib["name"]: row.findtext("k:value", default="", namespaces=NS).strip()
                  for row in placemark.findall("k:ExtendedData/k:Data", NS)}
        marker_id = fields.get("FID") or "p" + str(len(markers) + 1)
        if marker_id in seen_ids:
            # Keep separately published records without silently merging their coordinates.
            marker_id += ":" + str(len(markers) + 1)
        seen_ids.add(marker_id)
        name = " · ".join(filter(None, [fields.get("NOMVIAL"), fields.get("CRUCE")]))
        markers.append({"id": marker_id,
                        "name": name or placemark.findtext("k:name", default="", namespaces=NS) or "Punto publicado " + str(len(markers) + 1),
                        "lat": lat, "lng": lng,
                        "municipality": fields.get("MUNICIPIO", ""),
                        "infrastructureStatus": "unknown",
                        "publishedInfrastructureNote": fields.get("DESCRIPCIO", "")})
    if not segments or len(markers) < 2:
        raise ValueError("Selected map has insufficient published geometry or markers: " + route_id)
    sha256 = hashlib.sha256(original).hexdigest()
    pack = {"id": route_id, "sourceUrl": url, "officialPageUrl": DATASET_URL,
            "mapTitle": tree.findtext("k:Document/k:name", default="", namespaces=NS),
            "verifiedAt": VERIFIED_AT, "coordinates": segments[0], "segments": segments,
            "additionalPaths": [], "stops": markers, "stopOrderVerified": False,
            "experimentalRouting": False, "geometryKind": "official-published",
            "originalKmlSha256": sha256,
            "license": "not-specified",
            "datasetLicense": "Open Data Commons Attribution License",
            "notes": [
                "Mapa público enlazado por el CSV SETME de paradas del IMA; consulta del 25 de octubre de 2026.",
                "La ficha del conjunto SETME declara Open Data Commons Attribution License; el KML no declara una licencia individual.",
                "Sólo consulta: trazo y marcadores conservados, sin interpolar ni unir segmentos separados.",
                "Los marcadores incluyen propuestas de infraestructura. Sentido, orden, operación y accesibilidad sin verificar.",
                "Este paquete no se incorpora al grafo experimental ni acredita un vehículo o servicio en tiempo real.",
            ]}
    audit = {"routeId": route_id, "checkedAt": VERIFIED_AT, "officialUrl": official_url,
             "downloadUrl": url, "result": "imported-view-only", "sha256": sha256,
             "bytes": len(original), "segments": len(segments), "vertices": sum(map(len, segments)),
             "publishedMarkers": len(markers), "coordinateBoundsValidated": True,
             "stopOrderVerified": False, "directionVerified": False, "experimentalRouting": False,
             "license": pack["license"], "datasetLicense": pack["datasetLicense"]}
    return route_id, pack, audit


# Validate every selected source before mutating any checked-in snapshot.
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    imported = list(pool.map(import_map, IDS))
for route_id, pack, audit in imported:
    (ROOT / "public/route-packs" / (route_id + ".json")).write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n")
    route = next(row for row in catalog["routes"] if row["id"] == route_id)
    route["geometryPack"] = route_id
    route["planningEligible"] = False
    route["routingReady"] = False
    route["sourceIds"] = list(dict.fromkeys(route.get("sourceIds", []) + [SOURCE_ID]))
    route["notes"] = list(dict.fromkeys(route.get("notes", []) + [
        "Mapa oficial importado para consulta el 25 de octubre de 2026; fuera del grafo experimental hasta revisar sentido, orden y vigencia.",
    ]))
    print(route_id, audit["segments"], "segments", audit["publishedMarkers"], "markers: consultation only", flush=True)
catalog["sources"] = [row for row in catalog["sources"] if row["id"] != SOURCE_ID] + [{
    "id": SOURCE_ID, "title": "IMA · Mapas SETME incorporados sólo para consulta",
    "url": DATASET_URL, "publisher": "Instituto de Movilidad y Accesibilidad / Gobierno de Nuevo León",
    "verifiedAt": VERIFIED_AT, "publishedAt": None,
    "license": "Open Data Commons Attribution License",
    "scope": "Cinco mapas públicos enlazados por SETME; KML sin licencia individual declarada. Fechas y SHA-256 por paquete. Sin validación de operación ni planificación.",
}]
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n")
audit = {"version": 1, "checkedAt": VERIFIED_AT, "scope": "Five selected missing IMA maps; not an audit of all catalog URLs.",
         "datasetUrl": DATASET_URL, "routes": [row[2] for row in imported]}
(ROOT / "data/coverage-source-audit-20261025.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
