# Getting Started

This guide takes you end to end: from a photo of your board to an interactive pinout you can drop into a documentation site. It should take about five minutes.

PinConnect has three tools, used in sequence:

1. **pinout-design** — a browser-based designer that turns a board image into a TOML config.
2. **pinout-gen** — a CLI that reads that TOML and generates a self-contained interactive HTML pinout.
3. **pinout-embed** — an optional Markdown extension that embeds the generated HTML into MkDocs / Zensical sites.

You only need the first two to get a working pinout. The third is for people publishing to a Markdown docs site.

## Prerequisites

- **Python 3.9 or newer** (`python --version`)
- A **top-down image** of your board (PNG or JPG)
- A copy of this repository

---

## Step 1 — Design your pinout

The designer is a static web app. It reads its connector library over `fetch()`, so it must be served over HTTP — opening `index.html` directly with `file://` will not work.

Start a local server from the `pinout_design` folder:

**PowerShell**

```powershell
cd pinout_design
python -m http.server 8000
```

**Linux / macOS**

```bash
cd pinout_design
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

In the designer:

1. Click **Open Image** and select your board photo.
2. Click **+ Add Connector** and drag a box over each connector on the image.
3. Select a connector to set its type, name, description, and per-pin labels and colors in the editor panel.
4. Watch the **TOML Source** pane update live as you work.
5. Click **Save TOML** to download your board config (for example `board.toml`).

Save the downloaded `.toml` next to your board image — the next step expects them together.

See [pinout-design](pinout-design.md) for a full tour of the designer.

---

## Step 2 — Generate the HTML

Install the generator from the repository root. Using a virtual environment is recommended but optional.

**PowerShell**

```powershell
python -m venv venv
./venv/Scripts/activate
pip install .\pinout_gen
```

**Linux / macOS**

```bash
python3 -m venv venv
source venv/bin/activate
pip install ./pinout_gen
```

This installs the `pinout-gen` command. Run it on your config:

```bash
pinout-gen board.toml
```

By default this writes `board.pinout.html` next to the config. Use `-o` to choose a different path:

```bash
pinout-gen board.toml -o docs/my-board.html
```

> **Keep the image alongside the output.** The generated HTML links to your board image by the same relative path used in the TOML — it is not embedded. Make sure the image file sits next to the HTML (or serve both from the same folder) or the diagram will show a broken image.

Open the resulting `.html` file in a browser to check your interactive pinout.

See [pinout-gen: generating HTML](pinout-gen/generating-html.md) and [board TOML reference](pinout-gen/board-toml.md) for more.

---

## Step 3 — Embed it in a docs site (optional)

If you publish with **MkDocs** or **Zensical**, `pinout-embed` lets you drop the generated pinout into a page with an image-style tag:

```markdown
![Board Pinout](my-board.pinout.html){ type=application/pinout style="min-height:60vh;width:100%" }
```

The extension replaces that tag with a responsive `<iframe>` at build time.

See [pinout-embed](pinout-embed/mkdocs-zensical.md) for installation and configuration.

---

## Where to go next

- [Concepts](concepts.md) — how the pieces fit together and the two kinds of TOML files.
- [pinout-design](pinout-design.md) — designing configs visually.
- [pinout-gen](pinout-gen/generating-html.md) — CLI usage, board TOML, and connector types.
- [pinout-embed](pinout-embed/mkdocs-zensical.md) — embedding in a Markdown site.
