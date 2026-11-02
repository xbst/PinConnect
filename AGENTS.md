# AGENTS.md

Guidance for AI coding agents working in the PinConnect repository. Human-facing documentation lives in a separate repository, [doctools-docs](https://github.com/xbst/doctools-docs), published at <https://doctools.isiks.tech/pinconnect/>; this repository keeps only a short [`README.md`](README.md). This file covers how the pieces fit together and the conventions to follow when changing them.

## What this project is

PinConnect turns a photo of a PCB into an interactive pinout diagram. It is one tool, **`pinconnect`**: one command, one distribution, one Python package. It has two front ends over one renderer, plus an optional publishing step:

1. **The designer** (`src/pinconnect/designer/`) — a browser app that writes a board TOML config and renders the pinout. It does not reimplement the renderer: it loads the `pinconnect` package into the page under Pyodide and calls it. `pinconnect` with no arguments serves it locally; it is also hosted at <https://pinconnect.isiks.tech>.
2. **The command line** (`pinconnect board.toml`) — reads that TOML and renders a single interactive HTML file.
3. **The Markdown extension** — a Python-Markdown extension that embeds the generated HTML into MkDocs / Zensical sites. It lives in its own repository, [md-iframe](https://github.com/xbst/md-iframe); it used to be `pinout_embed/` here, which is now a compatibility stub (see "Compatibility stubs" below).

The board TOML config is the interface between the designer and the renderer; the generated HTML is the interface between the renderer and the publishing step.

`pinconnect` was previously two tools, `pinout-gen` (the CLI, package `pinout_gen`) and `pinout-design` (the designer, then a sibling folder). Those old names keep working through compatibility code (see "Old names" below); everything new uses `pinconnect`.

## Repository layout

- `pyproject.toml` — the `pinconnect` distribution (src layout). Declares one console script, `pinconnect`. `MANIFEST.in` only keeps a working copy's tests out of the sdist.
- `src/pinconnect/` — the package.
  - `cli.py` — `main()` (the `pinconnect` command) and `legacy_main()` (the old `pinout-gen` command line), sharing the render and serve code. `__main__.py` makes `python -m pinconnect` call `main()`.
  - `config.py` (TOML dataclasses + loaders), `renderer.py` (SVG/HTML generation), `symbols.py` (bundled symbol icons + name aliases).
  - `serve.py` — the local designer server, which rebuilds the payload when a request finds it stale. `payload.py` — locates the designer (`designer_root()`) and builds the Pyodide payload (`build_payload()`); `python -m pinconnect.payload [--force]` builds it by hand.
  - `connectors/` — connector type definitions (`*.toml`). **Source of truth** for connector geometry, bundled with the package so they are found regardless of where the tool is run.
  - `themes/` — theme definitions (`*.toml`). **Source of truth** for themes, bundled the same way.
  - `designer/` — the visual designer (vanilla ES modules, no framework): `index.html`, `css/`, `js/` (`board-model.js`, `state.js`, `*-panel.js`, `toml-io.js`, `dialogs.js`, `type-menu.js` builds the grouped Type menus, `runtime.js` boots Pyodide, `main.js`) and `py/bridge.py`, the only Python the designer adds: a thin shim over `pinconnect` for the catalogs, the connector preview, and Generate.
  - `designer/pinconnect.zip` — the payload the browser fetches at startup. **Generated and git-ignored.**
- `examples/example.toml` — example board config.
- `pinout_gen/` — the `pinout-gen` compatibility stub, a distribution of its own (see "Compatibility stubs" below).
- `pinout_embed/` — the `pinout-embed` compatibility stub, likewise.
- `assets/pinout-demo.gif` — the README's demo animation. Every other doc image lives in doctools-docs (see "Documentation" below).

## Key facts and gotchas

- **The designer must be served over HTTP.** It fetches `pinconnect.zip` at startup, so opening `index.html` via `file://` fails. Run `pinconnect`, which builds the payload, picks a free port and opens a browser. Serving the folder by hand needs `python -m pinconnect.payload` first (in a source checkout; an installed copy needs `python -m pinconnect.payload <designer folder>/pinconnect.zip`, since its default is the user cache), or the designer boots into "Renderer unavailable".
- **The designer lives inside the package.** Nothing is copied at build time: a wheel ships `src/pinconnect/designer/` as package data, and an editable install serves the checkout's own files. The payload is built beside the designer only in a source checkout (`src/pinconnect` next to a `pyproject.toml`); an installed package builds it in the per-user cache (`<cache>/pinconnect/<hash of the package path>/`, one per install so venvs never serve each other's code, where `<cache>` is `%LOCALAPPDATA%` on Windows and `$XDG_CACHE_HOME` or `~/.cache` elsewhere), even when site-packages is writable, because pip would never remove a file written there.
- **The payload holds `bridge.py` at its root and the package under `pinconnect/`,** minus the server-side modules (`cli.py`, `serve.py`, `payload.py`, `__main__.py`) and the designer itself. The zip's comment is a digest of every source's name and bytes, and `payload_is_stale` compares it rather than mtimes, so a removed, renamed or changed file triggers a rebuild. The Pages workflow (`.github/workflows/pages.yml`) builds it with `PYTHONPATH=src python -m pinconnect.payload` and checks those properties.
- **A running `pinconnect` rebuilds a stale payload when the designer asks for it.** Each request for `pinconnect.zip` compares the digest with the package first (a few milliseconds per page load) and rebuilds the zip where it was built, so after an edit to the package (a connector type, a theme, `symbols.py`, the renderer, the bridge) reloading the designer is enough for its Generate to match the CLI again. A page already open keeps the payload it booted with, and only an edit to the server itself (`serve.py`, `payload.py`) needs a restart. `serve._Payload` checks, rebuilds and reads under one lock and sends the bytes from memory: two threads building at once would share the process's temporary file, and Windows refuses to replace a zip that a request still has open. A payload that cannot be built is a 500 with the reason on the console, never the old one.
- **Package data is listed by file type** in `pyproject.toml` (`designer/js/*.js` and so on), not with a recursive glob: older setuptools releases do not expand `**`, and the explicit list keeps the payload zip and bytecode caches out of the wheel. A new kind of designer file (a new folder or extension) needs a line there.
- **One representation of connector types, themes, and symbols.** `src/pinconnect/connectors/*.toml`, `themes/*.toml` and `symbols.py` are read by the designer through the bridge, so there is nothing to mirror and nothing to regenerate. (There used to be JSON copies and a `convert-connectors.py`; both are gone. Do not reintroduce them.)
- **The designer only sees what is bundled.** A board naming its own `connector_dir` or `theme_dir` has files on disk the browser cannot read, so it renders with the bundled definition of any name it shares. `bridge.generate` returns warnings for this and the Generate dialog shows them. Keep that reporting intact: without it the designer silently disagrees with the CLI.
- **The designer's Generate matches the CLI byte for byte.** Both run the same loaders and `generate_html`, and the CLI writes LF on every platform. Keep it that way.
- **Adding a connector `style` requires code, not config.** The twelve styles (`box`, `latch`, `grid`, `header-male`, `screw-terminal`, `barrier`, `button`, `xt30`, `sherlock`, `slide-switch`, `stepstick`, `none` — `_BODY_STYLES` in `config.py`) are drawn by custom code in `src/pinconnect/renderer.py`. Write it once: the designer calls the same function. `none` is the odd one out: both renderers return an empty string for it, and the page then leaves out the drawing slot and the type/pin-count line, so such a connector is a hotspot carrying only a name and a description.
- **A new `style` must be drawn in detail and match the real connector.** Study the existing `xt30` and `grid` styles as the quality bar: the render should reproduce the actual connector's housing shape as closely as possible, not a generic rectangle. Critically, the polarizing/keying features (latches, chamfers, cavities, the flat/keyed side) must be clearly visible in the render so a human can read the connector's orientation at a glance and not miswire it — this is a safety property, not a cosmetic one. A front cross-section DXF of the connector is the ideal reference to model the geometry from.
- **By default the generated HTML references the board image by relative path** (it is not embedded). The `-i` / `--image-embed` flag base64-encodes the image into the HTML instead. Any change to output handling must preserve both modes. Note that `-i` alone does not make the file fully offline: a theme whose font `source` is `"google"` (including the default theme's Roboto) still emits Google Fonts `<link>` tags.
- **Board config, connector type, and theme are three different TOML schemas.** See `config.py` for the exact dataclasses: `Board`/`Connector`/`Pin` (`load_board`), `ConnectorType`/`ConnectorGeometry` (`load_connector_type`), and `Theme`/`ThemeFont`/`ThemeBehavior` (`load_theme`). Connector types and themes both resolve from the board's directory first (`connector_dir`, `theme_dir`) and then fall back to the bundled sets.
- **A connector type's `category` and `menu_name` belong to the designer alone.** They place the type in the designer's grouped Type menus and name it in its connector list ("Pin Header" › "2.54mm Dual Row" for `HDR-254-2R`). `bridge.connector_catalog` fills in their defaults (`Other`, then `name`) and returns the catalog in menu order: categories alphabetical with `Other` last, entries by natural sort. Boards still name a type by its filename and the page's type line shows `name`, so neither key may reach `generate_html`. Give every bundled type both.
- **Unknown `[geometry]` keys are rejected**, not ignored: `load_connector_type` raises `ValueError("<file>: unknown [geometry] key(s): ...")` and coerces each value to its field's type, so typos fail loudly at load time. Unknown `[colors.*]` theme tokens are the deliberate exception — they pass through and become extra CSS variables for `[extra_css]` to use.
- **The generated page can be driven from outside.** It picks its color scheme from `?theme=dark|light`, a `{pinconnectTheme: "dark"|"light"}` `postMessage`, or — same-origin — the embedding site's scheme (MkDocs Material / Zensical `data-md-color-scheme`, a generic `data-theme`, or a `dark` class), tracked live with a `MutationObserver`; with no signal it follows `prefers-color-scheme`. Keep this contract intact when touching the renderer's theme-sync script.
- **The page reports its height in one message with two keys**, `{pinconnectHeight: v, mdIframeHeight: v}`, when its theme stacks the connector list. `mdIframeHeight` is for `md-iframe`; `pinconnectHeight` is for sites still on `pinout-embed`, which listens for that key alone. Keep both, in one message.
- **Jumper settings are data on a pin header, not connector types.** A `[[connector.setting]]` has `label`, `jumpers` (`"a-b"` strings of 1-based pin-list positions), `default`, `group` and `description`; settings sharing a group are alternatives. `config.parse_settings` checks them (unknown keys are errors) and is shared by `load_board` and the designer's bridge, so the preview fails exactly where Generate does. The two checks that need the type's layout live in `renderer.py`: settings only on `header-male` types, and each jumper must join neighbors (`_check_jumpers`); the CLI reports both as `Error:` lines. The drawing carries every setting as a `<g data-setting>` (non-opening ones `display="none"`, so the SVG alone shows the defaults) and tags pins `data-pin`; the page's `jDraw` and the designer's `_decoratePreview` toggle those. In the designer, pin deletes and moves renumber jumpers (`renumberJumpers`), and keys a setting has no field for travel in `Setting.unknown` so the bridge can reject them.
## Old names

Users install unpinned from `master`, so every old name keeps working for good:

- **`legacy_main()` is the `pinout-gen` command line, frozen.** Its parser, help text and error messages ("a config file is required (use --serve to open the designer)", "--serve renders nothing, so it takes no config file") must stay byte-identical to pinout-gen 0.2.0. Change `main()` freely; never `legacy_main()`'s strings.
- **`pinconnect` ships only `pinconnect/` and the `pinconnect` script.** No `pinout_gen` package and no `pinout-gen` script: those belong to the `pinout-gen` compatibility distribution. If two distributions install the same path, upgrading a long-lived venv deletes it.
- **`pinconnect --serve [PORT]`** still opens the designer, as a hidden alias of `pinconnect [--port N]`.

## Compatibility stubs

`pinout_gen/` and `pinout_embed/` are small distributions that keep the old names installable: `pip install "git+...@master#subdirectory=pinout_gen"` and `pinout-gen @ git+...` requirements lines are in CI configs and long-lived venvs that nobody will update. Each stub depends on its replacement and adds only the old names. **They are never removed**, and neither is anything in them.

- **`pinout-gen`** (0.3.0) depends on `pinconnect @ git+https://github.com/xbst/PinConnect.git@master`. It declares the `pinout-gen` script (`pinconnect.cli:legacy_main`) and ships the `pinout_gen` package, which puts each `pinconnect` module in `sys.modules` under its old name (`pinout_gen.designer` is `pinconnect.payload`) and warns with a `DeprecationWarning`, hidden by default. `pinout_gen/cli.py` is a module of its own rather than an alias, because its `main` is `legacy_main`.
- **`pinout-embed`** (0.2.0) depends on `md-iframe @ git+https://github.com/xbst/md-iframe.git@master` and ships `pinout_embed.py`, which re-exports md-iframe under the old names (`PinoutExtension`, `makeExtension`, `EMBED_CLASS = "pinconnect-embed"`). It serves the dotted `pinout_embed:PinoutExtension` form; plain `- pinout_embed` resolves to md-iframe's entry point of that name without importing the module.
- **File ownership.** A file with an old name belongs to the stub with the same old name and to no other distribution: the `pinout_gen` package and the `pinout-gen` script to `pinout-gen`, `pinout_embed.py` to `pinout-embed`. When pip upgrades `pinout-gen` 0.2.0 in place, it installs the new dependency first and then uninstalls the old distribution, deleting every file that distribution recorded. If `pinconnect` also shipped `pinout_gen/`, that uninstall would delete `pinconnect`'s copy. Upgrading a stub over its own older version replaces its own files, which is safe.
- **The stub's URL and the package name must match.** Requirements lines say `pinout-gen @ ...` and `pinout-embed @ ...`, and pip rejects a URL whose metadata names a different distribution. Keep both `name`s.
- **The dependency lines point at GitHub `master`**, so a stub can only be tested before release with a temporary copy whose URL points at a local checkout (`git+file:///...`). PyPI rejects direct-URL dependencies: when the packages reach PyPI, the PyPI builds of the stubs depend on `pinconnect` / `md-iframe` by name.
- **Both stubs need `setuptools>=77`** for the SPDX `license` string, and each has a `MANIFEST.in` that keeps a working copy's tests out of its sdist.

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

Nothing needs regenerating after editing a connector type, a theme, or `symbols.py`: the designer reads them through the bridge. `pinconnect`, even one already running, rebuilds the payload whenever the package changes, including when a file is **removed**. Reload the designer to load it.

Install the Markdown extension (it needs `attr_list` enabled beside it for the `{ type=iframe }` tag syntax):

```bash
pip install "git+https://github.com/xbst/md-iframe.git@master"
```

## Documentation

The docs live in [doctools-docs](https://github.com/xbst/doctools-docs) (a sibling checkout, `..\doctools-docs`), a Zensical site shared with md-iframe and future tools. The PinConnect pages are under its `docs/pinconnect/`; topics shared by every tool (publishing from CI, light and dark mode, theming) are under `docs/guides/`, and `docs/migration.md` records the old names. Its live examples are rendered in its CI from `master`, so they show what `master` generates.

- **A behavior change here usually needs a docs change there.** Make it in doctools-docs in step with the code change, as a commit in that repository, and mention it in this one's commit message.
- **The doc images are generated there too.** Its `tools/` holds the generators (`symbol-icons`, `connector-gallery`, `theme-gallery`, `designer-screenshots`, `jumper-gallery`), which render with the installed `pinconnect`; to shoot a change before it reaches `master`, `pip install -e` this checkout into doctools-docs' venv. Rerun the matching generator after changing `symbols.py`, a connector type or body style, a theme or the renderer's look, the designer's chrome, or how jumper settings draw, and commit only images whose pixels changed. Its `tools/README.md` has the table.
- `tools/demo-gif/` here is intentionally git-ignored (local-only); it makes `assets/pinout-demo.gif`.

## Conventions

- **Docs use one line per paragraph.** GitHub's Markdown viewer soft-wraps, so do not hard-wrap prose in the READMEs or in doctools-docs — keep each paragraph on a single line.
- **Docs are US English.** Prose uses `colors`, `behaviors`, `gray`, `labeled` — matching the TOML keys users actually type (`color`, `[colors.light]`, `[behavior]`). This applies to image alt text and table headers too.
- **Keep the docs in step with behavior, across repositories.** doctools-docs' board TOML reference (`docs/pinconnect/reference/board-toml.md`), connector types (`docs/pinconnect/reference/connector-types.md`), themes (`docs/pinconnect/reference/themes.md`), and this repository's `config.py` describe the same three schemas; change them together. The same goes for its light and dark guide (the theme-sync contract) and md-iframe's auto-height page (the height message).
- **Generated and ephemeral directories are git-ignored** via the root `.gitignore` plus a `*` `.gitignore` inside each throwaway directory (`venv/`, `build/`, `*.egg-info/`, `__pycache__/`, `.claude/`). Do not commit `*.pinout.html` output or `src/pinconnect/designer/pinconnect.zip`.
- **No new runtime dependencies without reason.** `pinconnect` relies only on the standard library (`tomllib`, with a `tomli` fallback below 3.11); the designer is dependency-free vanilla JS at runtime. Keep it that way unless there is a strong case.

## Verifying changes

- After editing `renderer.py` or a connector type, render `examples/example.toml` and open the HTML to eyeball the result — connectors do not need to sit on a real board image to be inspected.
- After editing a connector type, theme, or `symbols.py`, reload the designer (a running `pinconnect` rebuilds its payload; restart it only after changing `serve.py` or `payload.py`) and confirm it still lists and renders what you changed.
- After changing packaging, build a wheel (`python -m build`) and list it: it should hold exactly `pinconnect/**` plus metadata, with no zip, no tests and nothing named `pinout_gen`.
- **Tests are not committed** (`test_*.py` is git-ignored), so a fresh clone has none. A working copy may still have `tests/` — if they are present, run `pytest` there before finishing, and add cases for new behavior. Never `git add` a test file.
- Beyond that, validate by generating output and viewing it.
