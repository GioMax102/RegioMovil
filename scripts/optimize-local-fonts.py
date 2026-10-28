"""Regenerate checked-in WOFF2 files; optional tooling, not a build dependency.

python -m pip install fonttools==4.65.0 brotli==1.2.1
python scripts/optimize-local-fonts.py

Retains every character, hint and layout feature. Only the unused weight ranges
100–299/751–900 and desktop style-menu metadata are removed. All app CSS uses
weights 300–750. Hmtx transformation is part of the WOFF2 format.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData
from fontTools.varLib.instancer import instantiateVariableFont
from shutil import copyfile

root = Path(__file__).resolve().parents[1]
destination = root / 'src/assets/fonts'
destination.mkdir(exist_ok=True)
for family in ('inter', 'montserrat'):
    package = root / 'node_modules/@fontsource-variable' / family
    source = TTFont(package / 'files' / f'{family}-latin-wght-normal.woff2', recalcTimestamp=False)
    cmap = source.getBestCmap()
    font = instantiateVariableFont(source, {'wght': (300, 750)}, inplace=True)
    assert font.getBestCmap() == cmap
    # CSS names this font explicitly; platform style-menu metadata isn't used.
    if 'STAT' in font:
        del font['STAT']
    keep = {0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17, 25}
    keep.update(axis.axisNameID for axis in font['fvar'].axes)
    keep.update(instance.subfamilyNameID for instance in font['fvar'].instances)
    font['name'].names = [name for name in font['name'].names if name.nameID in keep]
    font.flavorData = WOFF2FlavorData(transformedTables={'glyf', 'loca', 'hmtx'})
    path = destination / f'{family}-latin-300-750.woff2'
    font.save(path)
    copyfile(package / 'LICENSE', destination / f'{family}-LICENSE.txt')
    print(f'{family}: {path.stat().st_size} bytes; same character map, weights 300–750.')
