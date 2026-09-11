# AGENTS.md

Guidance for AI coding agents working in the PinConnect repository. Human-facing documentation lives in [`docs/`](docs/) and [`README.md`](README.md); this file covers how the pieces fit together and the conventions to follow when changing them.

## What this project is

PinConnect turns a photo of a PCB into an interactive pinout diagram. One generator, two front ends, and an optional publishing step:

1. **pinout-design** (`pinout_design/`) — a browser app that writes a board TOML config and renders the pinout. It does not reimplement the renderer: it loads `pinout_gen` into the page under Pyodide and calls it.
2. **pinout-gen** (`pinout_gen/`) — a Python CLI that reads that TOML and renders a single interactive HTML file.
3. **pinout-embed** (`pinout_embed/`) — a Python-Markdown extension that embeds the generated HTML into MkDocs / Zensical sites.

The board TOML config is the interface between stage 1 and stage 2; the generated HTML is the interface between stage 2 and stage 3.

The tools are named with hyphens in prose (they are the command names); the underscored forms are directories and Python packages.

## Repository layout

- `pinout_gen/` — the `pinout-gen` CLI package.
  - `pinout_gen/pinout_gen/` — source: `cli.py` (argparse entry point), `config.py` (TOML dataclasses + loaders), `renderer.py` (SVG/HTML generation), `symbols.py` (bundled symbol icons + name aliases).
  - `pinout_gen/pinout_gen/connectors/` — connector type definitions (`*.toml`). **Source of truth** for connector geometry. Bundled with the package so they are found regardless of where the tool is run.
  - `pinout_gen/pinout_gen/themes/` — theme definitions (`*.toml`). **Source of truth** for themes, bundled the same way.
  - `pinout_gen/example.toml` — example board config.
- `pinout_design/` — the visual designer (vanilla ES modules, no framework).
  - `js/` — `board-model.js`, `state.js`, `*-panel.js`, `toml-io.js`, `dialogs.js`, `runtime.js` (boots Pyodide), `main.js`.
  - `py/bridge.py` — the only Python the designer adds: a thin shim over `pinout_gen` for the catalogs, the connector preview, and Generate.
  - `pinout_gen.zip` — the payload the browser fetches at startup. **Generated and git-ignored**; built by `pinout_gen.designer.build_payload`.
  - `tools/build-payload.py` — builds the payload for anyone serving this folder without `--serve`.
- `pinout_embed/` — single-module Markdown extension (`pinout_embed.py`).
- `docs/` — human documentation.
- `tools/` — repo-level doc-asset generators, each its own folder with a `generate.py` and a `README.md` (see "Regenerating doc images" below). Distinct from `pinout_design/tools/`, which holds the designer's own build scripts.

## Key facts and gotchas

