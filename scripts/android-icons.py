"""Regenera los iconos locales sin servicios remotos. Requiere Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android/app/src/main/res"
GREEN = "#006B50"
WHITE = "#FFFFFF"
LIME = "#D3DF80"

def icon(size, foreground=False, round_icon=False):
    scale = 4
    canvas = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    k = size * scale / 108
    def p(points): return [(round(x * k), round(y * k)) for x, y in points]
    def line(points, fill, width):
        coords = p(points)
        draw.line(coords, fill=fill, width=round(width * k), joint="curve")
        radius = width * k / 2
        for x, y in [coords[0], coords[-1]]:
            draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=fill)
    if not foreground:
        bounds = (0, 0, size * scale - 1, size * scale - 1)
        if round_icon: draw.ellipse(bounds, fill=GREEN)
        else: draw.rounded_rectangle(bounds, radius=24 * k, fill=GREEN)
    line([(28, 57), (43, 36), (53, 48), (61, 41), (80, 57)], WHITE, 4.6)
    line([(33, 66), (66, 66), (71, 68), (73, 72), (71, 76), (66, 78), (51, 78)], WHITE, 4.6)
    for x, y in [(33, 66), (51, 78)]:
        draw.ellipse(((x-4.5)*k, (y-4.5)*k, (x+4.5)*k, (y+4.5)*k), fill=LIME)
    return canvas.resize((size, size), Image.LANCZOS)

for density, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    dest = RES / f"mipmap-{density}"
    dest.mkdir(parents=True, exist_ok=True)
    icon(size).save(dest / "ic_launcher.png", optimize=True)
    icon(size, round_icon=True).save(dest / "ic_launcher_round.png", optimize=True)
    icon(round(size * 108 / 48), foreground=True).save(dest / "ic_launcher_foreground.png", optimize=True)

public = ROOT / "public"
public.mkdir(exist_ok=True)
for size in (192, 512):
    icon(size).save(public / f"icon-{size}.png", optimize=True)

vector = '''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:pathData="M28,57L43,36L53,48L61,41L80,57"
        android:strokeColor="#FFFFFF" android:strokeWidth="4.6"
        android:strokeLineCap="round" android:strokeLineJoin="round"
        android:fillColor="#00000000" />
    <path android:pathData="M33,66H66C75,66 75,78 66,78H51"
        android:strokeColor="#FFFFFF" android:strokeWidth="4.6"
        android:strokeLineCap="round" android:fillColor="#00000000" />
    <path android:pathData="M28.5,66a4.5,4.5 0,1 1,9 0a4.5,4.5 0,1 1,-9 0M46.5,78a4.5,4.5 0,1 1,9 0a4.5,4.5 0,1 1,-9 0"
        android:fillColor="#D3DF80" />
</vector>
'''
(RES / "drawable-v24/ic_launcher_foreground.xml").write_text(vector)
(RES / "drawable/ic_launcher_background.xml").write_text('''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#006B50" />
</shape>
''')
(RES / "values/ic_launcher_background.xml").write_text('''<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#006B50</color></resources>
''')
adaptive = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
'''
for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
    (RES / "mipmap-anydpi-v26" / name).write_text(adaptive)
for template_splash in RES.rglob("splash.png"):
    template_splash.unlink()
print("Iconos Android y web generados.")
