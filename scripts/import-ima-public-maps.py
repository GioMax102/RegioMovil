"""Manually import all documented IMA My Maps with public source provenance.

Usage: python3 scripts/import-ima-public-maps.py --verified-at YYYY-MM-DD
Ordinary builds use the committed snapshots and never access the network.
The SETME CSV is ODC-By; linked KMLs have no explicit license found.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import html
import json
import math
import pathlib
import re
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
NS = {"k": "http://www.opengis.net/kml/2.2"}
INDEX = "https://www.imanuevoleon.mx/rutasurbanas"
DATASET = "https://catalogodatos.nl.gob.mx/dataset/2024_2025_tpe_publico_setme"
LIMIT = 8 * 1024 * 1024


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(path)


def download(url):
    if urllib.parse.urlparse(url).scheme != "https":
        raise ValueError("Source must use HTTPS")
    request = urllib.request.Request(url, headers={"User-Agent": "RegioMovil/1.1 public transport data importer"})
    with urllib.request.urlopen(request, timeout=35) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError("Source exceeds 8 MiB download limit")
    return data


def name_key(value):
    text = unicodedata.normalize("NFD", value.lower()).encode("ascii", "ignore").decode()
    words = re.sub(r"[^a-z0-9]+", " ", text).split()
    # The portal sometimes omits the administrative word Remanente; retain
    # every code, endpoint and variant token. No fuzzy route substitution.
    return " ".join(word for word in words if word not in {"ruta", "remanente"})


def map_id(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.hostname not in {"www.google.com", "google.com"} or not parsed.path.startswith("/maps/d/"):
        return None
    value = urllib.parse.parse_qs(parsed.query).get("mid", [""])[0]
    return value if re.fullmatch(r"[-A-Za-z0-9_]{15,100}", value) else None


def expected_name(route):
    key = name_key(route["name"])
    if route["id"] == "ima-1-directa-pilares-central-de-autobuses":
        key = name_key("Ruta Directa Pilares - Central de Autobuses")
    return key


def discover(route, index, browser_evidence):
    key = expected_name(route)
    page = index.get(key)
    base = {"id": route["id"], "sourceUrl": route.get("officialUrl") or INDEX}
    if not page:
        return {**base, "status": "pending", "reason": "no-matching-official-map-page"}
    if urllib.parse.urlparse(page["officialPageUrl"]).hostname != "www.imanuevoleon.mx":
        return {**base, "status": "pending", "reason": "official-index-link-outside-ima"}
    base.update(page)
    base["sourceUrl"] = page["officialPageUrl"]
    original = download(page["officialPageUrl"])
    base["officialPageSha256"] = hashlib.sha256(original).hexdigest()
    embed_urls = set()
    visible = browser_evidence.get(route["id"])
    if visible:
        if visible["officialPageUrl"] != page["officialPageUrl"]:
            return {**base, "status": "pending", "reason": "official-page-url-changed-since-browser-audit"}
        base["renderedHeading"] = visible["renderedHeading"]
        if name_key(visible["renderedHeading"]) != key:
            return {**base, "status": "pending", "reason": "official-page-identity-mismatch"}
        if not visible.get("embedUrl"):
            return {**base, "status": "pending", "reason": "official-page-without-map-embed"}
        if urllib.parse.urlparse(visible["embedUrl"]).hostname != "www-imanuevoleon-mx.filesusr.com":
            raise ValueError("Unexpected public embed host")
        embed_urls.add(visible["embedUrl"])
    feature_urls = [] if visible else re.findall(r'<link[^>]+href="([^"]+)"[^>]+id="features_[^"]+"', original.decode())
    for url in feature_urls:
        # Do not html.unescape bare query strings (&reg becomes a character).
        url = url.replace("&amp;", "&")
        if urllib.parse.urlparse(url).hostname != "siteassets.parastorage.com":
            continue
        resource = download(url).decode().replace("\\/", "/")
        embed_urls.update(re.findall(r'https://www-imanuevoleon-mx\.filesusr\.com/html/[^"\s<>]+', resource))
    found = set()
    for url in sorted(embed_urls):
        embedded = download(url).decode()
        for iframe in re.findall(r'<iframe[^>]+src=["\']([^"\']+)', embedded):
            mid = map_id(html.unescape(iframe))
            if mid:
                found.add(mid)
    if len(found) != 1:
        return {**base, "status": "pending", "reason": "no-unique-public-map-embed", "mapIds": sorted(found)}
    return {**base, "mapId": found.pop(), "publicEmbedUrls": sorted(embed_urls)}


def coordinates(value):
    result = []
    for point in (value or "").split():
        lng, lat = [round(float(v), 6) for v in point.split(",")[:2]]
        if not math.isfinite(lng + lat) or not (-100.9 <= lng <= -99.8 and 25.35 <= lat <= 26.1):
            raise ValueError("Published coordinate outside documented ZMM bounds")
        result.append([lng, lat])
    return result


def parse_kml(original):
    if b"<!DOCTYPE" in original.upper() or b"<!ENTITY" in original.upper():
        raise ValueError("Unsupported KML declaration")
    tree = ET.fromstring(original)
    paths, markers, seen_ids = [], [], set()
    for placemark in tree.findall(".//k:Placemark", NS):
        for line in placemark.findall(".//k:LineString/k:coordinates", NS):
            path = coordinates(line.text)
            if len(path) >= 2:
                paths.append(path)
        point = placemark.find(".//k:Point/k:coordinates", NS)
        if point is None:
            continue
        locations = coordinates(point.text)
        if len(locations) != 1:
            raise ValueError("Invalid published stop coordinate")
        lng, lat = locations[0]
        fields = {item.attrib["name"]: item.findtext("k:value", default="", namespaces=NS).strip()
                  for item in placemark.findall("k:ExtendedData/k:Data", NS)}
        marker_id = fields.get("FID") or str(len(markers) + 1)
        if marker_id in seen_ids:
            marker_id += ":" + str(len(markers) + 1)
        seen_ids.add(marker_id)
        name = " · ".join(filter(None, [fields.get("NOMVIAL"), fields.get("CRUCE")]))
        markers.append({"id": marker_id, "name": name or placemark.findtext("k:name", default=marker_id, namespaces=NS),
                        "lat": lat, "lng": lng, "municipality": fields.get("MUNICIPIO", ""),
                        "infrastructureStatus": "unknown", "publishedInfrastructureNote": fields.get("DESCRIPCIO", "")})
    if not paths or len(markers) < 2:
        raise ValueError("Insufficient published paths or stops")
    return {"coordinates": paths[0], "segments": paths, "stops": markers,
            "mapTitle": tree.findtext("k:Document/k:name", default="", namespaces=NS)}


def import_map(item):
    mid, sources = item
    url = "https://www.google.com/maps/d/kml?mid=" + mid + "&forcekml=1"
    try:
        original = download(url)
        return sources, {**parse_kml(original), "sourceUrl": url,
                         "originalKmlSha256": hashlib.sha256(original).hexdigest()}, None
    except Exception as error:
        return sources, None, {"reason": "source-download-or-validation-failed", "sourceUrl": url, "detail": str(error)[:350]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verified-at", default=datetime.date.today().isoformat())
    parser.add_argument("--concurrency", type=int, default=4, choices=range(1, 7))
    args = parser.parse_args()
    datetime.date.fromisoformat(args.verified_at)
    catalog_path = ROOT / "data/ima-services.json"
    catalog = json.loads(catalog_path.read_text())
    merged = json.loads((ROOT / "data/transit-catalog.json").read_text())
    # User-authorized experimental planning uses the same bounded projection
    # rules for new maps and the older five consultation-only packages.
    candidates = [r for r in catalog["routes"] if r.get("catalogEligible") is not False and
                  (not r.get("geometryPack") or json.loads((ROOT / "public/route-packs" /
                   (r["geometryPack"] + ".json")).read_text()).get("experimentalRouting") is False)]
    by_id = {r["id"]: r for r in catalog["routes"]}
    index = {}
    for block in download(INDEX).decode().split('role="listitem"')[1:]:
        title = re.search(r"<h3\b[^>]*>(.*?)</h3>", block, re.S)
        link = re.search(r'<a\b[^>]*href="([^"]+)"', block)
        if title and link:
            name = html.unescape(re.sub(r"<[^>]+>", "", title[1])).strip()
            index[name_key(name)] = {"officialPageTitle": name, "officialPageUrl": html.unescape(link[1])}
    manifest_path = ROOT / "data/ima-map-sources.json"
    browser_path = ROOT / "data/ima-map-browser-evidence.json"
    browser_evidence = {row["id"]: row for row in json.loads(browser_path.read_text())["routes"]} if browser_path.exists() else {}
    prior = json.loads(manifest_path.read_text()).get("routes", []) if manifest_path.exists() else []
    outcomes = {row["id"]: row for row in prior}
    maps = defaultdict(list)
    discovery = []
    for route in candidates:
        mid = map_id(route.get("officialUrl", ""))
        if mid:
            maps[mid].append({"id": route["id"], "mapId": mid, "sourceUrl": route["officialUrl"], "referenceDatasetUrl": DATASET})
        else:
            discovery.append(route)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        jobs = {pool.submit(discover, route, index, browser_evidence): route for route in discovery}
        for job in concurrent.futures.as_completed(jobs):
            route = jobs[job]
            try:
                source = job.result()
                if source.get("mapId"):
                    maps[source["mapId"]].append(source)
                else:
                    outcomes[route["id"]] = source
            except Exception as error:
                outcomes[route["id"]] = {"id": route["id"], "status": "pending", "reason": "official-page-download-failed",
                                         "sourceUrl": index.get(expected_name(route), {}).get("officialPageUrl", route.get("officialUrl") or INDEX), "detail": str(error)[:350]}
    source_id = "ima-public-maps-" + args.verified_at.replace("-", "")
    imported = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        items = sorted(maps.items(), key=lambda item: not any(by_id[s["id"]]["networkId"] == "troncales-integradas" for s in item[1]))
        for sources, parsed, failure in pool.map(import_map, items):
            shared_ids = sorted(s["id"] for s in sources)
            for source in sources:
                route = by_id[source["id"]]
                if failure:
                    outcomes[route["id"]] = {**source, **failure, "status": "pending"}
                    print(route["id"], failure["detail"], flush=True)
                    continue
                notes = ["Trazo y marcadores publicados mediante referencia oficial IMA; consulta " + args.verified_at + ".",
                         "Coordenadas redondeadas a seis decimales. Segmentos separados; sin interpolar trazos ni paradas.",
                         "Modelo experimental: orden, sentido, operación actual y accesibilidad sin verificar.",
                         "El CSV SETME declara ODC-By; no se encontró licencia explícita para los KML enlazados."]
                if len(shared_ids) > 1:
                    notes.append("La referencia oficial comparte mapa entre variantes. No se afirma que tengan trazos distintos: " + ", ".join(shared_ids) + ".")
                pack = {"id": route["id"], **parsed, "verifiedAt": args.verified_at, "additionalPaths": [],
                        "stopOrderVerified": False, "experimentalRouting": True,
                        "geometryKind": "official-published", "license": "not-specified",
                        "officialReferenceUrl": source["sourceUrl"], "officialPageUrl": source.get("officialPageUrl", INDEX),
                        "officialPageTitle": source.get("officialPageTitle"), "officialPageSha256": source.get("officialPageSha256"),
                        "referenceDatasetUrl": source.get("referenceDatasetUrl"), "sharedOfficialMapRouteIds": shared_ids, "notes": notes}
                write_json(ROOT / "public/route-packs" / (route["id"] + ".json"), pack)
                route["geometryPack"] = route["id"]
                route["planningEligible"] = False
                route["officialUrl"] = source.get("officialPageUrl", route.get("officialUrl"))
                route["sourceIds"] = list(dict.fromkeys(route.get("sourceIds", []) + [source_id]))
                previous_notes = [note for note in route.get("notes", []) if not
                                  ("Mapa oficial importado para consulta" in note and "fuera del grafo experimental" in note)]
                route["notes"] = list(dict.fromkeys(previous_notes + notes[:3] + notes[4:]))
                route["municipalities"] = sorted(set(route.get("municipalities", []) + [s["municipality"] for s in parsed["stops"] if s["municipality"]]))
                outcomes[route["id"]] = {**source, "status": "imported", "verifiedAt": args.verified_at,
                    "geometryPack": route["id"], "segments": len(parsed["segments"]), "publishedPoints": len(parsed["stops"]),
                    "vertices": sum(map(len, parsed["segments"])), "originalKmlSha256": parsed["originalKmlSha256"],
                    "license": "not-specified", "sharedOfficialMapRouteIds": shared_ids}
                imported += 1
                print(route["id"], len(parsed["segments"]), "segments", len(parsed["stops"]), "published points", flush=True)
    catalog["sources"] = [s for s in catalog["sources"] if s["id"] != source_id] + [{
        "id": source_id, "title": "IMA · Mapas públicos de rutas urbanas e integradas", "url": INDEX,
        "publisher": "Instituto de Movilidad y Accesibilidad / Gobierno de Nuevo León", "verifiedAt": args.verified_at,
        "publishedAt": None, "license": "not-specified",
        "scope": "My Maps referenciados por SETME o embebidos en páginas oficiales IMA. ODC-By cubre el CSV de referencias; no se atribuye esa licencia a los KML. Sin certificar operación actual, sentidos ni accesibilidad."}]
    catalog["verifiedAt"] = args.verified_at
    write_json(catalog_path, catalog)
    write_json(manifest_path, {"version": 1, "verifiedAt": args.verified_at, "officialPageUrl": INDEX,
                              "referenceDatasetUrl": DATASET, "routes": sorted(outcomes.values(), key=lambda r: r["id"])})
    coverage = []
    for route in merged["routes"]:
        if route["mode"] != "bus":
            continue
        pack = by_id.get(route["id"], route).get("geometryPack")
        outcome = outcomes.get(route["id"], {"id": route["id"], "status": "available-local" if pack else "pending",
            "geometryPack": pack, "sourceUrl": route.get("officialUrl"),
            **({} if pack else {"reason": "no-geometric-source-documented"})})
        coverage.append({**outcome, "networkId": route["networkId"], "name": route["name"]})
    pending = sum(r["status"] == "pending" for r in coverage)
    write_json(ROOT / "data/route-geometry-coverage.json", {"version": 1, "verifiedAt": args.verified_at,
        "catalogBusRoutes": len(coverage), "availableGeometryRoutes": len(coverage) - pending, "pendingGeometryRoutes": pending,
        "notes": ["Falta de paquete local no equivale a ausencia de fuente pública. Cada pendiente conserva URL y causa.",
                  "Metro se contabiliza aparte. Orden de autobuses inferido en el planificador experimental."],
        "routes": sorted(coverage, key=lambda r: r["id"])})
    print("Imported", imported, "new route packages; pending", pending, flush=True)


if __name__ == "__main__":
    main()
