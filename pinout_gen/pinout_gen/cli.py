"""Command-line interface for the pinout generator."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import load_all_connector_types, load_board
from .renderer import generate_html


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Generate interactive pinout diagrams for documentation sites.",
    )
    parser.add_argument(
        "config",
        type=Path,
        help="Path to the board pinout TOML config file.",
    )
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=None,
        help="Output HTML file path.  Defaults to <config_stem>.pinout.html "
             "next to the config file.",
    )

    args = parser.parse_args(argv)
    config_path: Path = args.config.resolve()

    if not config_path.exists():
        print(f"Error: config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    board = load_board(config_path)
    connector_types = load_all_connector_types(board, config_path)

    html = generate_html(board, connector_types)

    out_path: Path = args.output or config_path.with_suffix(".pinout.html")
    out_path.write_text(html, encoding="utf-8")
    print(f"Generated: {out_path}  ({len(board.connectors)} connectors)")


if __name__ == "__main__":
    main()
