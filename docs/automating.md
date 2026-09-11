# Automating

The designer is the quickest way to make a pinout, but it needs a person. `pinout-gen` renders the same file from a saved config with no interaction, which is what you want for regenerating pinouts as a board changes, keeping them in version control, or publishing a documentation site from CI.

The output is identical either way. The designer runs this same generator in the browser, so a config rendered in both places produces the same bytes.

## Install

`pinout-gen` needs **Python 3.9 or newer** and has no dependencies beyond the standard library on 3.11 and above. Older versions also pull in `tomli`, a TOML parser.

Clone the repository and install from it:

```bash
git clone https://github.com/xbst/PinConnect.git
cd PinConnect
pip install ./pinout_gen
```

A virtual environment is recommended but optional:

**PowerShell**

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install .\pinout_gen
```

**Linux / macOS**

```bash
python3 -m venv venv
source venv/bin/activate
pip install ./pinout_gen
```

Check it worked:

```bash
pinout-gen --help
```

### Without cloning

`pip` can install straight from GitHub, which is what CI usually wants:

```bash
pip install "git+https://github.com/xbst/PinConnect.git@master#subdirectory=pinout_gen"
```

Installing from `master` means each run picks up the newest generator, so regenerated pinouts carry the latest fixes. See [publishing with GitHub Pages](embedding.md#publishing-with-github-pages).

### For development

```bash
pip install -e ./pinout_gen
```

An editable install also makes `--serve` use the designer files in your checkout, so edits to it take effect on reload.

## Run the designer locally

Installing the tool also installs the designer, so you do not need to serve it yourself:

```bash
pinout-gen --serve
```

That builds what the designer needs, starts a local server on a free port, and opens a browser. `--serve 8000` picks the port; `--no-browser` skips opening one.

Use this when you want the designer offline from the hosted site, or when you are working on the designer itself. It still downloads its Python runtime from a CDN on first load, so a fully offline machine should use the command line instead.

## Render a config

```bash
pinout-gen board.toml
```

This writes `board.pinout.html` beside the config, and prints what it did:

```
Generated: /path/to/board.pinout.html  (14 connectors)
```

Write somewhere else with `-o` / `--output`. The directory must already exist.

```bash
pinout-gen board.toml -o docs/my-board.html
```

## What it needs alongside the config

Three things are resolved relative to the board config:

- **The board image**, from `image` in `[board]`. Referenced by the output rather than embedded, unless you pass `-i`.
- **The connector types**, from `connector_dir` (default `./connectors`, beside the config) first, then the types bundled with the package. Putting a `<type>.toml` in your `connector_dir` overrides a bundled type of the same name. See [connector types](reference/connector-types.md).
- **The theme**, from `theme_dir` (default `./themes`) first, then the bundled themes. See [Themes](reference/themes.md).

A board using its own `connector_dir` or `theme_dir` is one the designer cannot render faithfully, since those files are on your disk. Render those with this command.

## Keep the image beside the output

By default the generated HTML links the board image by the same relative path the config uses. If `board.toml` says `image = "board.png"`, then `board.png` must sit next to `board.pinout.html`. Move one, move the other.

To avoid that, embed the image instead.

## Embed the board image

`-i` / `--image-embed` base64-encodes the image into the HTML, giving one file that carries everything:

```bash
pinout-gen board.toml -i
```

That reads `image` from the config. To embed a different file:

```bash
pinout-gen board.toml -i other.png
```

`-i` covers the image only. A theme whose font comes from Google Fonts, including the default, still loads it from the web, so an offline page falls back to a system font. For output with no external references at all, pair `-i` with a theme using a `bundled` or `system` font. See [Themes](reference/themes.md).

## Choose a theme

`-t` / `--theme` overrides the board's `[board] theme` for one run:

```bash
pinout-gen board.toml --theme midnight
```

The bundled themes are `default`, `midnight`, `ocean`, `slate`, `terminal` and `workbench`.

## Regenerating as a board changes

The config is the thing worth keeping in version control. A pinout is derived from it, so a board revision means editing the config and running the command again rather than starting over:

```bash
pinout-gen boards/rev-c.toml -o site/rev-c.pinout.html -i
```

Because the designer and the command produce the same bytes, you can move between them freely: design a board visually, save the config, and regenerate it from a script afterwards.

## Common errors

All of these print to stderr and exit with status 1.

- **`Error: config file not found`** — check the path and your working directory.
- **`Error: Connector type '<name>' not found`** — no `<name>.toml` in either `connector_dir` or the bundled types. The message names both folders. Fix the `type` value or add the type; see [connector types](reference/connector-types.md).
- **`Error: Theme '<name>' not found`** — same lookup, for `-t` or `[board] theme`. See [Themes](reference/themes.md).
- **`Error: image file not found`** — `-i` could not read the board image.
- **`Error: port must be between 0 and 65535`** — an out-of-range port passed to `--serve`.

A malformed config reports the specific problem, such as a TOML syntax error, a missing required key, an unknown `[geometry]` key, or a duplicate connector `id`, rather than a traceback.
