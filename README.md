# PinConnect

An interactive pinout generator for PCBs. PinConnect turns a photo of a board into an interactive pinout diagram you can open in a browser or embed in a documentation site.

It is made of three tools, used in sequence:

- **pinout-design**: a browser-based designer that turns a board image into a TOML config.
- **pinout-gen**: a CLI that reads that config and generates a self-contained interactive HTML pinout.
- **pinout-embed**: an optional Markdown extension that embeds the generated HTML into MkDocs / Zensical sites.

You only need the first two for a working pinout; the third is for publishing to a Markdown docs site.

## Quick start

1. Serve the designer and open it in your browser:

   ```bash
   cd pinout_design
   python -m http.server 8000   # then open http://localhost:8000
   ```

   Load a board image, draw a box over each connector, label the pins, and **Save TOML**.

2. Install the generator and render your config:

   ```bash
   pip install ./pinout_gen
   pinout-gen board.toml         # writes board.pinout.html
   ```

3. (Optional) Embed the result in an MkDocs / Zensical page — see the docs.

Full walkthrough: **[docs/getting-started.md](docs/getting-started.md)**.

## Documentation

All guides live in the [`docs/`](docs/) folder — start with the [documentation index](docs/README.md):

- [Getting Started](docs/getting-started.md)
- [Concepts](docs/concepts.md)
- [pinout-design](docs/pinout-design.md)
- [pinout-gen](docs/pinout-gen/generating-html.md)
- [pinout-embed](docs/pinout-embed/mkdocs-zensical.md)

## Repository layout

- `pinout_design/`: the visual designer (static web app).
- `pinout_gen/`: the `pinout-gen` CLI and connector type library.
- `pinout_embed/`: the Markdown embedding extension.
- `docs/`: documentation.

## License

GPL-3.0. See [LICENSE](LICENSE).
