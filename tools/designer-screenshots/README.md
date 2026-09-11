# Designer screenshots

Regenerates the nine screenshots of the designer used in [designer.md](../../docs/designer.md) and [getting-started.md](../../docs/getting-started.md): `designer-overview.png`, `designer-about.png`, and `workflow-1..7-*.png`.

Playwright serves `pinout_design/` locally, drives the real UI in the system Chrome, loads a sample board (image, then TOML), selects a two-row connector so the preview and R1/R2 pin selectors are visible, opens the Generate dialog and the About box, and captures each panel. Shots are dark at 2x, matching the designer's fixed dark theme.

Run from the repository root after a change to the designer's chrome (fonts, layout, panel markup):

```bash
python tools/designer-screenshots/generate.py            # uses the maintainer's sample board
python tools/designer-screenshots/generate.py BOARD.toml BOARD.png   # your own board
```

The default board lives outside the repo, so a contributor should pass their own board TOML and image. Any board works; the script selects the `CAN` connector if present, otherwise the first one.

Two details keep the images honest and independent of which board you pass:

- It builds the Pyodide payload first and waits for the runtime to report ready. Without that the designer shows "Renderer unavailable" and draws no connectors, and every shot would capture a dead app.
- It strips `theme_dir`, `connector_dir` and `theme` from a copy of the board before loading it, and renders the Generate shot with the `default` theme. A board pointing at its own theme or connector folder cannot be rendered in the browser at all, so the dialog would show a warning banner instead of a pinout. The original file is not modified.

Requires `playwright` (`pip install playwright`); it drives the system Chrome, no download needed. The designer loads Roboto from Google Fonts and Pyodide from a CDN, so this needs network access. Commit the regenerated PNGs.
