"""Import selected public IMA My Maps KMLs without creating/interpolating stops.

Run manually with Python 3 and network access. Builds deterministic public route
packs and updates the source catalog; ordinary builds only read committed data.
"""
import hashlib
import json
import pathlib
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
IDS = [
    "ima-130-remanente-alameda", "ima-130-remanente-juarez",
    "ima-130-remanente-hospital", "ima-201-remanente-fleteros",
    "ima-214-directa-guadalupe-san-pedro-ocampo",
    "ima-214-directa-guadalupe-san-pedro-tapia",
    "ima-224-remanente-lomas-valle-condesa", "ima-224-remanente-cometas",
]
NS = {"k": "http://www.opengis.net/kml/2.2"}
catalog_path = ROOT / "data/ima-services.json"
catalog = json.loads(catalog_path.read_text())
for route_id in IDS:
    route = next(row for row in catalog["routes"] if row["id"] == route_id)
    mid = urllib.parse.parse_qs(urllib.parse.urlparse(route["officialUrl"]).query)["mid"][0]
    url = "https://www.google.com/maps/d/kml?mid=" + mid + "&forcekml=1"
    request = urllib.request.Request(url, headers={"User-Agent": "RegioMovil/1.0 public transport data importer"})
    original = urllib.request.urlopen(request, timeout=45).read()
    tree = ET.fromstring(original)
    paths, markers = [], []
    for placemark in tree.findall(".//k:Placemark", NS):
        for line in placemark.findall(".//k:LineString/k:coordinates", NS):
            coordinates = [[round(float(v), 6) for v in pair.split(",")[:2]] for pair in line.text.split()]
            if len(coordinates) >= 2:
                paths.append(coordinates)
        point = placemark.find("k:Point/k:coordinates", NS)
        if point is None:
            continue
        values = {item.attrib["name"]: item.findtext("k:value", default="", namespaces=NS).strip()
                  for item in placemark.findall("k:ExtendedData/k:Data", NS)}
        lng, lat = [round(float(v), 6) for v in point.text.strip().split(",")[:2]]
        marker_id = values.get("FID") or str(len(markers) + 1)
        name = " · ".join(filter(None, [values.get("NOMVIAL"), values.get("CRUCE")]))
        markers.append({"id": marker_id, "name": name or placemark.findtext("k:name", default=marker_id, namespaces=NS),
                        "lat": lat, "lng": lng, "municipality": values.get("MUNICIPIO", ""),
                        "infrastructureStatus": "unknown", "publishedInfrastructureNote": values.get("DESCRIPCIO", "")})
    if not paths or len(markers) < 2:
        raise ValueError("Missing published geometry/stops: " + route_id)
    pack = {"id": route_id, "sourceUrl": url, "verifiedAt": "2026-10-16",
            "coordinates": paths[0], "segments": paths, "additionalPaths": [], "stops": markers,
            "stopOrderVerified": False, "geometryKind": "official-published",
            "originalKmlSha256": hashlib.sha256(original).hexdigest(),
            "notes": ["Geometría y puntos publicados mediante enlace oficial de georreferencia IMA SETME 2024–2025.",
                      "Coordenadas redondeadas a seis decimales. No se interpolaron paradas ni trazos.",
                      "La publicación no certifica vigencia operativa, orden de paradas ni sentido. El planificador excluye marcadores solo PROPUESTA sin EXISTE."]}
    (ROOT / "public/route-packs" / (route_id + ".json")).write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n")
    route["geometryPack"] = route_id
    route["notes"] = list(dict.fromkeys(route.get("notes", []) + ["Recorrido y marcadores oficiales disponibles en el modelo experimental; orden, sentido y operación actual sin verificar."]))
    print(route_id, len(paths), "segments", len(markers), "published points")
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n")
