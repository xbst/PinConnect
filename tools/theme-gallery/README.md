# Theme gallery

Regenerates the ten bundled-theme screenshots in [themes.md](../../docs/pinout-gen/themes.md): `theme-<name>-{light,dark}.webp` for `default`, `slate`, `ocean`, `terminal`, and `midnight`.

For each theme it runs `pinout-gen` on a sample board with that theme, opens the result in the system Chrome (light and dark), opens the connector list and pins one connector's tooltip — a single frame that exercises nearly every theme token: list, symbols, tooltip, connector housing, pin labels, and the active-item highlight. `ocean` always stacks its list below the board, so it is captured full-page.

Run from the repository root after a theme or renderer change that affects appearance:

```bash
python tools/theme-gallery/generate.py            # uses the maintainer's sample board
python tools/theme-gallery/generate.py BOARD.toml BOARD.png   # your own board
```

The default board lives outside the repo, so a contributor should pass their own board TOML and image. It needs a connector with id `FS1` to pin; change `PIN_ID` in `generate.py` if your board names things differently.

Requires `playwright` and `pillow` (`pip install playwright pillow`); Playwright drives the system Chrome, no download needed, and the pinouts load their fonts from Google Fonts, so this needs network access. Output is resized to 1600px wide and saved as WebP (~110 KB each) to keep the repo small. Commit the regenerated `.webp` files.
