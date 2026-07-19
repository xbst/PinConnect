# Designer screenshots

Regenerates the seven screenshots of the visual designer used in [pinout-design.md](../../docs/pinout-design.md): `designer-overview.png` and `workflow-1..6-*.png`.

Playwright serves `pinout_design/` locally, drives the real UI in the system Chrome, loads a sample board (image, then TOML), selects a two-row connector so the preview and R1/R2 pin selectors are visible, and captures each panel. Shots are dark at 2x, matching the designer's fixed dark theme.

Run from the repository root after a change to the designer's chrome (fonts, layout, panel markup):

```bash
python tools/designer-screenshots/generate.py            # uses the maintainer's sample board
python tools/designer-screenshots/generate.py BOARD.toml BOARD.png   # your own board
```

The default board lives outside the repo, so a contributor should pass their own board TOML and image. Any board works; the script selects the `CAN` connector if present, otherwise the first one.

Requires `playwright` (`pip install playwright`); it drives the system Chrome, no download needed. The designer loads Roboto from Google Fonts, so this needs network access. Commit the regenerated PNGs.
