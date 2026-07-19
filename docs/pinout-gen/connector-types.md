# Connector types

A connector type describes the *shape* of a physical connector — its pin pitch, body size, number of rows, and where the pin lines exit — independent of any board. Board connectors reference a type by name through their `type` field.

Type definitions live in `pinout_gen/pinout_gen/connectors/`, one `.toml` file per type. The filename is the type name: `XH-F.toml` defines the `XH-F` type. When `pinout-gen` runs, it first checks the board's `connector_dir` (defaults to `./connectors` next to the board config), then falls back to the built-in types bundled with the package.

## Built-in types

| Type | Style | Notes |
|------|-------|-------|
| `XH-F` | latch | JST XH female, single row |
| `PH-F` | latch | JST PH female, single row |
| `SHERLOCK-F` | sherlock | Sherlock female, single row; body widens at 3 ways or fewer matching real Sherlock connectors |
| `HDR-127` | header-male | 1.27 mm male pin header |
| `HDR-200` | header-male | 2.00 mm male pin header |
| `HDR-254` | header-male | 2.54 mm male pin header |
| `ST-254` | screw-terminal | 2.54 mm pitch screw terminal |
| `ST-508` | screw-terminal | 5.08 mm pitch screw terminal |
| `ST-BR-508` | barrier | 5.08 mm barrier screw terminal strip |
| `ST-BR-950` | barrier | 9.5 mm barrier screw terminal strip |
| `MX-F-1R` | grid | Micro-Fit female, single row |
| `MX-F-2R` | grid | Micro-Fit female, two rows |
| `USB-C` | box | Simple rectangular body |
| `XT30-2+2` | xt30 | XT30 power + 2 signal pins |
| `button` | button | Tactile push-button / switch footprint |
| `slide-switch` | slide-switch | Slide switch; its pins are the slider's positions |

`Male` and `Female` refer to the gender of the plastic housing of the connector, not the pins, as that's what the end user will see when using the board.

`USB-C` and `button` "connector types" are meant to be used to highlight the locations of these on your board, not for their pinouts. To render properly, they shouldn't include pins in your board TOML. `slide-switch` also highlights a location rather than a pinout, but it uses pins. Pins mark slider positions, rendered without pin circles.

## Anatomy of a type file

A type file has a `[connector]` table and a `[geometry]` table:

```toml
[connector]
name = "Micro-Fit"
style = "grid"

[geometry]
pin_pitch = 12.0
height = 37.6
wall = 2.5
pin_cy = 25.9
pin_radius = 1.8
pinout_side = "bottom"
line_length = 15.0
rows = 2
row2_pin_cy = 13.7
row2_pinout_side = "top"
row2_line_length = 15.0
cavity_size = 10.5
```

That is `MX-F-2R.toml` verbatim. Copying a bundled type that resembles what you are drawing is the fastest way to start a new one.

### `[connector]`

- `name` — human-readable name for the connector family.
- `style` — how the body is drawn. One of:
  - `box` — a plain rectangle.
  - `latch` — a latching housing (JST XH / PH look).
  - `grid` — a gridded housing with cavities (Micro-Fit look); uses `cavity_size`.
  - `xt30` — the XT30 power-connector body.
  - `header-male` — a pitch-scaled male pin-header housing with square cavities and keyed joints.
  - `screw-terminal` — a screw-terminal with circular screw heads and side wire-entry slots.
  - `barrier` — a barrier screw-terminal with individual metal cages and cross-drive screws.
  - `button` — a tactile push-button / switch footprint (a round actuator between two pads).
  - `slide-switch` — a slide switch: a recessed actuator track carrying a knurled slider block at each of its labeled positions; uses `cavity_size` for the slider.
  - `sherlock` — a Sherlock housing: two latch ears on the body edge, and a stepped, chamfered mating half on the narrow sizes; uses `flare_max_pins` / `flare_width`.

### `[geometry]`

The geometry fields position the pins and the lines that run from each pin to its label. Any field you omit falls back to the default below, so a minimal type only needs to specify what differs.

Values are in the type's own drawing units, scaled to the connector's bounding box on the board — only their proportions matter. All bundled types are drawn at **roughly 4 units per millimeter** of the real part (`XH-F`'s 2.5 mm pitch is `pin_pitch = 10.0`, `ST-508`'s 5.08 mm is `20.0`), so multiplying datasheet millimeters by 4 keeps a new type consistent with the library.

