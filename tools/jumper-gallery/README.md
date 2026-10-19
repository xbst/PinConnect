# Jumper gallery

Generates the two jumper settings doc images from `sample.toml` in this folder:

- `assets/jumper-shapes.webp` — six pinned tooltips, one per common header shape (on/off, a shared middle pin, one of several, combinations, jumpers that move together, groups), each with one setting chosen. Shown in the [board TOML reference](../../docs/reference/board-toml.md#common-shapes).
- `assets/workflow-jumpers.png` — the designer's connector editor picking jumpers for the fan voltage selector: the drawing with its pins numbered, above the setting cards. Shown in [the designer](../../docs/designer.md).

The tooltips are the generator's real page, rendered by pinout-gen from the sample and opened in Chrome, and the designer shot drives the real designer, so neither can drift from what the tools produce. The sample brings its own board, so unlike the theme gallery and the designer screenshots this needs no board from outside the repo. The plain board image is made on the fly and never committed.

Run from the repository root after a change to how jumper settings draw, to the settings strip in the tooltip, or to the designer's settings section:

```bash
python tools/jumper-gallery/generate.py
```

Requires `playwright` and `pillow` (`pip install playwright pillow`). Playwright drives the system Chrome, so there is no browser download. The page and the designer load Roboto from Google Fonts and the designer loads Pyodide from a CDN, so this needs network access. It builds the designer's payload first and serves `pinout_design/` on a free port, like the designer screenshots. Commit the regenerated images.

`sample.toml` doubles as an example: open it in the designer to see each header's settings. Its two-row headers list their pins column by column, so their pin numbers follow the usual odd/even header numbering. To change what a card shows, edit `SHAPES` at the top of `generate.py`, which picks the setting each card displays.
