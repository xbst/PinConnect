# pinout-design

The browser-based designer for PinConnect. Load a board image, draw a box over each connector, label the pins, and save a board TOML config for [pinout-gen](../pinout_gen) to render.

It is a static web app with nothing to install, but it must be served over HTTP (it loads its connector library over `fetch()`):

```bash
cd pinout_design
python -m http.server 8000   # then open http://localhost:8000
```

**Usage:** see [docs/pinout-design.md](../docs/pinout-design.md).
