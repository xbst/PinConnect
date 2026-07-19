"""Convert connector types, themes, and symbols to JSON for the web designer."""
import json
import sys
import tomllib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "pinout_gen"))
from pinout_gen.config import load_connector_type
from pinout_gen.symbols import SYMBOLS

_GEN = Path(__file__).resolve().parent.parent.parent / "pinout_gen" / "pinout_gen"
_DESIGN = Path(__file__).resolve().parent.parent
CONNECTORS_DIR = _GEN / "connectors"
OUTPUT_DIR = _DESIGN / "connectors"
THEMES_DIR = _GEN / "themes"
THEMES_OUT = _DESIGN / "themes"


def connector_type_to_dict(ct):
    geo = ct.geometry
    geometry = {
        "pin_pitch": geo.pin_pitch,
        "padding_left": geo.padding_left,
        "padding_right": geo.padding_right,
        "height": geo.height,
        "wall": geo.wall,
        "pin_cy": geo.pin_cy,
        "pin_radius": geo.pin_radius,
        "pinout_side": geo.pinout_side,
        "line_length": geo.line_length,
        "rows": geo.rows,
        "row2_pin_cy": geo.row2_pin_cy,
        "row2_pinout_side": geo.row2_pinout_side,
        "row2_line_length": geo.row2_line_length,
        "row2_padding_left": geo.row2_padding_left,
        "row2_pin_pitch_y": geo.row2_pin_pitch_y,
        "row2_pin_radius": geo.row2_pin_radius,
        "cavity_size": geo.cavity_size,
    }
    if geo.mating_pin_scale != 1.0:
        geometry["mating_pin_scale"] = geo.mating_pin_scale
    if geo.flare_max_pins:
        geometry["flare_max_pins"] = geo.flare_max_pins
        geometry["flare_width"] = geo.flare_width
    return {
        "name": ct.name,
        "style": ct.style,
        "geometry": geometry,
    }


def convert_themes():
    """Mirror the bundled theme names to the designer for the theme dropdown."""
    THEMES_OUT.mkdir(parents=True, exist_ok=True)
    themes = []
    for toml_path in sorted(THEMES_DIR.glob("*.toml")):
        with open(toml_path, "rb") as f:
            raw = tomllib.load(f)
        name = toml_path.stem
        themes.append({"name": name, "display": raw.get("theme", {}).get("name", name)})
    themes.sort(key=lambda t: (t["name"] != "default", t["display"].lower()))  # default first
    (THEMES_OUT / "index.json").write_text(json.dumps(themes, indent=2) + "\n")
    print(f"  themes/index.json ({len(themes)} themes)")


def convert_symbols():
    """Mirror the named-icon list to the designer for the connector symbol field."""
    names = sorted(SYMBOLS.keys())
    (_DESIGN / "symbols.json").write_text(json.dumps(names, indent=2) + "\n")
    print(f"  symbols.json ({len(names)} symbols)")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    names = []

    for toml_path in sorted(CONNECTORS_DIR.glob("*.toml")):
        ct = load_connector_type(toml_path)
        slug = toml_path.stem
        names.append(slug)
        out = OUTPUT_DIR / f"{slug}.json"
        out.write_text(json.dumps(connector_type_to_dict(ct), indent=2) + "\n")
        print(f"  {slug} -> {out.name}")

    index = OUTPUT_DIR / "index.json"
    index.write_text(json.dumps(names, indent=2) + "\n")
    print(f"  index.json ({len(names)} types)")

    convert_themes()
    convert_symbols()


if __name__ == "__main__":
    main()
