"""Regenerate the jumper settings doc images from the sample board here.

  - assets/jumper-shapes.webp     — six pinned tooltips, one per common header
                                    shape, each showing one setting
                                    (docs/reference/board-toml.md)
  - assets/workflow-jumpers.png   — the designer's connector editor in pick mode
                                    for the fan voltage selector (docs/designer.md)

Both come from sample.toml beside this script, so no board outside the repo is
needed. The tooltips are the generator's real page, rendered with pinout-gen and
opened in the system Chrome; the designer shot drives the real designer.

Run from the repository root:

    python tools/jumper-gallery/generate.py

Requires ``playwright`` and ``pillow`` (``pip install playwright pillow``).
Playwright drives the system Chrome (``channel="chrome"``), so there is no
browser download. The page and the designer load Roboto from Google Fonts and
the designer loads Pyodide from a CDN, so this needs network access.
"""
import sys
import tempfile
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
ASSETS = REPO / "assets"
SAMPLE = HERE / "sample.toml"
sys.path.insert(0, str(REPO / "pinout_gen"))

from pinout_gen.config import Theme, load_all_connector_types, load_board  # noqa: E402
from pinout_gen.renderer import generate_html  # noqa: E402

# Gallery order and the setting each card shows (indexes into the connector's
# settings), picked so every card has at least one jumper fitted.
SHAPES = [("TERM", [0]), ("BOOT", [1]), ("FANV", [1]), ("MSTEP", [3]), ("ROUTE", [1]), ("CFG", [0])]
COLS = 3
GAP = 28            # px between cards, at 1x
BG = (19, 19, 19)   # the default theme's dark page background

# The designer shot: the fan voltage selector, picking jumpers for "12V".
DESIGNER_CONNECTOR = "FANV"
DESIGNER_PICK = 1


def _page(tmp: Path) -> Path:
    """The sample's generated page, beside a plain board image."""
    board = load_board(SAMPLE)
    types = load_all_connector_types(board, SAMPLE)
    theme = Theme()
    # Natural size: otherwise each drawing is scaled to its hotspot's size on
    # screen, and the cards would differ only because their boxes do.
    theme.behavior.tooltip_box_scale = 0
    # The page's own background color, so a card's rounded corners blend in.
    Image.new("RGB", (board.width, board.height), BG).save(tmp / board.image)
    out = tmp / "sample.pinout.html"
    out.write_text(generate_html(board, types, theme=theme), encoding="utf-8")
    return out


