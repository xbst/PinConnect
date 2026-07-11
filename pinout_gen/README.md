# pinout-gen

The command-line generator for PinConnect. It reads a board TOML config and produces a single self-contained interactive HTML pinout with an SVG overlay of connectors and pin lines on top of your board image.

```bash
pip install ./pinout_gen      # from the repository root
pinout-gen board.toml         # writes board.pinout.html
```

Requires Python 3.9+. Connector shapes are defined by the type library in [`pinout_gen/connectors/`](pinout_gen/connectors).

**Usage:** see the docs:
[installation](../docs/pinout-gen/install.md),
[generating HTML](../docs/pinout-gen/generating-html.md),
[board TOML reference](../docs/pinout-gen/board-toml.md), and
[connector types](../docs/pinout-gen/connector-types.md).
