"""Convert connector type TOML files to JSON for the web designer."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "pinout_gen"))
from pinout_gen.config import load_connector_type

CONNECTORS_DIR = Path(__file__).resolve().parent.parent.parent / "pinout_gen" / "pinout_gen" / "connectors"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "connectors"


def connector_type_to_dict(ct):
    geo = ct.geometry
    return {
        "name": ct.name,
        "style": ct.style,
        "geometry": {
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
        },
    }


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


if __name__ == "__main__":
    main()
