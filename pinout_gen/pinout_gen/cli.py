"""Command-line interface for the pinout generator."""
from __future__ import annotations

import argparse
import base64
import mimetypes
import sys
from pathlib import Path

from .config import load_all_connector_types, load_board, load_theme
from .renderer import generate_html


def _embed_image(path: Path) -> str:
    if not path.exists():
        print(f"Error: image file not found: {path}", file=sys.stderr)
        sys.exit(1)
    mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    try:
        data = path.read_bytes()
    except OSError as e:
        print(f"Error: cannot read image file: {path}: {e}", file=sys.stderr)
        sys.exit(1)
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


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
    parser.add_argument(
        "-i", "--image-embed",
        nargs="?",
        const=True,
        default=None,
        metavar="IMAGE",
        help="Embed the board image as a base64 data URI.  "
             "Without a path, uses the image from the board config.  "
             "With a path, embeds the specified image instead.",
    )
    parser.add_argument(
        "-t", "--theme",
        default=None,
        metavar="NAME",
        help="Theme to apply, overriding the board's [board] theme.  "
             "Resolved from the board's theme_dir, then the bundled themes.",
    )

    args = parser.parse_args(argv)
    config_path: Path = args.config.resolve()

    if not config_path.exists():
        print(f"Error: config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    try:
        board = load_board(config_path)
        connector_types = load_all_connector_types(board, config_path)
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    theme_name = args.theme or board.theme
    try:
        theme = load_theme(theme_name, config_path, board.theme_dir)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    image_data_uri: str | None = None
    if args.image_embed is not None:
        if args.image_embed is True:
            image_path = (config_path.parent / board.image).resolve()
        else:
            image_path = Path(args.image_embed).resolve()
        image_data_uri = _embed_image(image_path)

    html = generate_html(board, connector_types, theme=theme,
                         image_data_uri=image_data_uri)

    out_path: Path = args.output or config_path.with_suffix(".pinout.html")
    out_path.write_text(html, encoding="utf-8")
    print(f"Generated: {out_path}  ({len(board.connectors)} connectors)")


if __name__ == "__main__":
    main()
