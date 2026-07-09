# pinout-gen: Generating HTML

`pinout-gen` reads a board config (see [board TOML reference](board-toml.md)) and writes a single self-contained interactive HTML file.

Make sure the tool is [installed](install.md) first.

## Basic usage

```bash
pinout-gen board.toml
```

This writes `board.pinout.html` in the same folder as the config. The default output name is the config's stem with `.pinout.html` appended.

The command prints a confirmation line with the output path and the number of connectors rendered:

```
Generated: /path/to/board.pinout.html  (14 connectors)
```

## Choosing the output path

Use `-o` / `--output` to write somewhere else:

```bash
pinout-gen board.toml -o docs/my-board.html
```

The output directory must already exist.

## What the generator needs alongside the config

When it runs, `pinout-gen` resolves two things relative to the board config:

- **The board image**, from the `image` field in `[board]`. It is referenced by the generated HTML (not embedded), so keep it next to the output — see the caveat below.
- **The connector type definitions**, from `connector_dir` (defaults to `./connectors` next to the config). Every `type` used by a connector must have a matching `<type>.toml` in that folder. See [connector types](connector-types.md).

## Keep the image next to the output

The generated HTML links the board image by the same relative path used in the TOML. It is not inlined. If you move the HTML, move the image with it (or serve both from the same directory), or the diagram will show a broken image.

For example, if `board.toml` has `image = "board.png"`, then `board.png` must sit next to `board.pinout.html`.

## Common errors

- **`Error: config file not found`** — the path passed to the command does not exist. Check the filename and your working directory.
- **`Connector type '<name>' not found`** — a connector's `type` has no matching `<name>.toml` in `connector_dir`. Fix the `type` value, or add the connector type (see [connector types](connector-types.md)).
