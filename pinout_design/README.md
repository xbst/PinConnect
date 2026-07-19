# pinout-design

The browser-based designer for PinConnect. Load a board image, draw a box over each connector, label the pins, and save a board TOML config for [pinout-gen](../pinout_gen) to render.

It is a static web app with nothing to install, but it must be served over HTTP (it loads its connector, theme, and symbol data over `fetch()`):

```bash
cd pinout_design
python -m http.server 8000   # then open http://localhost:8000
```

The `connectors/`, `themes/`, and `symbols.json` files here are JSON mirrors of pinout-gen's canonical TOML and `symbols.py`, regenerated with `python tools/convert-connectors.py`. They are generated but committed, since the served app fetches them at runtime — see [connector types](../docs/pinout-gen/connector-types.md#keeping-the-designer-in-sync).

**Usage:** see [docs/pinout-design.md](../docs/pinout-design.md).
