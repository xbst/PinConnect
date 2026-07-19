# Board TOML reference

A board config describes one board: the image, its size, and every connector on it. The [designer](../pinout-design.md) produces this file, and `pinout-gen` reads it. You can also write or edit it by hand.

A config has one `[board]` table followed by a `[[connector]]` array, and each connector holds a `[[connector.pin]]` array. Example:

```toml
[board]
title = "My Board"
image = "pcb.png"
width = 1920
height = 1080

[[connector]]
id = "CAN1"
name = "CAN In"
type = "MX-F-2R"
x1 = 543
y1 = 422
x2 = 864
y2 = 742

  [[connector.pin]]
  name = "VIN"
  color = "#E74C3C"

  [[connector.pin]]
  name = "GND"
  color = "#2C3E50"

  [[connector.pin]]
  name = "CAN_H"
  color = "#FFBF00"
  row = 2

  [[connector.pin]]
  name = "CAN_L"
  color = "#2ECC71"
  row = 2
```

## `[board]`

| Field | Required | Default | Meaning |
|-------|----------|---------|---------|
| `image` | yes | — | Path to the board image, relative to the config. By default referenced (not embedded) by the output, so keep it next to the generated HTML. Use `pinout-gen -i` to embed it instead. |
| `width` | yes | — | Image width in pixels. |
| `height` | yes | — | Image height in pixels. |
| `title` | no | `"Pinout"` | Page title of the generated HTML (the browser tab) and the board image's alt text. Not drawn on the diagram itself. |
| `connector_dir` | no | `"./connectors"` | Folder holding connector type `.toml` files, relative to the config. Types not found here fall back to the built-in types bundled with the package. |
| `theme` | no | `"default"` | Name of the [theme](themes.md) to apply — colors, fonts, and behaviors of the generated page. |
| `theme_dir` | no | `"./themes"` | Folder holding theme `.toml` files, relative to the config. Names not found here fall back to the built-in themes. |

`width` and `height` set the coordinate space that all connector positions are measured in, so they should match the actual image dimensions.

## `[[connector]]`

One entry per connector on the board.

| Field | Required | Default | Meaning |
|-------|----------|---------|---------|
| `id` | yes | — | Unique identifier for the connector. |
| `name` | yes | — | Label shown on the diagram. |
| `type` | yes | — | Connector type name, matched to `<type>.toml` in `connector_dir` (e.g. `MX-F-2R`). See [connector types](connector-types.md). |
| `x1`, `y1`, `x2`, `y2` | yes | — | Bounding box of the connector on the image, in pixels. `(x1, y1)` and `(x2, y2)` are opposite corners. |
| `orientation` | no | `0` | Rotation of the connector body in degrees: `0`, `90`, `180`, or `270`. |
| `label_style` | no | `"staggered"` | How pin labels are arranged on horizontal connectors: `"staggered"`, `"staircase"`, or `"flat"`. See below. |
| `description` | no | `""` | Longer text shown for the connector (e.g. a tooltip / detail line). |
| `symbol` | no | `""` | Icon shown beside the connector in the list and tooltip when the theme shows symbols: a named icon, a literal glyph, or `"none"`. See below. |

The bounding box places and sizes the connector graphic over the image; `orientation` rotates it so the rendered connector matches what's on the board. The designer sets all of these for you when you drag a box and pick an orientation.

### `label_style`

Controls how pin labels are spaced on horizontal (top/bottom) pinout sides. Has no effect on vertical (left/right) sides, where labels naturally stack without overlapping.

| Value | Behavior |
|-------|-----------|
| `"staggered"` | Odd and even pin labels alternate between two levels. Compact while still avoiding overlap. **(default)** |
| `"staircase"` | Each pin label gets its own level, stepping further from the connector body. Clearest separation, but tall with many pins. |
| `"flat"` | All labels sit at the same level. Most compact, but labels may overlap on dense connectors. |

The same 8-pin header under each style:

![The same connector rendered with staggered, staircase, and flat label styles side by side](../../assets/label-styles.webp)

```toml
[[connector]]
id = "J1"
name = "Sensor Header"
type = "HDR-254"
x1 = 100
y1 = 200
x2 = 250
y2 = 220
label_style = "flat"
```

