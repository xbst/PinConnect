# PinConnect

An interactive pinout generator for PCBs. PinConnect turns a photo of a board into an interactive pinout diagram you can open in a browser or embed in a documentation site.

![A generated PinConnect pinout: hovering connectors on the board, then opening the connector list and picking connectors from it](assets/pinout-demo.gif)

*A generated pinout for the [Birds' Nest CAN](https://store.isiks.tech/products/birds-nest-CAN) board — hover a connector on the board for its pinout, or open the connector list to browse every connector at once.*

## Quick start

Open **<https://pinconnect.isiks.tech>**, load a photo of your board, draw a box over each connector, label the pins, and press **Generate**.

That is the whole thing. Nothing to install, and nothing is uploaded: the generator runs in your browser, so your photo and your config never leave it.

Full walkthrough: **[Getting Started](docs/getting-started.md)**.

## Automating it

For regenerating pinouts as a board changes, or publishing from CI, there is a command line tool that renders the same file from a saved config:

```bash
pip install ./pinout_gen
pinout-gen board.toml         # writes board.pinout.html
```

The output is identical either way, because the designer runs this same generator rather than a copy of it. `pinout-gen --serve` also opens the designer locally if you would rather not use the hosted one.

See [Automating](docs/automating.md).

If you'd like to see a live demo of the generated pinouts, you can find it on this documentation website: https://docs.isiks.tech/pinouts/bnc/bnc.pinout.html

## Documentation

All guides live in the [`docs/`](docs/) folder — start with the [documentation index](docs/README.md):

- [Getting Started](docs/getting-started.md): a board photo to a finished pinout.
- [The designer](docs/designer.md): every panel and field, plus troubleshooting.
- [Concepts](docs/concepts.md): how the pieces fit and the three kinds of TOML file.
- [Automating](docs/automating.md): the command line tool, and publishing from CI.
- [Embedding](docs/embedding.md): pinouts in an MkDocs or Zensical page.

Reference: [board TOML](docs/reference/board-toml.md), [connector types](docs/reference/connector-types.md), [themes](docs/reference/themes.md).

## Repository layout

- [`pinout_design/`](pinout_design/): the designer, a static web app.
- [`pinout_gen/`](pinout_gen/): the `pinout-gen` CLI, connector type library, and themes. The designer loads this package to do its rendering.
- [`pinout_embed/`](pinout_embed/): the Markdown embedding extension.
- [`docs/`](docs/): documentation.

Each package folder has its own README with a short overview.

## License

This project is licensed under GPL-3.0. See [LICENSE](LICENSE).

If you'd like to support the development of this and other open-source projects, you can donate on [GitHub Sponsors](https://github.com/sponsors/xbst/) or [Patreon](https://patreon.com/isikstech).
