"""Regenerate the bundled-theme gallery images for themes.md.

For each bundled theme, generate the sample board with that theme, open it in
the system Chrome (light and dark), open the connector list and pin one
tooltip so a single frame shows nearly every theme token — list, symbols,
tooltip, connector housing, pin labels, active-item highlight — then save a
trimmed WebP.

Outputs ``assets/theme-<name>-{light,dark}.webp`` for default/slate/ocean/
terminal/midnight.

Run from the repository root:

    python tools/theme-gallery/generate.py BOARD.toml BOARD.png

Both arguments are optional; without them it uses the maintainer's sample
board (outside the repo). Supply your own board+image to shoot different
content. Requires ``playwright`` and ``pillow``; Playwright drives the system
Chrome (``channel="chrome"``), so there is no browser download. The pinouts
load their fonts from Google Fonts, so this needs network access.
"""
import socket
import sys
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from PIL import Image

REPO = Path(__file__).resolve().parent.parent.parent
ASSETS = REPO / "assets"
THEMES = ["default", "slate", "ocean", "terminal", "midnight"]
PIN_ID = "FS1"          # a connector that exists on the sample board; pinned for its tooltip


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

DEFAULT_TOML = REPO.parent / "docs-zensical" / "docs" / "pinouts" / "bnc" / "bnc.toml"
DEFAULT_PNG = REPO.parent / "docs-zensical" / "docs" / "pinouts" / "bnc" / "bnc.png"


def generate_pinouts(toml_path: Path, png_path: Path, work: Path):
    """pinout-gen the board under each theme into `work`, image copied alongside."""
    shutil.copy(png_path, work / png_path.name)
    for theme in THEMES:
        out = work / f"{theme}.html"
        subprocess.run([sys.executable, "-m", "pinout_gen.cli", str(toml_path),
                        "-o", str(out), "-t", theme],
                       cwd=str(REPO / "pinout_gen"), check=True,
                       stdout=subprocess.DEVNULL)
        print(f"  generated {theme}.html")


def shoot(work: Path):
    port = free_port()
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "-d", str(work)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True)
            for theme in THEMES:
                # ocean always stacks (sidebar_stack_breakpoint huge), so its list
                # falls below the board -> capture the full page instead of a crop.
                stacked = theme == "ocean"
                for scheme in ("light", "dark"):
                    ctx = browser.new_context(
                        viewport={"width": 1200, "height": 1997 if stacked else 760},
                        device_scale_factor=2, color_scheme=scheme)
                    page = ctx.new_page()
                    page.goto(f"http://localhost:{port}/{theme}.html?theme={scheme}",
                              wait_until="networkidle")
                    page.wait_for_function("document.querySelector('.pw img')?.complete === true")
                    page.evaluate("document.fonts.ready")
                    # Open the connector list if it starts collapsed.
                    page.evaluate("""() => {
                        const sb = document.querySelector('#sb');
                        if (sb && sb.classList.contains('hid'))
                            document.querySelector('#sb-btn')?.click();
                    }""")
                    time.sleep(0.4)
                    page.eval_on_selector(f'.hs[data-id="{PIN_ID}"]',
                                          "el => el.dispatchEvent(new MouseEvent('click', {bubbles:true}))")
                    time.sleep(0.5)
                    out = ASSETS / f"theme-{theme}-{scheme}.webp"
                    png = work / f"shot-{theme}-{scheme}.png"
                    page.screenshot(path=str(png), full_page=stacked)
                    ctx.close()
                    im = Image.open(png)
                    im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
                    im.save(out, quality=92, method=6)
                    print(f"  -> {out.name}  {im.size[0]}x{im.size[1]}  {out.stat().st_size // 1024}KB")
            browser.close()
    finally:
        server.terminate()


def main(toml_path: Path, png_path: Path):
    with tempfile.TemporaryDirectory() as td:
        work = Path(td)
        generate_pinouts(toml_path, png_path, work)
        shoot(work)
    print("OK - 10 theme gallery images written to assets/")


if __name__ == "__main__":
    toml_arg = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TOML
    png_arg = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_PNG
    if not toml_arg.exists() or not png_arg.exists():
        sys.exit(f"board not found: {toml_arg} / {png_arg}\n"
                 "Pass a board TOML and image: python tools/theme-gallery/generate.py BOARD.toml BOARD.png")
    main(toml_arg, png_arg)
