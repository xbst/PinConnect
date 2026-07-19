"""Regenerate the 7 pinout-design.md screenshots of the visual designer.

Playwright drives the system Chrome against the designer served on a local
port, loads a sample board (image first, then TOML), and captures each panel.
The designer is a fixed dark theme, so shots are taken dark at 2x.

Run from the repository root:

    python tools/designer-screenshots/generate.py BOARD.toml BOARD.png

Both arguments are optional; without them it uses the paths in DEFAULT_TOML /
DEFAULT_PNG below (the maintainer's sample board, which lives outside the
repo). Supply your own board+image to regenerate against different content.

Requires ``playwright`` (``pip install playwright``); it drives the system
Chrome (``channel="chrome"``), so there is no browser download. The designer
loads Roboto from Google Fonts, so this needs network access.
"""
import sys
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parent.parent.parent
ASSETS = REPO / "assets"
PORT = 8090

# Maintainer's sample board (Birds-Nest-CAN), outside the repo. Override by
# passing a board TOML + image on the command line.
DEFAULT_TOML = REPO.parent / "docs-zensical" / "docs" / "pinouts" / "bnc" / "bnc.toml"
DEFAULT_PNG = REPO.parent / "docs-zensical" / "docs" / "pinouts" / "bnc" / "bnc.png"


def main(toml_path: Path, png_path: Path):
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "-d", str(REPO / "pinout_design")],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True)
            page = browser.new_context(viewport={"width": 1440, "height": 900},
                                       device_scale_factor=2, color_scheme="dark").new_page()
            page.goto(f"http://localhost:{PORT}/", wait_until="networkidle")

            # 1. Load the board image only -> board panel before any connectors.
            page.set_input_files("#open-image", str(png_path))
            page.wait_for_selector(".board-canvas img", state="attached")
            page.wait_for_function("document.querySelector('.board-canvas img')?.complete === true")
            page.evaluate("document.fonts.ready")
            time.sleep(0.4)
            page.locator("#panel-board").screenshot(path=str(ASSETS / "workflow-1-image.png"))

            # 2. Load the TOML -> connectors appear over the board.
            page.set_input_files("#open-toml", str(toml_path))
            page.wait_for_function("document.querySelectorAll('.board-overlay g[data-id]').length >= 1")
            time.sleep(0.6)
            page.locator("#panel-board").screenshot(path=str(ASSETS / "workflow-2-connectors.png"))

            # Whole window, toolbar, TOML pane.
            page.screenshot(path=str(ASSETS / "designer-overview.png"))
            page.locator(".toolbar").screenshot(path=str(ASSETS / "workflow-6-save.png"))
            page.locator("#panel-editor").screenshot(path=str(ASSETS / "workflow-5-toml.png"))

            # 3 + 4. Select a two-row connector so the preview + R1/R2 selectors show.
            target = page.evaluate("""() => {
                for (const g of document.querySelectorAll('.board-overlay g[data-id]')) {
                    if (g.getAttribute('data-id') === 'CAN') return 'CAN';
                }
                const first = document.querySelector('.board-overlay g[data-id]');
                return first ? first.getAttribute('data-id') : null;
            }""")
            page.eval_on_selector(f'g[data-id="{target}"] .board-rect',
                                  "el => el.dispatchEvent(new MouseEvent('click', {bubbles:true}))")
            page.wait_for_selector(".conn-form")
            page.wait_for_selector(".pin-list")
            time.sleep(0.4)

            # conn-form clips its tall preview inside the 40%-height panel; grow the
            # panel and hide the pin list so the whole form + preview is captured.
            page.evaluate("""() => {
                const p = document.getElementById('panel-connector');
                p.style.height = '1100px'; p.style.flex = 'none';
                const pl = document.querySelector('.pin-list');
                if (pl) pl.dataset._disp = pl.style.display, pl.style.display = 'none';
            }""")
            time.sleep(0.3)
            page.locator(".conn-form").screenshot(path=str(ASSETS / "workflow-3-connector.png"))

            page.evaluate("""() => {
                const pl = document.querySelector('.pin-list');
                if (pl) pl.style.display = pl.dataset._disp || '';
            }""")
            time.sleep(0.3)
            page.locator(".pin-list").screenshot(path=str(ASSETS / "workflow-4-pins.png"))

            browser.close()
        print("OK - 7 designer screenshots written to assets/")
    finally:
        server.terminate()


if __name__ == "__main__":
    toml_arg = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TOML
    png_arg = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_PNG
    if not toml_arg.exists() or not png_arg.exists():
        sys.exit(f"board not found: {toml_arg} / {png_arg}\n"
                 "Pass a board TOML and image: python tools/designer-screenshots/generate.py BOARD.toml BOARD.png")
    main(toml_arg, png_arg)
