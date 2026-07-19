# pinout-gen

The command-line generator for PinConnect. It reads a board TOML config and produces a single interactive HTML pinout — CSS and JavaScript inlined — with an SVG overlay of connectors and pin lines on top of your board image.

```bash
pip install ./pinout_gen      # from the repository root
pinout-gen board.toml         # writes board.pinout.html
pinout-gen board.toml -i -t midnight   # embed the image, apply a theme
```

By default the board image is referenced by relative path rather than embedded; `-i` inlines it so the file stands alone.

Requires Python 3.9+. Connector shapes come from the type library in [`pinout_gen/connectors/`](pinout_gen/connectors), and the generated page's look from the themes in [`pinout_gen/themes/`](pinout_gen/themes) — both extensible without touching the code.

**Usage:** see the docs:
[installation](../docs/pinout-gen/install.md),
[generating HTML](../docs/pinout-gen/generating-html.md),
[board TOML reference](../docs/pinout-gen/board-toml.md),
[connector types](../docs/pinout-gen/connector-types.md), and
[themes](../docs/pinout-gen/themes.md).
