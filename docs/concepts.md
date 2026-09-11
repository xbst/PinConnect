# Concepts

This page explains how PinConnect's pieces fit together and the three different kinds of TOML file you will encounter. Understanding these makes everything else in the docs clearer.

## How the pieces fit

PinConnect is a generator with two front ends and an optional publishing step.

- The **board config** is the real artifact: a TOML file describing your board, its photo, and every connector on it.
- The **generator** reads that config and renders a single interactive HTML file, with an SVG overlay of connectors and pin lines on top of your board photo.
- The **designer** is a visual way to write the config. It loads the generator into your browser and calls it, so the preview and download come from the same code as the command line tool.
- **pinout-embed** is glue for documentation sites, turning the generated HTML into a responsive iframe in a Markdown page.

There is one renderer, not two. A config produces the same bytes whether you press Generate in the browser or run `pinout-gen` in a terminal.

Keep the config. A pinout is derived from it, so when the board changes you edit the config and regenerate rather than starting over. You can write one by hand; the designer is a convenience, not a requirement.

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

Full field-by-field details live in the [board TOML reference](reference/board-toml.md).

### 2. Connector types

A connector type describes the *shape* of a physical connector — pin pitch, body size, how many rows, where the pin lines exit — independent of any board. These live in `pinout_gen/pinout_gen/connectors/` (for example `XH-F.toml`, `MX-F-2R.toml`, `USB-C.toml`) and are shared across every board.

A board connector refers to a type by name through its `type` field. When `pinout-gen` runs, it first checks the board's `connector_dir` (defaults to `./connectors` next to the board config), then falls back to the built-in types bundled with the package.

You only touch these files when adding support for a connector the library does not already have. See [connector types](reference/connector-types.md).

### 3. Themes

A theme describes how the generated page *looks* — its light and dark color palettes, its fonts, and how the chrome behaves (whether the connector list sits beside the board or stacks below it on narrow screens, whether symbols are shown, and so on) — independent of any board. Six themes ship with the package in `pinout_gen/pinout_gen/themes/`: `default`, `midnight`, `ocean`, `slate`, `terminal`, and `workbench`.

A board picks one through its `[board] theme` field, and `pinout-gen -t <name>` overrides that for a single run (you can also include a path). Resolution works exactly like connector types: `pinout-gen` checks the board's `theme_dir` (defaults to `./themes` next to the board config) first, then the themes bundled with the package.

Writing your own is easy, because a theme only has to state what differs; every token it leaves out falls back to the built-in palette. See [themes](reference/themes.md).

## How the designer reaches the connector types and themes

The designer loads the `pinout_gen` package itself into the browser and asks it directly. The designer only sees what is **bundled with the package**. If you created a connector type or theme linked in a board's own `connector_dir` or `theme_dir`, the designer cannot read it since it lives on your disk. Such a board renders with the bundled definition of any name it shares, which is not what `pinout-gen` would produce. The Generate dialog warns you when this happens, and those boards should be rendered from the [command line](automating.md).

## What "self-contained" means for the output

`pinout-gen` produces a single HTML file with its CSS and JavaScript inlined, so it works when opened directly or served statically. By default it has two external references:

- **The board image**, linked by the same relative path used in the board TOML. Keep the image next to the generated HTML so the link resolves, or pass `pinout-gen -i` to embed it into the file.
- **The theme's font**, if the theme loads one from Google Fonts — which the default theme does (Roboto). This adds `fonts.googleapis.com` links to the page. A theme can instead use a `bundled` font, which is embedded directly as base64, or a `system` font, which needs no download at all.

So `-i` alone makes the file portable but not necessarily offline: without a network the page still renders correctly, it just falls back to a system font. For output with no external references whatsoever, combine `-i` with a theme that uses a bundled or system font — see [themes](reference/themes.md).

## Where to go next

- [Getting Started](getting-started.md): make a pinout, end to end.
- [board TOML reference](reference/board-toml.md): every field in a board config.
- [connector types](reference/connector-types.md): the type library and adding your own.
- [themes](reference/themes.md): restyle the pinout's colors, fonts, and behaviors.
