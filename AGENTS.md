# AGENTS.md

Guidance for AI coding agents working in the PinConnect repository. Human-facing documentation lives in [`docs/`](docs/) and [`README.md`](README.md); this file covers how the pieces fit together and the conventions to follow when changing them.

## What this project is

PinConnect turns a photo of a PCB into an interactive pinout diagram. It is one tool, **`pinconnect`**: one command, one distribution, one Python package. It has two front ends over one renderer, plus an optional publishing step:

1. **The designer** (`src/pinconnect/designer/`) — a browser app that writes a board TOML config and renders the pinout. It does not reimplement the renderer: it loads the `pinconnect` package into the page under Pyodide and calls it. `pinconnect` with no arguments serves it locally; it is also hosted at <https://pinconnect.isiks.tech>.
2. **The command line** (`pinconnect board.toml`) — reads that TOML and renders a single interactive HTML file.
3. **The Markdown extension** (`pinout_embed/`) — a Python-Markdown extension that embeds the generated HTML into MkDocs / Zensical sites. It is moving to its own repository as `md-iframe`; leave `pinout_embed/` as it is.

The board TOML config is the interface between the designer and the renderer; the generated HTML is the interface between the renderer and the publishing step.

`pinconnect` was previously two tools, `pinout-gen` (the CLI, package `pinout_gen`) and `pinout-design` (the designer, then a sibling folder). Those old names keep working through compatibility code (see "Old names" below); everything new uses `pinconnect`.

## Repository layout

- `pyproject.toml` — the `pinconnect` distribution (src layout). Declares one console script, `pinconnect`. `MANIFEST.in` only keeps a working copy's tests out of the sdist.
- `src/pinconnect/` — the package.
  - `cli.py` — `main()` (the `pinconnect` command) and `legacy_main()` (the old `pinout-gen` command line), sharing the render and serve code. `__main__.py` makes `python -m pinconnect` call `main()`.
  - `config.py` (TOML dataclasses + loaders), `renderer.py` (SVG/HTML generation), `symbols.py` (bundled symbol icons + name aliases).
  - `serve.py` — the local designer server. `payload.py` — locates the designer (`designer_root()`) and builds the Pyodide payload (`build_payload()`); `python -m pinconnect.payload [--force]` builds it by hand.
  - `connectors/` — connector type definitions (`*.toml`). **Source of truth** for connector geometry, bundled with the package so they are found regardless of where the tool is run.
  - `themes/` — theme definitions (`*.toml`). **Source of truth** for themes, bundled the same way.
  - `designer/` — the visual designer (vanilla ES modules, no framework): `index.html`, `css/`, `js/` (`board-model.js`, `state.js`, `*-panel.js`, `toml-io.js`, `dialogs.js`, `runtime.js` boots Pyodide, `main.js`) and `py/bridge.py`, the only Python the designer adds: a thin shim over `pinconnect` for the catalogs, the connector preview, and Generate.
  - `designer/pinconnect.zip` — the payload the browser fetches at startup. **Generated and git-ignored.**
- `examples/example.toml` — example board config.
- `pinout_gen/` — holds only the old `README.md` for now; the `pinout-gen` compatibility distribution goes here.
- `pinout_embed/` — the Markdown extension (single module, `pinout_embed.py`), on its way to the `md-iframe` repository.
- `docs/` — human documentation.
- `tools/` — repo-level doc-asset generators, each its own folder with a `generate.py` and a `README.md` (see "Regenerating doc images" below).

## Key facts and gotchas

