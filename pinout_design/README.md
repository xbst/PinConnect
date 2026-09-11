# pinout-design

The designer for PinConnect. Load a board photo, draw a box over each connector, label the pins, and press Generate to get a finished interactive pinout. It also writes the board TOML config, so you can reopen the board later.

Hosted at <https://pinconnect.isiks.tech>.

It is a static web app, but it cannot be opened from disk: it fetches its Python payload at startup and must be served over HTTP. The easiest way to run it locally is the CLI, which ships the designer with it:

```bash
pip install ./pinout_gen
pinout-gen --serve
```

To serve this folder some other way, build the payload first, since it is generated rather than committed:

```bash
python pinout_design/tools/build-payload.py
cd pinout_design && python -m http.server 8000
```

## How it renders

The designer does not reimplement the renderer. It loads [pinout-gen](../pinout_gen) itself into the browser under Pyodide and calls it, so the connector drawings, the Generate preview, and the downloaded file all come from the same code as the command line tool, byte for byte.

- `js/runtime.js` boots Pyodide and unpacks the payload.
- `py/bridge.py` is the only Python the designer adds: a thin shim over `pinout_gen`.
- `tools/build-payload.py` zips the package for the browser to fetch. The zip is generated and git-ignored.

One consequence: the designer only sees the connector types and themes **bundled with the package**. A board pointing at its own `connector_dir` or `theme_dir` has files on disk that the browser cannot read, so it renders with the bundled definitions and says so. Render those with `pinout-gen`.

**Usage:** see [the designer](../docs/designer.md).
