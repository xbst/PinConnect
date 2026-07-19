"""Generate the connector-type gallery and the label-style comparison images.

Both are produced from pinout_gen's own ``render_connector_svg`` — the exact
drawing the generator emits — laid out as dark grid cards and rasterized with
Playwright, so the docs never drift from the renderer.

Outputs (into ``assets/``):
  - connector-gallery.webp  — every bundled type, one card each (connector-types.md)
  - label-styles.webp       — one header under staggered/staircase/flat (board-toml.md)

Run from the repository root:

    python tools/connector-gallery/generate.py

Requires ``playwright`` and ``pillow`` (``pip install playwright pillow``);
Playwright drives the system Chrome (``channel="chrome"``), no download needed.
"""
import sys
import html
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright
from PIL import Image

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "pinout_gen"))
from pinout_gen.config import load_connector_type, Connector, Pin, _DEFAULT_COLORS_DARK
from pinout_gen.renderer import render_connector_svg

CONN_DIR = REPO / "pinout_gen" / "pinout_gen" / "connectors"
ASSETS = REPO / "assets"

# Grouped by family so the gallery reads sensibly rather than alphabetically.
GALLERY_ORDER = ["XH-F", "PH-F", "MX-F-1R", "MX-F-2R", "SHERLOCK-F",
                 "HDR-127", "HDR-200", "HDR-254",
                 "ST-254", "ST-508", "ST-BR-508", "ST-BR-950",
                 "XT30-2+2", "slide-switch", "button", "USB-C"]
PALETTE = ["#E74C3C", "#F39C12", "#2ECC71", "#3498DB", "#9B59B6", "#1ABC9C"]
# Location markers read best with no pins (the docs say to leave pins off these).
NO_PINS = {"USB-C", "button"}

_VARS = ";".join(f"--{k}:{v}" for k, v in _DEFAULT_COLORS_DARK.items())
_FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
          '<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600'
          '&family=Roboto+Mono:wght@500&display=swap" rel="stylesheet">')


def _page(cards_html, cols):
    return f"""<!doctype html><html><head><meta charset="utf-8">{_FONTS}
<style>
  :root{{{_VARS};--label-font:Roboto}}
  *{{box-sizing:border-box;margin:0}}
  body{{background:var(--bg);font-family:Roboto,sans-serif;padding:28px}}
  .grid{{display:grid;grid-template-columns:repeat({cols},1fr);gap:18px;max-width:1180px;margin:auto}}
  .card{{background:#1b1b1b;border:1px solid var(--divider);border-radius:12px;
         padding:16px 14px 12px;display:flex;flex-direction:column;align-items:center}}
  .art{{height:{'210' if cols == 3 else '150'}px;width:100%;display:flex;align-items:center;justify-content:center}}
  .art svg{{max-width:100%;max-height:{'210' if cols == 3 else '150'}px;width:auto;height:auto}}
  figcaption{{margin-top:12px;text-align:center;line-height:1.35}}
  .nm{{display:block;font-family:'Roboto Mono',monospace;font-weight:500;font-size:14px;color:var(--text)}}
  .st{{display:block;font-size:12px;color:var(--type-color)}}
</style></head><body><div class="grid">{cards_html}</div></body></html>"""


def _pins_for(geo):
    """A small, representative pin set colored from the palette."""
    if geo.row2_pin_pitch_y > 0:      # XT30-2+2: 2 power + 2 vertical signal
        spec = [(1, 2), (2, 2)]
    elif geo.rows >= 2:               # two-row grid: 3 over 3
        spec = [(1, 3), (2, 3)]
    else:
        spec = [(1, 4)]
    pins, k = [], 0
    for row, count in spec:
        for _ in range(count):
            pins.append(Pin(name="", color=PALETTE[k % len(PALETTE)], row=row))
            k += 1
    return pins


def _svg(type_name, ct, pins, label_style="staggered"):
    conn = Connector(id=type_name, name="", type=type_name, pins=pins,
                     x1=0, y1=0, x2=100, y2=100, label_style=label_style)
    return render_connector_svg(conn, ct)


def build_gallery():
    cards = []
    for name in GALLERY_ORDER:
        ct = load_connector_type(CONN_DIR / f"{name}.toml")
        pins = [] if name in NO_PINS else _pins_for(ct.geometry)
        cards.append(
            f'<figure class="card"><div class="art">{_svg(name, ct, pins)}</div>'
            f'<figcaption><span class="nm">{html.escape(name)}</span>'
            f'<span class="st">{html.escape(ct.style)}</span></figcaption></figure>')
        print(f"  gallery: {name} ({ct.style})")
    return _page("\n".join(cards), cols=4)


def build_label_styles():
    ct = load_connector_type(CONN_DIR / "HDR-254.toml")
    names = ["GND", "5V", "TX0", "RX0", "SDA", "SCL", "EN", "3V3"]
    colors = ["#2C3E50", "#E74C3C", "#F39C12", "#F39C12", "#2ECC71", "#2ECC71", "#3498DB", "#E74C3C"]
    cards = []
    for style in ("staggered", "staircase", "flat"):
        pins = [Pin(name=n, color=c) for n, c in zip(names, colors)]
        cards.append(
            f'<figure class="card"><div class="art">{_svg("HDR-254", ct, pins, style)}</div>'
            f'<figcaption><span class="nm">{style}</span></figcaption></figure>')
        print(f"  label-styles: {style}")
    return _page("\n".join(cards), cols=3)


def shoot(page_html, out_webp, viewport_h, tmp):
    html_path = tmp / "page.html"
    html_path.write_text(page_html, encoding="utf-8")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        page = browser.new_context(viewport={"width": 1240, "height": viewport_h},
                                   device_scale_factor=2, color_scheme="dark").new_page()
        page.goto(html_path.as_uri(), wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(500)
        png = tmp / "shot.png"
        page.locator(".grid").screenshot(path=str(png))
        browser.close()
    im = Image.open(png)
    im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    im.save(out_webp, quality=92, method=6)
    print(f"  -> {out_webp.relative_to(REPO)}  {im.size[0]}x{im.size[1]}  {out_webp.stat().st_size // 1024}KB")


def main():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        shoot(build_gallery(), ASSETS / "connector-gallery.webp", 900, tmp)
        shoot(build_label_styles(), ASSETS / "label-styles.webp", 400, tmp)
    print("OK")


if __name__ == "__main__":
    main()
