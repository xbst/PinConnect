# Themes

A theme controls how a generated pinout looks and behaves **around** the connectors — colours, fonts, the connector list, symbols, and a few responsive behaviours. The connector diagrams and pin colours themselves are board data and stay the same across themes; a theme restyles the page, the tooltips, and the list.

Themes are bundled with `pinout-gen` the same way connector types are, and you can add your own.

## Applying a theme

Set the board's theme in the `[board]` table of your [board config](board-toml.md):

```toml
[board]
title = "My Board"
image = "board.png"
width = 1920
height = 1080
theme = "midnight"
```

Or override it on the command line (this wins over the board's `theme`):

```bash
pinout-gen board.toml --theme ocean
```

Precedence is **`--theme` → `[board] theme` → `default`**. A theme name is resolved from the board's `theme_dir` (default `./themes`, next to the config) first, then from the themes bundled with the package. An unknown name is an error naming both places it looked.

## Bundled themes

| Theme | Look |
|-------|------|
| `default` | The stock light/dark palette with Roboto. What you get with no theme. |
| `slate` | Cool blue-grey, Inter. |
| `ocean` | Teal and cyan, Inter. |
| `terminal` | Green, monospaced, connector list open by default. |
| `midnight` | Indigo/violet, Inter UI with a monospaced pin-label font. |

Every theme provides both a light and a dark palette; the viewer's light/dark toggle and OS scheme switch between them, exactly like the default.

## Anatomy of a theme file

A theme is a TOML file whose name is the theme name (`midnight.toml` defines `midnight`). Every field is optional and **merges over the built-in defaults**, so a theme only states what differs. A minimal theme is just a name:

```toml
[theme]
name = "My Theme"
```

### `[colors.light]` / `[colors.dark]`

CSS colour values (hex, `rgb()`, `rgba()`, …). Token names are the generated CSS variables without the leading `--`. `light` applies in light mode, `dark` in dark mode.

| Token | What it colours |
|-------|-----------------|
| `bg` | Page background |
| `text` | Primary text |
| `tip-bg` | Tooltip and connector-list background |
| `tip-border` | Tooltip / list border |
| `tip-shadow` | Tooltip / list shadow |
| `hs-hover`, `hs-stroke`, `hs-active` | Hotspot hover fill, outline, and pinned fill |
| `hint-bg`, `hint-text` | Hint pill background / text |
| `divider` | Divider lines |
| `conn-body`, `conn-cavity`, `conn-stroke` | Connector housing fill, cavity fill, outlines |
| `line-color` | Pin lead lines |
| `label-color` | Pin label text (and connector symbols) |
| `desc-color` | Connector description text |
| `type-color` | Connector type / pin-count text |
| `scroll-thumb`, `scroll-track` | Themed scrollbar thumb and track |

```toml
[colors.light]
bg          = "#f8fafc"
text        = "#0f172a"
hs-stroke   = "rgba(37,99,235,.55)"
conn-body   = "#e8edf3"

[colors.dark]
bg          = "#0b1220"
text        = "#e2e8f0"
```

### `[font]` and `[font.label]`

The UI font, and optionally a separate font for the pin labels in the connector diagrams.

| Key | Meaning |
|-----|---------|
| `family` | Font family name |
| `source` | `google` (loaded from Google Fonts), `bundled` (a font file embedded in the output as base64, keeping it self-contained), or `system` (`family` is used verbatim as a CSS stack) |
| `weights` | Weights to request, e.g. `"400;500;600"` — `google` only |
| `file` | Path to the font file relative to the theme, e.g. `"inter.woff2"` — `bundled` only |

`[font.label]` takes the same keys and defaults to `[font]` when omitted.

```toml
[font]
family = "Inter"
source = "google"
weights = "400;500;600"

[font.label]
family = "JetBrains Mono"
source = "google"
weights = "400;500"
```

### `[behavior]`

| Key | Default | Effect |
|-----|---------|--------|
| `sidebar_default_open` | `false` | Start with the connector list shown |
| `sidebar_max_width` | `340` | Max list width in px; the panel sizes to its content up to this (and 40vw), wrapping only if longer |
| `sidebar_responsive_stack` | `false` | Below the breakpoint, the list moves **below** the board and animates open/closed |
| `sidebar_stack_breakpoint` | `640` | Width in px at/under which stacking kicks in |
| `show_symbols` | `true` | Show per-connector [symbols](board-toml.md#symbol); `false` hides them even if set on the board |
| `symbol_style_fallback` | `false` | Give symbol-less connectors a default icon based on their type's style |
| `font_scale` | `1.0` | Scale the list / tooltip / bottom-bar text |
| `symbol_size` | `16` | Connector-symbol icon size in px |

```toml
[behavior]
sidebar_default_open     = true
sidebar_responsive_stack = true
sidebar_stack_breakpoint = 720
font_scale               = 1.1
```

> **Responsive stacking and embedding.** When the list stacks below the board, the pinout resizes itself to fit. If you embed it with [pinout-embed](../pinout-embed/mkdocs-zensical.md), the iframe grows and shrinks to match — no fixed-height scrollbars. Use a recent `pinout-embed` build for this.

### `[extra_css]`

A raw-CSS escape hatch appended after the generated variable blocks, for anything the tokens can't express. It is emitted verbatim, so it is a trusted, author-controlled surface — keep board data out of it.

```toml
[extra_css]
css = """
.bb { font-style: italic; }
"""
```

## Creating your own theme

1. Copy [`default.toml`](../../pinout_gen/pinout_gen/themes/default.toml) (it documents every token) to `<name>.toml`, and uncomment/override what you want to change.
2. Put it either in the **bundled themes** folder (`pinout_gen/pinout_gen/themes/`, shipped with the package) or in a **board-local** `theme_dir` next to your board config (handy for a project- or site-specific theme you don't want to bundle). A board-local theme of the same name overrides a bundled one.
3. Reference it with `theme = "<name>"` (or `--theme <name>`).
4. If you use the [visual designer](../pinout-design.md), regenerate its mirror so the theme appears in the Theme dropdown:

   ```bash
   python pinout_design/tools/convert-connectors.py
   ```

## Tips

- Because tokens merge over the defaults, start from a couple of overrides (`bg`, `text`, an accent) and add more only as needed.
- Keep pin colours meaningful — they come from the board, not the theme, so they stay consistent for readers no matter which theme is applied.
- The designer shows a **Theme** selector in its toolbar; a custom theme name it doesn't know about is still preserved when you save.