def shapes(browser, tmp: Path):
    page = browser.new_context(viewport={"width": 1600, "height": 1100}, device_scale_factor=2,
                               color_scheme="dark").new_page()
    page.goto(_page(tmp).as_uri() + "?theme=dark", wait_until="networkidle")
    page.evaluate("document.fonts.ready")
    tiles = []
    for cid, picks in SHAPES:
        # A click pins the tooltip, and only a pinned tooltip's buttons respond.
        page.evaluate("id => [...document.querySelectorAll('.hs')].find(e => e.dataset.id === id)"
                      ".dispatchEvent(new MouseEvent('click', {bubbles: true}))", cid)
        page.wait_for_selector("#tt.vis.pin")
        for s in picks:
            page.locator(f"#tt .tt-jc[data-s='{s}']").click()
        page.mouse.move(2, 2)   # off the buttons, so no hover preview or hover tint
        time.sleep(0.3)
        path = tmp / f"{cid}.png"
        page.locator("#tt").screenshot(path=str(path))
        tiles.append(Image.open(path).convert("RGB"))
        page.evaluate("document.querySelector('#tt .tt-x').click()")
        page.wait_for_selector("#tt.off", state="attached")

    # Grid: every card in a row shares that row's height, top-aligned.
    gap = GAP * 2
    rows = [tiles[i:i + COLS] for i in range(0, len(tiles), COLS)]
    col_w = [max(r[c].width for r in rows if c < len(r)) for c in range(COLS)]
    width = sum(col_w) + gap * (COLS + 1)
    height = sum(max(t.height for t in r) for r in rows) + gap * (len(rows) + 1)
    sheet = Image.new("RGB", (width, height), BG)
    y = gap
    for r in rows:
        x = gap
        for c, t in enumerate(r):
            sheet.paste(t, (x + (col_w[c] - t.width) // 2, y))
            x += col_w[c] + gap
        y += max(t.height for t in r) + gap
    sheet = sheet.resize((1600, round(sheet.height * 1600 / sheet.width)), Image.LANCZOS)
    out = ASSETS / "jumper-shapes.webp"
    sheet.save(out, quality=92, method=6)
    print(f"  -> {out.relative_to(REPO)}  {sheet.size[0]}x{sheet.size[1]}  {out.stat().st_size // 1024}KB")


def designer(browser):
    # The designer fetches its Python payload at startup and will not draw
    # without it, so build it before serving.
    from pinout_gen.designer import build_payload
    build_payload(REPO / "pinout_design" / "pinout_gen.zip")
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = partial(Quiet, directory=str(REPO / "pinout_design"))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    Thread(target=server.serve_forever, daemon=True).start()
    tmp = tempfile.TemporaryDirectory()
    try:
        page = browser.new_context(viewport={"width": 1440, "height": 1100}, device_scale_factor=2,
                                   color_scheme="dark").new_page()
        page.goto(f"http://127.0.0.1:{server.server_port}/", wait_until="networkidle")
        page.wait_for_function("document.getElementById('runtime-status')"
                               "?.classList.contains('ready') === true", timeout=120_000)
        page.evaluate("document.querySelector('.modal-close')?.click()")
        page.set_input_files("#open-toml", str(SAMPLE))
        page.wait_for_selector(f".connector-list-row[data-id='{DESIGNER_CONNECTOR}']")
        page.locator(f".connector-list-row[data-id='{DESIGNER_CONNECTOR}']").click()
        page.wait_for_selector(".setting-card")
        # A connector editor a little taller than the default, as after
        # dragging the divider up: the drawing grows with it (to half the
        # panel's height), which is what pick mode is for.
        page.evaluate("""() => {
            const b = document.getElementById('panel-board'), c = document.getElementById('panel-connector');
            b.style.height = '300px'; b.style.flex = 'none';
            c.style.height = 'auto'; c.style.flex = '1 1 0';
        }""")
        page.locator(f".setting-card[data-sidx='{DESIGNER_PICK}'] .setting-pick-btn").click()
        page.wait_for_selector(".pick-hit", state="attached")   # transparent until hovered
        page.mouse.move(2, 2)
        page.evaluate("document.fonts.ready")
        time.sleep(0.5)
        # The drawing in pick mode, then the settings cards, each scrolled into
        # view in turn (the editor scrolls) and stacked into one image. The pin
        # list between them is left out: pick mode numbers the pins itself.
        parts = []
        for sel, block in ((".conn-svg-preview", "start"), (".setting-list", "end")):
            box = page.evaluate("""([sel, block]) => {
                const el = document.querySelector(sel);
                el.scrollIntoView({block});
                const r = el.getBoundingClientRect();
                return {x: r.left - 10, y: r.top - 2, width: r.width + 20, height: r.height + 12};
            }""", [sel, block])
            time.sleep(0.2)
            shot = Path(tmp.name) / f"part{len(parts)}.png"
            page.screenshot(path=str(shot), clip=box)
            parts.append(Image.open(shot).convert("RGB"))
        width = max(p.width for p in parts)
        sheet = Image.new("RGB", (width, sum(p.height for p in parts)), BG)
        y = 0
        for p in parts:
            sheet.paste(p, (0, y))
            y += p.height
        out = ASSETS / "workflow-jumpers.png"
        sheet.save(out, optimize=True)
        print(f"  -> {out.relative_to(REPO)}  {sheet.size[0]}x{sheet.size[1]}  {out.stat().st_size // 1024}KB")
    finally:
        server.shutdown()
        tmp.cleanup()


def main():
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        shapes(browser, Path(tmp))
        designer(browser)
        browser.close()


if __name__ == "__main__":
    main()
