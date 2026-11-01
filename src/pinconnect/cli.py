"""Command-line interface: the ``pinconnect`` command and the legacy ``pinout-gen``.

``main`` is ``pinconnect``: with a config file it renders the pinout, and with
none it opens the designer.  ``legacy_main`` keeps the old ``pinout-gen``
command line working exactly as it always has, flags, help and error messages
included, since scripts and CI jobs call it and some match its output.  Both
share the code that does the work.
"""
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


def _add_render_arguments(parser: argparse.ArgumentParser) -> None:
    """The config and the options that shape its rendering, shared by both commands."""
    parser.add_argument(
        "config",
        nargs="?",
        type=Path,
        default=None,
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


def _serve_designer(port: int, open_browser: bool) -> None:
    from .serve import serve
    try:
        serve(port, open_browser=open_browser)
    except (FileNotFoundError, ValueError, OSError) as e:
        # A bad port, an unwritable install and a missing designer all
        # deserve a message rather than a traceback.
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def _render(args: argparse.Namespace) -> None:
    config_path: Path = args.config.resolve()

    if not config_path.exists():
        print(f"Error: config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    try:
        board = load_board(config_path)
        connector_types = load_all_connector_types(board, config_path)
    except (ValueError, OSError) as e:
        # OSError covers more than a missing file: a config path that is a
        # directory, or one the user cannot read.
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    theme_name = args.theme or board.theme
    try:
        theme = load_theme(theme_name, config_path, board.theme_dir)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    for warning in theme.warnings:
        print(f"Warning: {warning}", file=sys.stderr)

    image_data_uri: str | None = None
    if args.image_embed is not None:
        if args.image_embed is True:
            image_path = (config_path.parent / board.image).resolve()
        else:
            image_path = Path(args.image_embed).resolve()
        image_data_uri = _embed_image(image_path)

    # Some board errors can only be found while drawing, against the connector
    # type's layout (a jumper between pins that are not neighbors, say), so
    # they get the same one-line report as the ones found while loading.
    try:
        html = generate_html(board, connector_types, theme=theme,
                             image_data_uri=image_data_uri)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    out_path: Path = args.output or config_path.with_suffix(".pinout.html")
    # Write LF explicitly. Text mode translates to CRLF on Windows, so the same
    # config rendered on two machines produced two different files, and the
    # designer (which always writes LF) disagreed with the CLI byte for byte.
    # Path.write_text only grew a newline argument in 3.10, and this supports 3.9.
    try:
        with open(out_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(html)
    except OSError as e:
        # A missing output directory is the common case; -o says it must exist.
        print(f"Error: cannot write output file: {out_path}: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"Generated: {out_path}  ({len(board.connectors)} connectors)")


_MODES = """\
modes:
  pinconnect                 open the designer in a browser
  pinconnect board.toml      render board.toml to board.pinout.html
"""


def main(argv: list[str] | None = None) -> None:
    """The ``pinconnect`` command: render a config, or open the designer without one."""
    parser = argparse.ArgumentParser(
        prog="pinconnect",
        # Wrapped by hand: the raw formatter keeps the epilog's columns, and
        # it applies to the description too.
        description="Render a board TOML config to an interactive pinout page "
                    "for\ndocumentation sites.  Without a config, open the "
                    "visual designer that\nwrites one.",
        epilog=_MODES,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    _add_render_arguments(parser)
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        metavar="N",
        help="Designer only: serve on this port.  Without it, a free port is "
             "chosen.",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Designer only: do not open a browser window.",
    )
    # The old way to open the designer, kept so `pinconnect --serve 8000` and
    # scripts written for pinout-gen still work.  Hidden from the help.
    parser.add_argument(
        "--serve",
        nargs="?",
        const=0,
        type=int,
        default=None,
        help=argparse.SUPPRESS,
    )

    args = parser.parse_args(argv)

    if args.config is None:
        if args.port is not None and args.serve not in (None, 0, args.port):
            parser.error("--serve and --port name different ports")
        render_only = [name for name, given in (
            ("--output", args.output is not None),
            ("--image-embed", args.image_embed is not None),
            ("--theme", args.theme is not None),
        ) if given]
        if render_only:
            parser.error(f"{' and '.join(render_only)} "
                         f"{'needs' if len(render_only) == 1 else 'need'} "
                         "a config file to render")
        port = args.port if args.port is not None else (args.serve or 0)
        _serve_designer(port, open_browser=not args.no_browser)
        return

    designer_only = [name for name, given in (
        ("--port", args.port is not None),
        ("--serve", args.serve is not None),
        ("--no-browser", args.no_browser),
    ) if given]
    if designer_only:
        parser.error(f"{' and '.join(designer_only)} "
                     f"{'applies' if len(designer_only) == 1 else 'apply'} "
                     "only to the designer, which opens when no config file "
                     "is given")
    _render(args)


def legacy_main(argv: list[str] | None = None) -> None:
    """The ``pinout-gen`` command, unchanged.

    The parser, help text and messages are exactly those of pinout-gen 0.2.0.
    Do not edit them: the old name is kept working for good, and anything that
    matches its output has to keep matching.
    """
    parser = argparse.ArgumentParser(
        description="Generate interactive pinout diagrams for documentation sites.",
    )
    _add_render_arguments(parser)

    parser.add_argument(
        "--serve",
        nargs="?",
        const=0,
        type=int,
        default=None,
        metavar="PORT",
        help="Serve the visual designer and open it in a browser, instead of "
             "rendering a config.  Without a port, one free port is chosen.",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="With --serve, do not open a browser window.",
    )

    args = parser.parse_args(argv)

    if args.serve is not None:
        if args.config is not None:
            parser.error("--serve renders nothing, so it takes no config file")
        _serve_designer(args.serve, open_browser=not args.no_browser)
        return

    if args.config is None:
        parser.error("a config file is required (use --serve to open the designer)")

    _render(args)


if __name__ == "__main__":
    main()
