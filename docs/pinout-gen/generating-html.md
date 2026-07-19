# Generating HTML

`pinout-gen` reads a board config (see [board TOML reference](board-toml.md)) and writes a single interactive HTML file with its CSS and JavaScript inlined.

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

When it runs, `pinout-gen` resolves three things relative to the board config:

- **The board image**, from the `image` field in `[board]`. By default it is referenced by the generated HTML (not embedded), so keep it next to the output — see the caveat below. You can embed it instead with `-i`.
- **The connector type definitions**, first from `connector_dir` (defaults to `./connectors` next to the config), then from the built-in types bundled with the package. You can override a built-in type by placing a `<type>.toml` in your `connector_dir`. See [connector types](connector-types.md).
- **The theme**, first from `theme_dir` (defaults to `./themes` next to the config), then from the themes bundled with the package — the same two-step lookup as connector types. See [themes](themes.md).

## Keep the image next to the output

By default, the generated HTML links the board image by the same relative path used in the TOML. It is not inlined. If you move the HTML, move the image with it (or serve both from the same directory), or the diagram will show a broken image.

For example, if `board.toml` has `image = "board.png"`, then `board.png` must sit next to `board.pinout.html`.

To avoid this requirement, use `-i` to embed the image directly — see below.

## Choosing a theme

Use `-t` / `--theme` to apply a [theme](themes.md) — colors, fonts, and behaviors of the generated page — overriding the board's `[board] theme`:

```bash
pinout-gen board.toml --theme midnight
```

The built-in themes are `default`, `slate`, `ocean`, `terminal`, and `midnight`. See [themes](themes.md) to use them or create your own.

## Embedding the board image

Use `-i` / `--image-embed` to base64-encode the board image into the HTML, so the output carries its own image and needs no external file. This is ideal if you're sharing the pinout file instead of embedding into a website since the person opening the pinout doesn't have to worry about having the image file in the same location the HTML file is opened from as well.

Note that `-i` covers the image only. A theme whose font comes from Google Fonts — including the default — still loads it from the web, so the page falls back to a system font offline. For a file with no external references at all, pair `-i` with a theme that uses a `bundled` or `system` font (see [themes](themes.md)).

### Use the image from the board config

```bash
pinout-gen board.toml -i
```

This reads the `image` path from `[board]` (resolved relative to the config), encodes it, and inlines it as a data URI.

### Use a different image

```bash
pinout-gen board.toml -i image.png
```

This embeds `image.png` instead of whatever `image` is set to in the config.

### Error handling

If `-i` is used and the image file cannot be found or read, `pinout-gen` exits with an error:

```
Error: image file not found: /path/to/image.png
```

## Common errors

All of these print to stderr and exit with status 1.

- **`Error: config file not found`** — the path passed to the command does not exist. Check the filename and your working directory.
- **`Error: Connector type '<name>' not found`** — a connector's `type` has no matching `<name>.toml` in either `connector_dir` or the built-in types; the message names both folders it searched. Fix the `type` value, or add the connector type (see [connector types](connector-types.md)).
- **`Error: Theme '<name>' not found`** — the name given to `-t` (or set as `[board] theme`) has no matching `<name>.toml` in either `theme_dir` or the bundled themes, which the message names. Check the spelling, or see [themes](themes.md).
- **`Error: image file not found`** — `-i` could not read the board image; see [error handling](#error-handling) above.

A malformed config reports the specific problem — a TOML syntax error, a missing required key, an unknown `[geometry]` key, a duplicate connector `id` — rather than a traceback.
