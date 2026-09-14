# Designer screenshots

Regenerates the nine screenshots of the designer used in [designer.md](../../docs/designer.md) and [getting-started.md](../../docs/getting-started.md): `designer-overview.png`, `designer-about.png`, and `workflow-1..7-*.png`.

The script serves `pinout_design/` locally on a free port, then Playwright drives the real UI in the system Chrome, loads a sample board (image, then TOML), selects a connector, opens the Generate dialog and the About box, and captures each panel. The maintainer's sample selects a two-row connector so the preview and R1/R2 pin selectors are visible. Shots are dark at 2x, matching the designer's fixed dark theme. The overview uses the **Connectors** tab; only the TOML source shot switches to **TOML**, then restores **Connectors** for the remaining shots.

Run from the repository root after a change to the designer's chrome (fonts, layout, panel markup):

```bash
python tools/designer-screenshots/generate.py            # uses the maintainer's sample board
python tools/designer-screenshots/generate.py BOARD.toml BOARD.png   # your own board
```

The default board lives outside the repo, so a contributor should pass their own board TOML and image. The board must contain at least one connector. The script selects the connector whose ID is `CAN` if present, otherwise the first connector. To show the R1/R2 pin controls in the screenshots, use a board where that selected connector has a two-row type.

These details keep the images honest and independent of which board you pass:

- It builds the Pyodide payload first and waits for the runtime to report ready. Without that the designer shows "Renderer unavailable" and draws no connectors, and every shot would capture a dead app.
- It strips `theme_dir`, `connector_dir` and `theme` from a copy of the board before loading it, and renders the Generate shot with the `default` theme. The browser cannot read a board's local theme or connector files, so using those paths would show a warning banner and fall back to any matching bundled definitions. The original file is not modified.
- Its HTTP server binds an ephemeral port and shuts down after capture, so it does not claim a fixed port or interfere with another development server.

Requires `playwright` (`pip install playwright`); it drives the system Chrome, no download needed. The designer loads Roboto from Google Fonts and Pyodide from a CDN, so this needs network access. Commit the regenerated PNGs.
