# Symbol icons

Exports each built-in connector symbol as a standalone SVG into `assets/symbols/`, so the [board TOML reference](../../docs/pinout-gen/board-toml.md#symbol) can show the icons in its symbol table.

The icons themselves live in `pinout_gen/pinout_gen/symbols.py`. There they use `currentColor` so they inherit the surrounding text color when inlined into a generated pinout; a file referenced from Markdown has nothing to inherit from, so this tool bakes in a neutral gray that reads on both light and dark backgrounds.

Run it from the repository root after adding or changing a symbol:

```bash
python tools/symbol-icons/generate.py
```

It rewrites all of `assets/symbols/` and prints each icon's aliases, so the docs table can be checked against the code. Commit the regenerated SVGs alongside your `symbols.py` change.
