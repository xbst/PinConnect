# Connector types

A connector type describes the *shape* of a physical connector — its pin pitch, body size, number of rows, and where the pin lines exit — independent of any board. Board connectors reference a type by name through their `type` field.

Type definitions live in `pinout_gen/pinout_gen/connectors/`, one `.toml` file per type. The filename is the type name: `XH-F.toml` defines the `XH-F` type. When `pinout-gen` runs, it first checks the board's `connector_dir` (defaults to `./connectors` next to the board config), then falls back to the built-in types bundled with the package.

## Built-in types

| Type | Style | Notes |
|------|-------|-------|
| `XH-F` | latch | JST XH female, single row |
| `PH-F` | latch | JST PH female, single row |
| `HDR-127` | header-female | 1.27 mm female pin header |
| `HDR-200` | header-female | 2.00 mm female pin header |
| `HDR-254` | header-female | 2.54 mm female pin header |
| `ST-254` | screw-terminal | 2.54 mm pitch screw terminal |
| `ST-508` | screw-terminal | 5.08 mm pitch screw terminal |
| `MX-F-1R` | grid | Micro-Fit female, single row |
| `MX-F-2R` | grid | Micro-Fit female, two rows |
| `USB-C` | box | Simple rectangular body |
| `XT30-2+2` | xt30 | XT30 power + 2 signal pins |

`Male` and `Female` refer to the gender of the plastic housing of the connector, not the pins, as that's what the end user will see when using the board.

## Anatomy of a type file

A type file has a `[connector]` table and a `[geometry]` table:

```toml
[connector]
name = "Micro-Fit"
style = "grid"

[geometry]
pin_pitch = 12.0
height = 33.6
wall = 2.5
pin_cy = 23.9
pin_radius = 1.8
pinout_side = "bottom"
line_length = 15.0
rows = 2
row2_pin_cy = 11.7
row2_pinout_side = "top"
row2_line_length = 15.0
cavity_size = 10.5
```

### `[connector]`

- `name` — human-readable name for the connector family.
- `style` — how the body is drawn. One of:
  - `box` — a plain rectangle.
  - `latch` — a latching housing (JST XH / PH look).
  - `grid` — a gridded housing with cavities (Micro-Fit look); uses `cavity_size`.
  - `xt30` — the XT30 power-connector body.
  - `header-female` — a pitch-scaled female pin-header housing with square cavities and keyed joints.
  - `screw-terminal` — a screw-terminal housing with circular screw heads and side wire-entry slots.

### `[geometry]`

The geometry fields position the pins and the lines that run from each pin to its label. The values are in the type's own drawing units and are scaled to the connector's bounding box on the board. The ones you will usually set:

- `pin_pitch` — spacing between adjacent pins.
- `height` — body height.
- `pin_cy`, `pin_radius` — pin center offset from the top edge, and pin marker radius.
- `pinout_side` — which side the pin lines exit (`top`, `bottom`, `left`, `right`).
- `line_length` — how far the pin lines extend to reach labels.
- `rows` — `1` or `2`. For two-row types, the `row2_*` fields (`row2_pin_cy`, `row2_pinout_side`, `row2_line_length`, and so on) describe the second row.
- `cavity_size` — size of the cavities for the `grid` style.
- `mating_pin_scale` — optional scale for the visible metal contact inside a `screw-terminal` wire opening; defaults to `1.0`.

Any field you omit falls back to a built-in default, so a minimal type only needs to specify what differs from the defaults.

## Adding a new type

1. Create `pinout_gen/pinout_gen/connectors/<TYPE>.toml` with a `[connector]` and `[geometry]` table. Copy an existing type with a similar body as a starting point.
2. Reference it from a board config by setting a connector's `type = "<TYPE>"`.
3. Regenerate the designer's JSON mirror so the type shows up in the visual designer (see below).

Iterate by generating a test board and eyeballing the result — a connector does not have to sit on a real board image while you tune geometry.

There's no way of adding a new `style` in a config file as it requires custom code in `renderer.py`. You can open a feature request to request new designs, or if you design your own, you can open a pull request to merge it (make sure both generator and designer has the code).

## Keeping the designer in sync

The [designer](../pinout-design.md) runs in the browser and cannot read these TOML files directly. It uses JSON mirrors in `pinout_design/connectors/`, generated from the TOML by `pinout_design/tools/convert-connectors.py`.

After adding or editing a type, regenerate the JSON:

```bash
python pinout_design/tools/convert-connectors.py
```

The TOML files are the source of truth; the JSON is a build artifact. Editing one without the other leaves the designer and generator out of sync.
