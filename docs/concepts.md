# Concepts

This page explains how PinConnect's pieces fit together and the three different kinds of TOML file you will encounter. Understanding these makes everything else in the docs clearer.

## The pipeline

PinConnect is a three-stage pipeline. Each stage produces the input for the next:
- **pinout-design** is where you do the design. It overlays connector boxes on a board image and *writes* a board TOML file.
- **pinout-gen** *reads* that TOML and *renders* a single interactive HTML file with an SVG overlay of connectors and pin lines on top of your board image.
- **pinout-embed** is glue for documentation sites. It *embeds* the generated HTML into a Markdown page as a responsive iframe.

The middle artifact (the board TOML) is what is ultimately used to generate the pinout. The designer is just a convenient way to produce it, and you can always write it without the designer, or edit it afterwards.

This also means it is a good idea to keep a copy of this TOML file. If you need to make edits to your interactive pinout, you can edit the file in pinout-design (or by hand) and regenerate the pinout from it, without having to start another TOML from scratch.

## The three kinds of TOML

PinConnect uses TOML for three separate jobs: describing your board, describing the connectors it uses, and describing how the result looks.

### 1. Board config

A board config describes *your specific board*: which image to use, its dimensions, and every connector placed on it. This is the file the user saves and the file you pass to `pinout-gen`.

It contains a `[board]` table and a `[[connector]]` array, where each connector has a position on the image, an orientation, a type, and a list of `[[connector.pin]]` entries:

```toml
[board]
title = "My Board"
image = "my-board.png"
width = 1920
height = 1080

[[connector]]
id = "CAN1"
name = "CAN 1"
type = "MX-F-2R"      # ← references a connector type (see below)
x1 = 543
y1 = 422
x2 = 864
y2 = 742

  [[connector.pin]]
  name = "VIN"
  color = "#E74C3C"
```

Full field-by-field details live in the [board TOML reference](pinout-gen/board-toml.md).

### 2. Connector types

A connector type describes the *shape* of a physical connector — pin pitch, body size, how many rows, where the pin lines exit — independent of any board. These live in `pinout_gen/pinout_gen/connectors/` (for example `XH-F.toml`, `MX-F-2R.toml`, `USB-C.toml`) and are shared across every board.

A board connector refers to a type by name through its `type` field. When `pinout-gen` runs, it first checks the board's `connector_dir` (defaults to `./connectors` next to the board config), then falls back to the built-in types bundled with the package.

You only touch these files when adding support for a connector the library does not already have. See [connector types](pinout-gen/connector-types.md).

### 3. Themes

A theme describes how the generated page *looks* — its light and dark color palettes, its fonts, and how the chrome behaves (whether the connector list sits beside the board or stacks below it on narrow screens, whether symbols are shown, and so on) — independent of any board. Five themes ship with the package in `pinout_gen/pinout_gen/themes/`: `default`, `midnight`, `ocean`, `slate`, and `terminal`.

A board picks one through its `[board] theme` field, and `pinout-gen -t <name>` overrides that for a single run (you can also include a path). Resolution works exactly like connector types: `pinout-gen` checks the board's `theme_dir` (defaults to `./themes` next to the board config) first, then the themes bundled with the package.

Writing your own is easy, because a theme only has to state what differs; every token it leaves out falls back to the built-in palette. See [themes](pinout-gen/themes.md).

## Why the designer has its own copies of these files

The designer runs in the browser and cannot read the Python side's TOML directly, so it works from **JSON mirrors**: `pinout_design/connectors/` (one file per connector type, plus an `index.json` listing them), `pinout_design/themes/index.json` (the names behind the Theme dropdown), and `pinout_design/symbols.json` (the names the Symbol field offers).

All of these are generated from the canonical Python-side definitions by `pinout_design/tools/convert-connectors.py`. The TOML files in `pinout_gen/pinout_gen/connectors/` and `pinout_gen/pinout_gen/themes/`, and the icon set in `pinout_gen/pinout_gen/symbols.py`, are the sources of truth; the JSON is generated from them.

> **If you add or change a connector type, a theme, or a symbol,** edit the canonical file under `pinout_gen/`, then re-run `convert-connectors.py` to regenerate the designer's JSON. It rewrites every mirror in one pass, so there is nothing to update by hand — but editing one side without regenerating the other will leave the designer and generator out of sync.

## What "self-contained" means for the output

`pinout-gen` produces a single HTML file with its CSS and JavaScript inlined, so it works when opened directly or served statically. By default it has two external references:

- **The board image**, linked by the same relative path used in the board TOML. Keep the image next to the generated HTML so the link resolves, or pass `pinout-gen -i` to embed it into the file.
- **The theme's font**, if the theme loads one from Google Fonts — which the default theme does (Roboto). This adds `fonts.googleapis.com` links to the page. A theme can instead use a `bundled` font, which is embedded directly as base64, or a `system` font, which needs no download at all.

So `-i` alone makes the file portable but not necessarily offline: without a network the page still renders correctly, it just falls back to a system font. For output with no external references whatsoever, combine `-i` with a theme that uses a bundled or system font — see [themes](pinout-gen/themes.md).

## Where to go next

- [Getting Started](getting-started.md): run the whole pipeline once.
- [board TOML reference](pinout-gen/board-toml.md): every field in a board config.
- [connector types](pinout-gen/connector-types.md): the type library and adding your own.
- [themes](pinout-gen/themes.md): restyle the pinout's colors, fonts, and behaviors.
