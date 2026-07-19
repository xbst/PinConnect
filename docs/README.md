# PinConnect Documentation

PinConnect turns a photo of a PCB into an interactive pinout diagram you can publish on a documentation site. It has three tools used in sequence: a visual **designer**, an HTML **generator**, and a Markdown **embed** extension.

Start with **[Getting Started](getting-started.md)** for a quick run through the whole pipeline, then read **[Concepts](concepts.md)** to understand how the pieces fit together. If you would rather see the end product first, here is a [live example pinout](https://docs.isiks.tech/pinouts/bnc/bnc.pinout.html).

## Contents

### Overview

- [Getting Started](getting-started.md): from board photo to embedded pinout, end to end.
- [Concepts](concepts.md): the pipeline and the three kinds of TOML file.

### pinout-design

- [pinout-design](pinout-design.md): run the visual designer and build a board config.

### pinout-gen

- [Installation](pinout-gen/install.md): install the CLI.
- [Generating HTML](pinout-gen/generating-html.md): run the generator.
- [Board TOML reference](pinout-gen/board-toml.md): every field in a board config.
- [Connector types](pinout-gen/connector-types.md): the type library and adding your own.
- [Themes](pinout-gen/themes.md): restyle the pinout's colors, fonts, and behaviors, or make your own theme.

### pinout-embed

- [MkDocs / Zensical](pinout-embed/mkdocs-zensical.md): embed pinouts in a Markdown docs site.