### `symbol`

An optional icon shown beside the connector in the list and tooltip, hinting at what it is for. Themes that show symbols (most do by default; a theme can disable them) render it. The value is one of:

- **A named icon** — resolved to a built-in SVG. The 19 built-in names and their aliases are listed below; an alias renders exactly the same icon as its canonical name.
- **A literal glyph** — any other text renders as-is, e.g. `symbol = "⚡"` or an emoji.
- **`"none"`** — no symbol, even where the theme would otherwise show one.

Omitted, a connector shows no symbol (unless the theme opts into style-based fallbacks). The right symbol usually depends on what the connector is *used for* rather than its shape, so set it explicitly per connector when you use a symbol-showing theme.

#### Built-in icons

Names are matched case-insensitively, and surrounding whitespace is ignored.

| Icon | Name | Aliases |
|------|------|---------|
| ![power icon](../../assets/symbols/power.svg) | `power` | — |
| ![lightning icon](../../assets/symbols/lightning.svg) | `lightning` | `bolt`, `flash`, `zap` |
| ![battery icon](../../assets/symbols/battery.svg) | `battery` | `batt` |
| ![ground icon](../../assets/symbols/ground.svg) | `ground` | `earth`, `gnd` |
| ![fuse icon](../../assets/symbols/fuse.svg) | `fuse` | — |
| ![data icon](../../assets/symbols/data.svg) | `data` | `bus`, `can`, `i2c`, `spi`, `uart` |
| ![signal icon](../../assets/symbols/signal.svg) | `signal` | — |
| ![usb icon](../../assets/symbols/usb.svg) | `usb` | — |
| ![fan icon](../../assets/symbols/fan.svg) | `fan` | — |
| ![motor icon](../../assets/symbols/motor.svg) | `motor` | `servo`, `stepper` |
| ![heater icon](../../assets/symbols/heater.svg) | `heater` | — |
| ![fire icon](../../assets/symbols/fire.svg) | `fire` | `flame` |
| ![temperature icon](../../assets/symbols/temperature.svg) | `temperature` | `temp`, `thermal`, `thermistor` |
| ![led icon](../../assets/symbols/led.svg) | `led` | — |
| ![button icon](../../assets/symbols/button.svg) | `button` | — |
| ![switch icon](../../assets/symbols/switch.svg) | `switch` | — |
| ![setting icon](../../assets/symbols/setting.svg) | `setting` | `config`, `dip`, `dipswitch`, `jumper`, `jumpers`, `settings` |
| ![gear icon](../../assets/symbols/gear.svg) | `gear` | `cog`, `cogwheel` |
| ![speaker icon](../../assets/symbols/speaker.svg) | `speaker` | `buzzer`, `spkr` |

Some icons are deliberate alternatives for the same idea — `lightning` for `power`, `fire` for `heater`, `gear` for `setting` — so pick whichever reads better on your board.

```toml
[[connector]]
id = "FAN0"
name = "Hotend Fan"
type = "XH-F"
x1 = 100
y1 = 200
x2 = 180
y2 = 240
symbol = "fan"
```

## `[[connector.pin]]`

Pins are listed in physical order. The first pin is pin 1.

| Field | Required | Default | Meaning |
|-------|----------|---------|---------|
| `name` | yes | — | Pin label (e.g. `VIN`, `GND`, `CAN_H`). |
| `color` | no | `#888888` | Color of the pin's marker dot and its wire stub. Any CSS color works (`"#E74C3C"`, `"red"`), though the designer writes hex. Pin *label* text is colored by the [theme](themes.md), not by this. |
| `row` | no | `1` | Which row the pin belongs to, for two-row connectors. Use `2` for the second row. |

For single-row connectors, omit `row` (everything defaults to row 1). For two-row types like `MX-F-2R`, assign each pin to `row = 1` or `row = 2`; order within each row is the order the pins appear in the file.

## Tips

- Connectors that are not physically on the image (for testing a new type, say) still render — just give them a bounding box in an empty area.
- Comments use `#` and are ignored, so you can annotate the file freely.
- If a `type` has no matching file in `connector_dir` *or* the built-in types, `pinout-gen` stops with a clear error naming the missing type and both folders it searched.
