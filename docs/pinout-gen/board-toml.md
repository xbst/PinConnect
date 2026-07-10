# Board TOML reference

A board config describes one board: the image, its size, and every connector on it. The designer produces this file, and `pinout-gen` reads it. You can also write or edit it by hand.

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
| `title` | no | `"Pinout"` | Shown as the diagram title. |
| `connector_dir` | no | `"./connectors"` | Folder holding the connector type `.toml` files, relative to the config. |

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
| `description` | no | `""` | Longer text shown for the connector (e.g. a tooltip / detail line). |

The bounding box places and sizes the connector graphic over the image; `orientation` rotates it so the rendered connector matches what's on the board. The designer sets all of these for you when you drag a box and pick an orientation.

## `[[connector.pin]]`

Pins are listed in physical order. The first pin is pin 1.

| Field | Required | Default | Meaning |
|-------|----------|---------|---------|
| `name` | yes | — | Pin label (e.g. `VIN`, `GND`, `CAN_H`). |
| `color` | no | `#888888` | Hex color for the pin marker and label. |
| `row` | no | `1` | Which row the pin belongs to, for two-row connectors. Use `2` for the second row. |

For single-row connectors, omit `row` (everything defaults to row 1). For two-row types like `MX-F-2R`, assign each pin to `row = 1` or `row = 2`; order within each row is the order the pins appear in the file.

## Tips

- Connectors that are not physically on the image (for testing a new type, say) still render — just give them a bounding box in an empty area.
- Comments use `#` and are ignored, so you can annotate the file freely.
- If a `type` has no matching file in `connector_dir`, `pinout-gen` stops with a clear error naming the missing type.