- **The designer must be served over HTTP.** It fetches `pinconnect.zip` at startup, so opening `index.html` via `file://` fails. Run `pinconnect`, which builds the payload, picks a free port and opens a browser. Serving the folder by hand needs `python -m pinconnect.payload` first, or the designer boots into "Renderer unavailable".
- **The designer lives inside the package.** Nothing is copied at build time: a wheel ships `src/pinconnect/designer/` as package data, and an editable install serves the checkout's own files. The payload is built beside the designer only in a source checkout (`src/pinconnect` next to a `pyproject.toml`); an installed package builds it in the per-user cache (`<cache>/pinconnect/`, where `<cache>` is `%LOCALAPPDATA%` on Windows and `$XDG_CACHE_HOME` or `~/.cache` elsewhere), even when site-packages is writable, because pip would never remove a file written there.
- **The payload holds `bridge.py` at its root and the package under `pinconnect/`,** minus the server-side modules (`cli.py`, `serve.py`, `payload.py`, `__main__.py`) and the designer itself. `payload_is_stale` compares the archive's contents, not just mtimes, so a removed file triggers a rebuild too. The Pages workflow (`.github/workflows/pages.yml`) builds it with `PYTHONPATH=src python -m pinconnect.payload` and checks those properties.
- **Package data is listed by file type** in `pyproject.toml` (`designer/js/*.js` and so on), not with a recursive glob: older setuptools releases do not expand `**`, and the explicit list keeps the payload zip and bytecode caches out of the wheel. A new kind of designer file (a new folder or extension) needs a line there.
- **One representation of connector types, themes, and symbols.** `src/pinconnect/connectors/*.toml`, `themes/*.toml` and `symbols.py` are read by the designer through the bridge, so there is nothing to mirror and nothing to regenerate. (There used to be JSON copies and a `convert-connectors.py`; both are gone. Do not reintroduce them.)
- **The designer only sees what is bundled.** A board naming its own `connector_dir` or `theme_dir` has files on disk the browser cannot read, so it renders with the bundled definition of any name it shares. `bridge.generate` returns warnings for this and the Generate dialog shows them. Keep that reporting intact: without it the designer silently disagrees with the CLI.
- **The designer's Generate matches the CLI byte for byte.** Both run the same loaders and `generate_html`, and the CLI writes LF on every platform. Keep it that way.
- **Adding a connector `style` requires code, not config.** The twelve styles (`box`, `latch`, `grid`, `header-male`, `screw-terminal`, `barrier`, `button`, `xt30`, `sherlock`, `slide-switch`, `stepstick`, `none` — `_BODY_STYLES` in `config.py`) are drawn by custom code in `src/pinconnect/renderer.py`. Write it once: the designer calls the same function. `none` is the odd one out: both renderers return an empty string for it, and the page then leaves out the drawing slot and the type/pin-count line, so such a connector is a hotspot carrying only a name and a description.
- **A new `style` must be drawn in detail and match the real connector.** Study the existing `xt30` and `grid` styles as the quality bar: the render should reproduce the actual connector's housing shape as closely as possible, not a generic rectangle. Critically, the polarizing/keying features (latches, chamfers, cavities, the flat/keyed side) must be clearly visible in the render so a human can read the connector's orientation at a glance and not miswire it — this is a safety property, not a cosmetic one. A front cross-section DXF of the connector is the ideal reference to model the geometry from.
- **By default the generated HTML references the board image by relative path** (it is not embedded). The `-i` / `--image-embed` flag base64-encodes the image into the HTML instead. Any change to output handling must preserve both modes. Note that `-i` alone does not make the file fully offline: a theme whose font `source` is `"google"` (including the default theme's Roboto) still emits Google Fonts `<link>` tags.
- **Board config, connector type, and theme are three different TOML schemas.** See `config.py` for the exact dataclasses: `Board`/`Connector`/`Pin` (`load_board`), `ConnectorType`/`ConnectorGeometry` (`load_connector_type`), and `Theme`/`ThemeFont`/`ThemeBehavior` (`load_theme`). Connector types and themes both resolve from the board's directory first (`connector_dir`, `theme_dir`) and then fall back to the bundled sets.
- **Unknown `[geometry]` keys are rejected**, not ignored: `load_connector_type` raises `ValueError("<file>: unknown [geometry] key(s): ...")` and coerces each value to its field's type, so typos fail loudly at load time. Unknown `[colors.*]` theme tokens are the deliberate exception — they pass through and become extra CSS variables for `[extra_css]` to use.
- **The generated page can be driven from outside.** It picks its color scheme from `?theme=dark|light`, a `{pinconnectTheme: "dark"|"light"}` `postMessage`, or — same-origin — the embedding site's scheme (MkDocs Material / Zensical `data-md-color-scheme`, a generic `data-theme`, or a `dark` class), tracked live with a `MutationObserver`; with no signal it follows `prefers-color-scheme`. Keep this contract intact when touching the renderer's theme-sync script.
- **The page reports its height in one message with two keys**, `{pinconnectHeight: v, mdIframeHeight: v}`, when its theme stacks the connector list. `mdIframeHeight` is for `md-iframe`; `pinconnectHeight` is for sites still on `pinout-embed`, which listens for that key alone. Keep both, in one message.
- **Jumper settings are data on a pin header, not connector types.** A `[[connector.setting]]` has `label`, `jumpers` (`"a-b"` strings of 1-based pin-list positions), `default`, `group` and `description`; settings sharing a group are alternatives. `config.parse_settings` checks them (unknown keys are errors) and is shared by `load_board` and the designer's bridge, so the preview fails exactly where Generate does. The two checks that need the type's layout live in `renderer.py`: settings only on `header-male` types, and each jumper must join neighbors (`_check_jumpers`); the CLI reports both as `Error:` lines. The drawing carries every setting as a `<g data-setting>` (non-opening ones `display="none"`, so the SVG alone shows the defaults) and tags pins `data-pin`; the page's `jDraw` and the designer's `_decoratePreview` toggle those. In the designer, pin deletes and moves renumber jumpers (`renumberJumpers`), and keys a setting has no field for travel in `Setting.unknown` so the bridge can reject them.
- **`pinout_embed` depends on the `attr_list` Markdown extension** for its `{ type=application/pinout }` tag syntax.

## Old names

Users install unpinned from `master`, so every old name keeps working for good:

- **`legacy_main()` is the `pinout-gen` command line, frozen.** Its parser, help text and error messages ("a config file is required (use --serve to open the designer)", "--serve renders nothing, so it takes no config file") must stay byte-identical to pinout-gen 0.2.0. Change `main()` freely; never `legacy_main()`'s strings.
- **`pinconnect` ships only `pinconnect/` and the `pinconnect` script.** No `pinout_gen` package and no `pinout-gen` script: those belong to the `pinout-gen` compatibility distribution. If two distributions install the same path, upgrading a long-lived venv deletes it.
- **`pinconnect --serve [PORT]`** still opens the designer, as a hidden alias of `pinconnect [--port N]`.

## Common commands

Install for development and run the designer (Python 3.9+):

```bash
pip install -e .
pinconnect                   # builds the payload, picks a port, opens a browser
pinconnect --port 8000 --no-browser
```

Render a board:

```bash
pinconnect examples/example.toml   # writes examples/example.pinout.html
```

The default output path is `<config_stem>.pinout.html`; `-o` overrides it. (`example.toml` points at `image = "board.png"`, which is not in the repo — supply your own image to render it.)

Build the designer's payload by hand (only needed to serve `src/pinconnect/designer/` some other way):

```bash
python -m pinconnect.payload --force
```

Nothing needs regenerating after editing a connector type, a theme, or `symbols.py`: the designer reads them through the bridge. `pinconnect` rebuilds the payload whenever the package changes, including when a file is **removed**.

Install the Markdown extension:

```bash
pip install ./pinout_embed
```

## Regenerating doc images

The images in `docs/` are generated, not hand-made, so they can be refreshed when the thing they show changes. Each generator is a `tools/<name>/generate.py` with its own README, run from the repo root; they import `pinconnect` from `src/`, so no install is needed (all need `pip install playwright pillow`; Playwright drives the system Chrome, no download). Regenerate the relevant set and commit the updated assets in the same change:

- `tools/symbol-icons/` — the symbol SVGs in `assets/symbols/` (after editing `symbols.py`).
- `tools/connector-gallery/` — `connector-gallery.webp` and `label-styles.webp` (after adding/changing a connector type or body style).
- `tools/theme-gallery/` — the 12 `theme-*.webp` (after a theme or renderer change that affects appearance).
- `tools/designer-screenshots/` — the 9 `designer-*`/`workflow-*` PNGs (after a change to the designer's chrome). It builds the payload and waits for the runtime before shooting, so the images never capture a half-started app.
- `tools/jumper-gallery/` — `jumper-shapes.webp` and `workflow-jumpers.png` (after a change to how jumper settings draw, the tooltip's settings strip, or the designer's settings section). Its `sample.toml` holds one header per common shape, so it needs no outside board.

`connector-gallery` and `symbol-icons` render straight from the package and need no board, and `jumper-gallery` brings its own. `theme-gallery` and `designer-screenshots` need a sample board+image; they default to the maintainer's board (outside the repo), so pass your own as arguments. `tools/demo-gif/` is intentionally git-ignored (local-only).

## Conventions

- **Docs use one line per paragraph.** GitHub's Markdown viewer soft-wraps, so do not hard-wrap prose in `docs/` or the READMEs — keep each paragraph on a single line.
- **Docs are US English.** Prose uses `colors`, `behaviors`, `gray`, `labeled` — matching the TOML keys users actually type (`color`, `[colors.light]`, `[behavior]`). This applies to image alt text and table headers too.
- **Keep the docs in step with behavior.** The board TOML reference (`docs/reference/board-toml.md`), connector types (`docs/reference/connector-types.md`), themes (`docs/reference/themes.md`), and `config.py` describe the same three schemas; change them together.
- **Generated and ephemeral directories are git-ignored** via the root `.gitignore` plus a `*` `.gitignore` inside each throwaway directory (`venv/`, `build/`, `*.egg-info/`, `__pycache__/`, `.claude/`). Do not commit `*.pinout.html` output or `src/pinconnect/designer/pinconnect.zip`.
- **No new runtime dependencies without reason.** `pinconnect` relies only on the standard library (`tomllib`, with a `tomli` fallback below 3.11); the designer is dependency-free vanilla JS at runtime. Keep it that way unless there is a strong case.

## Verifying changes

- After editing `renderer.py` or a connector type, render `examples/example.toml` and open the HTML to eyeball the result — connectors do not need to sit on a real board image to be inspected.
- After editing a connector type, theme, or `symbols.py`, restart `pinconnect` and confirm the designer still lists and renders what you changed.
- After changing packaging, build a wheel (`python -m build`) and list it: it should hold exactly `pinconnect/**` plus metadata, with no zip, no tests and nothing named `pinout_gen`.
- **Tests are not committed** (`test_*.py` is git-ignored), so a fresh clone has none. A working copy may still have `tests/` (and `pinout_embed/tests/`) — if they are present, run `pytest` there before finishing, and add cases for new behavior. Never `git add` a test file.
- Beyond that, validate by generating output and viewing it.
