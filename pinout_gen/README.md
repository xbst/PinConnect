# pinout-gen

The command-line generator for PinConnect. It reads a board TOML config and produces a single interactive HTML pinout — CSS and JavaScript inlined — with an SVG overlay of connectors and pin lines on top of your board image.

```bash
pip install ./pinout_gen      # from the repository root
pinout-gen board.toml         # writes board.pinout.html
pinout-gen board.toml -i -t midnight   # embed the image, apply a theme
pinout-gen --serve            # open the visual designer in a browser
```

By default the board image is referenced by relative path rather than embedded; `-i` inlines it so the file stands alone.

Requires Python 3.9+. Connector shapes come from the type library in [`pinout_gen/connectors/`](pinout_gen/connectors), and the generated page's look from the themes in [`pinout_gen/themes/`](pinout_gen/themes) — both extensible without touching the code.

This package is also what the [designer](../pinout_design) runs. It is loaded into the browser under Pyodide and called there, so a config rendered in the designer and on the command line produces the same bytes. The designer's static files ship inside this package, which is what makes `--serve` work from any install.

**Usage:** see the docs:
[automating](../docs/automating.md) for installing and running the CLI,
[board TOML reference](../docs/reference/board-toml.md),
[connector types](../docs/reference/connector-types.md), and
[themes](../docs/reference/themes.md).