Unknown keys are rejected: a typo fails at load time with an error naming the offending key rather than being silently ignored.

#### Body and pins

| Key | Default | Meaning |
|-----|---------|---------|
| `pin_pitch` | `10.0` | Spacing between adjacent pins. |
| `padding_left` | `10.0` | Body edge to the first pin's center. |
| `padding_right` | `10.0` | Last pin's center to the body edge. |
| `height` | `23.0` | Body height. |
| `wall` | `2.6` | Housing wall thickness. |
| `pin_cy` | `13.5` | Pin center offset from the top edge, at 0°. |
| `pin_radius` | `3.0` | Pin marker radius. |
| `pinout_side` | `"bottom"` | Which side the pin lines exit: `top`, `bottom`, `left`, or `right`. |
| `line_length` | `20.0` | How far the pin lines extend to reach their labels. |

The pin count comes from the board config, not the type — `pin_pitch` and the two paddings size the body to fit however many pins the board declares.

#### Second row

| Key | Default | Meaning |
|-----|---------|---------|
| `rows` | `1` | `1` or `2`. The `row2_*` keys apply only when this is `2`. |
| `row2_pin_cy` | `0.0` | Second row's pin center offset from the top edge. |
| `row2_pinout_side` | `"top"` | Which side the second row's lines exit. |
| `row2_line_length` | `20.0` | Line length for the second row. |
| `row2_padding_left` | `-1.0` | Second row's left padding. Negative means inherit `padding_left`. |
| `row2_pin_radius` | `-1.0` | Second row's pin radius. Negative means inherit `pin_radius`. |
| `row2_pin_pitch_y` | `0.0` | Above `0`, the second row becomes a *vertical* column of pins spaced this far apart, instead of a horizontal row. This is how `XT30-2+2` puts its two signal pins beside the power pair. |

#### Style-specific

| Key | Default | Meaning |
|-----|---------|---------|
| `cavity_size` | `0.0` | Cavity size for the `grid` style; slider size for `slide-switch`. |
| `mating_pin_scale` | `1.0` | Scale of the visible metal contact inside a `screw-terminal` wire opening. |
| `flare_max_pins` | `0` | Pin count at or below which the housing flares wider. `0` never flares. |
| `flare_width` | `0.0` | Extra body width per side while flared. |

`flare_*` exists for families that widen the molding below a few ways (like Sherlock). The flare widens the outer body, and the pin centers move with it so the pins stay centered.

A type is one shape per family, not one per size. Where a family changes shape rather than just width — as `SHERLOCK-F` does at 3 ways or fewer — the style handles that branch internally, so a board only ever names `SHERLOCK-F`.

## Adding a new type

There are two places a type can live, depending on whether it is just for your board or belongs in the shared library.

**For one board (no changes to the package).** Create `<TYPE>.toml` in the board's `connector_dir` — `./connectors` next to the board config unless you set otherwise — and reference it with `type = "<TYPE>"`. That folder is searched first, so a file named after a bundled type also lets you override one locally. Note that the designer's type dropdown only mirrors the bundled library, so a board-local type renders in `pinout-gen` but will not be offered in the designer.

**For the shared library.** Create `pinout_gen/pinout_gen/connectors/<TYPE>.toml` instead, then regenerate the designer's JSON mirror (see below) so the type appears in the dropdown, and commit both.

Either way, copy an existing type with a similar body as a starting point, and iterate by generating a test board and eyeballing the result — a connector does not have to sit on a real board image while you tune geometry.

A new `style` cannot be added from a config file, because each one is custom drawing code. You can open a feature request for new designs, or design your own and open a pull request — making sure both the generator (`renderer.py`) and the designer (`svg-renderer.js`) have the code, or the two will disagree.

## Keeping the designer in sync

The [designer](../pinout-design.md) runs in the browser and cannot read these TOML files directly. It uses JSON mirrors in `pinout_design/connectors/`, generated from the TOML by `pinout_design/tools/convert-connectors.py`.

After adding or editing a type, regenerate the JSON:

```bash
python pinout_design/tools/convert-connectors.py
```

The same script also mirrors the bundled **theme** names (to `pinout_design/themes/index.json`) and the connector **symbol** names (to `pinout_design/symbols.json`), which populate the designer's Theme selector and Symbol field — so re-run it after adding a theme, too.

The TOML files are the source of truth; the JSON is a build artifact. Editing one without the other leaves the designer and generator out of sync.
