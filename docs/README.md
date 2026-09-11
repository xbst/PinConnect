# PinConnect Documentation

PinConnect turns a photo of a circuit board into an interactive pinout diagram: hover or tap a connector and its pin names, colors, and description appear. The result is a single HTML file you can open in a browser, share, or embed in a documentation site.

There are two ways to work with it, and most people only ever need the first.

**In the browser.** Open the designer, load a board photo, draw a box over each connector, label the pins, and press Generate. Nothing to install. Start with [Getting Started](getting-started.md).

**From the command line.** `pinout-gen` renders the same file from a saved config, which is what you want for regenerating pinouts as a board changes, or in a CI job that publishes a docs site. See [Automating](automating.md).

Both produce the same file, byte for byte, because the designer runs the generator itself rather than a copy of it.

If you would rather see the end product first, here is a [live example pinout](https://docs.isiks.tech/pinouts/bnc/bnc.pinout.html).

## Contents

### Start here

- [Getting Started](getting-started.md): from a board photo to a finished pinout, in the browser.
- [The designer](designer.md): a full tour, keyboard shortcuts, and what to do when something goes wrong.
- [Concepts](concepts.md): how the pieces fit together, and the three kinds of TOML file.

### Going further

- [Automating](automating.md): install the command line tool, regenerate pinouts, and publish from CI.
- [Embedding](embedding.md): put a pinout into an MkDocs or Zensical page.

### Reference

- [Board TOML](reference/board-toml.md): every field in a board config.
- [Connector types](reference/connector-types.md): the built-in library, and adding your own.
- [Themes](reference/themes.md): colors, fonts, and layout behavior, and writing your own theme.
