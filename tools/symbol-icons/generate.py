"""Export each built-in symbol as a standalone SVG for the docs.

The icons in ``pinout_gen.symbols`` are written for inlining into generated
HTML: they use ``currentColor`` so they inherit the surrounding text color.
A file referenced from Markdown has no surrounding text to inherit from, so
each icon is emitted here with an explicit neutral gray that stays legible on
both GitHub's light and dark backgrounds.

Run after changing SYMBOLS to refresh docs/pinout-gen/board-toml.md's table:

    python tools/symbol-icons/generate.py
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_ROOT / "pinout_gen"))
from pinout_gen.symbols import SYMBOLS, _ALIASES

OUT_DIR = _ROOT / "assets" / "symbols"

# Mid-gray reads on white and on GitHub's dark background alike.
INK = "#888888"

_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" '
    'viewBox="0 0 24 24" fill="none" stroke="{ink}" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round">{inner}</svg>\n'
)


def aliases_by_icon() -> dict[str, list[str]]:
    """Canonical name -> its aliases, in the order _ALIASES declares them."""
    out: dict[str, list[str]] = {name: [] for name in SYMBOLS}
    for alias, canonical in _ALIASES.items():
        out.setdefault(canonical, []).append(alias)
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, inner in SYMBOLS.items():
        # Resolve currentColor here: an SVG loaded through <img> has no
        # inherited text color to pick up, so bake the ink in.
        path = OUT_DIR / f"{name}.svg"
        path.write_text(
            _SVG.format(ink=INK, inner=inner.replace("currentColor", INK)),
            encoding="utf-8",
        )
        print(f"  {name} -> assets/symbols/{path.name}")
    print(f"  {len(SYMBOLS)} icons")

    # The docs table pairs each icon with its aliases; print them so the table
    # can be checked against the code without reading symbols.py.
    print("\nAliases:")
    for name, aliases in aliases_by_icon().items():
        if aliases:
            print(f"  {name}: {', '.join(sorted(aliases))}")


if __name__ == "__main__":
    main()