- **The designer must be served over HTTP.** It fetches `pinout_gen.zip` at startup, so opening `index.html` via `file://` fails. Use `pinout-gen --serve`, which builds the payload, picks a free port and opens a browser. Serving the folder by hand needs `python pinout_design/tools/build-payload.py` first, or the designer boots into "Renderer unavailable".
- **One representation of connector types, themes, and symbols.** `pinout_gen/pinout_gen/connectors/*.toml`, `themes/*.toml` and `symbols.py` are read by the designer through the bridge, so there is nothing to mirror and nothing to regenerate. (There used to be JSON copies and a `convert-connectors.py`; both are gone. Do not reintroduce them.)
- **The designer only sees what is bundled.** A board naming its own `connector_dir` or `theme_dir` has files on disk the browser cannot read, so it renders with the bundled definition of any name it shares. `bridge.generate` returns warnings for this and the Generate dialog shows them. Keep that reporting intact: without it the designer silently disagrees with the CLI.
- **Adding a connector `style` requires code, not config.** The eleven styles (`box`, `latch`, `grid`, `header-male`, `screw-terminal`, `barrier`, `button`, `xt30`, `sherlock`, `slide-switch`, `none` — `_BODY_STYLES` in `config.py`) are drawn by custom code in `pinout_gen/pinout_gen/renderer.py`. Write it once: the designer calls the same function. `none` is the odd one out: both renderers return an empty string for it, and the page then leaves out the drawing slot and the type/pin-count line, so such a connector is a hotspot carrying only a name and a description.
- **A new `style` must be drawn in detail and match the real connector.** Study the existing `xt30` and `grid` styles as the quality bar: the render should reproduce the actual connector's housing shape as closely as possible, not a generic rectangle. Critically, the polarizing/keying features (latches, chamfers, cavities, the flat/keyed side) must be clearly visible in the render so a human can read the connector's orientation at a glance and not miswire it — this is a safety property, not a cosmetic one. A front cross-section DXF of the connector is the ideal reference to model the geometry from.
- **By default the generated HTML references the board image by relative path** (it is not embedded). The `-i` / `--image-embed` flag base64-encodes the image into the HTML instead. Any change to output handling must preserve both modes. Note that `-i` alone does not make the file fully offline: a theme whose font `source` is `"google"` (including the default theme's Roboto) still emits Google Fonts `<link>` tags.
- **Board config, connector type, and theme are three different TOML schemas.** See `config.py` for the exact dataclasses: `Board`/`Connector`/`Pin` (`load_board`), `ConnectorType`/`ConnectorGeometry` (`load_connector_type`), and `Theme`/`ThemeFont`/`ThemeBehavior` (`load_theme`). Connector types and themes both resolve from the board's directory first (`connector_dir`, `theme_dir`) and then fall back to the bundled sets.
- **Unknown `[geometry]` keys are rejected**, not ignored: `load_connector_type` raises `ValueError("<file>: unknown [geometry] key(s): ...")` and coerces each value to its field's type, so typos fail loudly at load time. Unknown `[colors.*]` theme tokens are the deliberate exception — they pass through and become extra CSS variables for `[extra_css]` to use.
- **The generated page can be driven from outside.** It picks its color scheme from `?theme=dark|light`, a `{pinconnectTheme: "dark"|"light"}` `postMessage`, or — same-origin — the embedding site's scheme (MkDocs Material / Zensical `data-md-color-scheme`, a generic `data-theme`, or a `dark` class), tracked live with a `MutationObserver`; with no signal it follows `prefers-color-scheme`. Keep this contract intact when touching the renderer's theme-sync script.
- **`pinout_embed` depends on the `attr_list` Markdown extension** for its `{ type=application/pinout }` tag syntax.

## Common commands

Run the designer:

```bash
pinout-gen --serve          # builds the payload, picks a port, opens a browser
```

Install and run the generator (Python 3.9+):

```bash
pip install -e ./pinout_gen        # editable install for development
pinout-gen pinout_gen/example.toml   # writes example.pinout.html next to the config
```

The default output path is `<config_stem>.pinout.html`; `-o` overrides it. (`example.toml` points at `image = "board.png"`, which is not in the repo — supply your own image to render it.)

Nothing needs regenerating after editing a connector type, a theme, or `symbols.py`: the designer reads them through the bridge. `--serve` rebuilds the payload whenever the package changes, including when a file is **removed** (the staleness check compares the archive's contents, not just mtimes).

Install the Markdown extension:

```bash
pip install ./pinout_embed
```

## Regenerating doc images

The images in `docs/` are generated, not hand-made, so they can be refreshed when the thing they show changes. Each generator is a `tools/<name>/generate.py` with its own README, run from the repo root (all need `pip install playwright pillow`; Playwright drives the system Chrome, no download). Regenerate the relevant set and commit the updated assets in the same change:

- `tools/symbol-icons/` — the symbol SVGs in `assets/symbols/` (after editing `symbols.py`).
- `tools/connector-gallery/` — `connector-gallery.webp` and `label-styles.webp` (after adding/changing a connector type or body style).
- `tools/theme-gallery/` — the 12 `theme-*.webp` (after a theme or renderer change that affects appearance).
- `tools/designer-screenshots/` — the 9 `designer-*`/`workflow-*` PNGs (after a change to the designer's chrome). It builds the payload and waits for the runtime before shooting, so the images never capture a half-started app.

`connector-gallery` and `symbol-icons` render straight from the package and need no board. `theme-gallery` and `designer-screenshots` need a sample board+image; they default to the maintainer's board (outside the repo), so pass your own as arguments. `tools/demo-gif/` is intentionally git-ignored (local-only).

## Conventions

- **Docs use one line per paragraph.** GitHub's Markdown viewer soft-wraps, so do not hard-wrap prose in `docs/` or the READMEs — keep each paragraph on a single line.
- **Docs are US English.** Prose uses `colors`, `behaviors`, `gray`, `labeled` — matching the TOML keys users actually type (`color`, `[colors.light]`, `[behavior]`). This applies to image alt text and table headers too.
- **Keep the docs in step with behavior.** The board TOML reference (`docs/reference/board-toml.md`), connector types (`docs/reference/connector-types.md`), themes (`docs/reference/themes.md`), and `config.py` describe the same three schemas; change them together.
- **Generated and ephemeral directories are git-ignored** via the root `.gitignore` plus a `*` `.gitignore` inside each throwaway directory (`venv/`, `build/`, `*.egg-info/`, `__pycache__/`, `.claude/`). Do not commit `*.pinout.html` output, `pinout_design/pinout_gen.zip`, or `pinout_gen/pinout_gen/designer/` (the copy `setup.py` makes when building a wheel).
- **The designer ships inside the wheel.** `setup.py` copies `pinout_design/` into the package before any build, so `pinout-gen --serve` works from any install. `designer_root()` prefers a sibling checkout over that copy, so editing the designer in a source tree takes effect even after a wheel has been built.
- **No new runtime dependencies without reason.** `pinout_gen` relies only on the standard library (`tomllib`, with a `tomli` fallback below 3.11); the designer is dependency-free vanilla JS at runtime. Keep it that way unless there is a strong case.

## Verifying changes

- After editing `renderer.py` or a connector type, regenerate `pinout_gen/example.toml` and open the HTML to eyeball the result — connectors do not need to sit on a real board image to be inspected.
- After editing a connector type, theme, or `symbols.py`, restart `--serve` and confirm the designer still lists and renders what you changed.
- **Tests are not committed** (`test_*.py` is git-ignored), so a fresh clone has none. A working copy may still have `pinout_gen/tests/` and `pinout_embed/tests/` — if they are present, run `pytest` there before finishing, and add cases for new behavior. Never `git add` a test file.
- Beyond that, validate by generating output and viewing it.
