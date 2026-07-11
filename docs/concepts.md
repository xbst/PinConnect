# Concepts

This page explains how PinConnect's pieces fit together and the two different kinds of TOML file you will encounter. Understanding these makes everything else in the docs clearer.

## The pipeline

PinConnect is a three-stage pipeline. Each stage produces the input for the next:
- **pinout-design** is where you do the design. It overlays connector boxes on a board image and *writes* a board TOML file.
- **pinout-gen** *reads* that TOML and *renders* a self-contained interactive HTML file with an SVG overlay of connectors and pin lines on top of your board image.
- **pinout-embed** is glue for documentation sites. It *embeds* the generated HTML into a Markdown page as a responsive iframe.

The middle artifact (the board TOML) is what is ultimately used to generate the pinout. The designer is just a convenient way to produce it, and you can always write it without the designer, or edit it afterwards.

This also means, it is a good idea to keep a copy of this TOML file. If you need to make edits to your interactive pinout, you can just edit the file in pinout-design (or edit the file manually), and use it to generate an updated pinout, without having to create another TOML from scratch.

## The two kinds of TOML

PinConnect uses TOML for two unrelated jobs.

### 1. Board config (one per board)

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

### 2. Connector types (a reusable library)

A connector type describes the *shape* of a physical connector — pin pitch, body size, how many rows, where the pin lines exit — independent of any board. These live in `pinout_gen/pinout_gen/connectors/` (for example `XH-F.toml`, `MX-F-2R.toml`, `USB-C.toml`) and are shared across every board.

A board connector refers to a type by name through its `type` field. When `pinout-gen` runs, it first checks the board's `connector_dir` (defaults to `./connectors` next to the board config), then falls back to the built-in types bundled with the package.

You only touch these files when adding support for a connector the library does not already have. See [connector types](pinout-gen/connector-types.md).

## Why the designer has its own connector files

The designer runs in the browser and cannot read the Python side's TOML directly, so it uses **JSON mirrors** of the connector types, stored in `pinout_design/connectors/` alongside an `index.json` listing them.

These JSON files are generated from the canonical TOML definitions by `pinout_design/tools/convert-connectors.py`. The TOML files in `pinout_gen/pinout_gen/connectors/` are the source of truth; the JSON is a build artifact.

> **If you add or change a connector type,** edit the TOML in `pinout_gen/pinout_gen/connectors/`, then re-run `convert-connectors.py` to regenerate the designer's JSON. Editing one without the other will leave the designer and generator out of sync.

## What "self-contained" means for the output

`pinout-gen` produces a single HTML file with its CSS and JavaScript inlined, so it works when opened directly or served statically. By default, the one external reference is the board image, which is linked by the same relative path used in the board TOML. Keep the image next to the generated HTML so the link resolves, or use `pinout-gen -i` to embed the image and make the output fully self-contained.

## Where to go next

- [Getting Started](getting-started.md): run the whole pipeline once.
- [board TOML reference](pinout-gen/board-toml.md): every field in a board config.
- [connector types](pinout-gen/connector-types.md): the type library and adding your own.
