# Connector gallery

Generates two doc images from the bundled connector types:

- `assets/connector-gallery.webp` — every type in a labeled grid, shown in [connector types](../../docs/pinout-gen/connector-types.md).
- `assets/label-styles.webp` — one header under each `label_style`, shown in the [board TOML reference](../../docs/pinout-gen/board-toml.md#label_style).

Both are drawn with pinout-gen's own `render_connector_svg`, so they always match what the generator produces — no hand-drawn art to keep in sync.

Run from the repository root after adding or changing a connector type or a body style:

```bash
python tools/connector-gallery/generate.py
```

Requires `playwright` and `pillow` (`pip install playwright pillow`). Playwright drives the system Chrome, so there is no browser download. Commit the regenerated `.webp` files alongside the connector change.

A new type is picked up automatically once you add it to `GALLERY_ORDER` at the top of `generate.py`.
