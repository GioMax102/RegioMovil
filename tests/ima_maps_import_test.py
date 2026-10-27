"""Offline validation of the public IMA importer: python3 -m unittest discover -s tests -p '*_test.py'."""
import importlib.util
import pathlib
import unittest

source = pathlib.Path(__file__).resolve().parents[1] / "scripts/import-ima-public-maps.py"
spec = importlib.util.spec_from_file_location("ima_import", source)
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class PublicMapImportTest(unittest.TestCase):
    def test_separate_published_segments_and_markers_keep_their_evidence(self):
        kml = b'''<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
          <Placemark><MultiGeometry>
            <LineString><coordinates>-100.3,25.7,0 -100.31,25.71,0</coordinates></LineString>
            <LineString><coordinates>-100.4,25.8,0 -100.41,25.81,0</coordinates></LineString>
          </MultiGeometry></Placemark>
          <Placemark><name>Original</name><ExtendedData>
            <Data name="FID"><value>EX-1</value></Data>
            <Data name="DESCRIPCIO"><value>PROPUESTA</value></Data>
          </ExtendedData><Point><coordinates>-100.3,25.7</coordinates></Point></Placemark>
          <Placemark><Point><coordinates>-100.41,25.81</coordinates></Point></Placemark>
        </Document></kml>'''
        pack = importer.parse_kml(kml)
        self.assertEqual(len(pack["segments"]), 2)
        self.assertEqual(pack["coordinates"], pack["segments"][0])
        self.assertEqual(pack["segments"][1][0], [-100.4, 25.8])
        self.assertEqual(len(pack["stops"]), 2, "Line vertices must not become invented stops")
        self.assertEqual(pack["stops"][0]["id"], "EX-1")
        self.assertEqual(pack["stops"][0]["publishedInfrastructureNote"], "PROPUESTA")

    def test_missing_stops_and_nonfinite_or_foreign_coordinates_are_rejected(self):
        with self.assertRaises(ValueError):
            importer.parse_kml(b'<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><LineString><coordinates>-100.3,25.7 -100.31,25.71</coordinates></LineString></Placemark></kml>')
        for coordinates in ["NaN,25.7", "-100.3,Infinity", "-99.1,19.4"]:
            with self.subTest(coordinates=coordinates), self.assertRaises(ValueError):
                importer.coordinates(coordinates)
        with self.assertRaisesRegex(ValueError, "declaration"):
            importer.parse_kml(b'<!DOCTYPE foo><kml/>')

    def test_source_matching_preserves_route_numbers_and_variants(self):
        self.assertEqual(importer.name_key("Ruta 98 Remanente Héroes"), importer.name_key("Ruta 98 Héroes"))
        self.assertNotEqual(importer.name_key("Ruta 13 Lincoln"), importer.name_key("Ruta 13 Lincoln Directo"))
        self.assertNotEqual(importer.name_key("Ruta 218 Fleteros"), importer.name_key("Ruta 218 Plutarco E. Calles"))
        self.assertNotEqual(importer.name_key("Ruta 1 Pilares"), importer.name_key("Ruta 41 Pilares"))

    def test_only_explicit_public_google_map_ids_are_accepted(self):
        self.assertEqual(importer.map_id("https://www.google.com/maps/d/embed?mid=1kxV4Il37bIzxlYT9_DS-ppuoJxHRq-Q"), "1kxV4Il37bIzxlYT9_DS-ppuoJxHRq-Q")
        for url in ["https://google.example/maps/d/?mid=1kxV4Il37bIzxlYT9_DS-ppuoJxHRq-Q", "https://www.google.com/maps/?mid=private", "javascript:alert(1)"]:
            self.assertIsNone(importer.map_id(url))


if __name__ == "__main__":
    unittest.main()
