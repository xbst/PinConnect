#!/usr/bin/env python3
"""Build the Pyodide payload the designer fetches at startup.

`pinout-gen --serve` does this automatically. Run it by hand only when serving
the designer some other way, such as `python -m http.server` from this folder,
or from CI before deploying the static site.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pinout_gen"))

from pinout_gen.designer import build_payload  # noqa: E402


def main() -> None:
    dest = build_payload(force="--force" in sys.argv)
    print(f"Wrote {dest}  ({dest.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
