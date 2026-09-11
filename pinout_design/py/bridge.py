"""The designer's bridge into pinout-gen, running under Pyodide.

Everything crossing into JavaScript is a JSON string or plain text, so the
browser side never holds a Python proxy it has to free.  This module is the
only Python the designer adds; it is a thin shim over the package so the
generator itself stays a pure CLI concern.
"""
from __future__ import annotations

import json
from dataclasses import fields
from pathlib import Path

import pinout_gen.config as _config
from pinout_gen.config import (
    Board,
    Connector,
    ConnectorType,
    Pin,
    load_all_connector_types,
    load_board,
    load_connector_type,
    load_theme,
)
from pinout_gen.renderer import generate_html, render_connector_svg
from pinout_gen.symbols import SYMBOLS

_PKG = Path(_config.__file__).resolve().parent
_BUNDLED_CONNECTORS = _PKG / "connectors"
_BUNDLED_THEMES = _PKG / "themes"

# Where board TOML is written before loading.  Nothing else lives here, so the
# board's default relative connector_dir and theme_dir resolve to nothing and
# fall through to the bundled sets, exactly as they do for a board file saved
# somewhere with no sibling connectors directory.
WORK = Path("/pinconnect/work")
BOARD_PATH = WORK / "board.toml"

_CUSTOM_DIR_HINT = (
    "The designer can only use the connector types and themes bundled with "
    "PinConnect. A board that points connector_dir or theme_dir at its own "
    "files has to be rendered with the pinout-gen command line tool."
)

_type_cache: dict[str, ConnectorType] = {}


def _slugs(directory: Path) -> list[str]:
    """TOML stems in a stable, human order.

    Sorting Path objects is not portable: Windows compares them case-insensitively
    and other platforms do not, so the designer's dropdowns would be ordered one
    way locally and another way on the hosted site. Sorting the stem also keeps
    a type next to its variants, which comparing full filenames does not, because
    the hyphen in "HDR-127-2R.toml" sorts ahead of the dot in "HDR-127.toml".
    """
    return sorted((p.stem for p in directory.glob("*.toml")), key=str.lower)


def _connector_type(slug: str) -> ConnectorType | None:
    if slug not in _type_cache:
        path = _BUNDLED_CONNECTORS / f"{slug}.toml"
        if not path.is_file():
            return None
        _type_cache[slug] = load_connector_type(path)
    return _type_cache[slug]


# ── Catalogs backing the designer's dropdowns ────────────────────────

def connector_catalog() -> str:
    """Every bundled connector type, as the designer's type list needs it.

    The geometry is walked off the dataclass rather than hand-listed, so a new
    geometry field reaches the designer without a second edit.
    """
    out = []
    for slug in _slugs(_BUNDLED_CONNECTORS):
        ct = _connector_type(slug)
        if ct is None:
            continue
        geo = ct.geometry
        out.append({
            "slug": slug,
            "name": ct.name,
            "style": ct.style,
            "geometry": {f.name: getattr(geo, f.name) for f in fields(geo)},
        })
    return json.dumps(out)


def theme_catalog() -> str:
    """Bundled theme names and display names, default first."""
    themes = []
    for slug in _slugs(_BUNDLED_THEMES):
        theme = load_theme(slug, BOARD_PATH)
        themes.append({"name": slug, "display": theme.name or slug})
    themes.sort(key=lambda t: (t["name"] != "default", t["display"].lower()))
    return json.dumps(themes)


def symbol_catalog() -> str:
    """Named icons available to a connector's symbol field."""
    return json.dumps(sorted(SYMBOLS))


# ── Rendering ────────────────────────────────────────────────────────

def _connector_from_dict(data: dict) -> Connector:
    return Connector(
        id=data.get("id", ""),
        name=data.get("name", ""),
        type=data.get("type", ""),
        pins=[
            Pin(
                name=p.get("name", ""),
                color=p.get("color", "#888888"),
                row=int(p.get("row", 1) or 1),
            )
            for p in data.get("pins", [])
        ],
        x1=int(data.get("x1", 0)), y1=int(data.get("y1", 0)),
        x2=int(data.get("x2", 0)), y2=int(data.get("y2", 0)),
        orientation=int(data.get("orientation", 0)),
        description=data.get("description", ""),
        label_style=data.get("label_style", "staggered"),
        symbol=data.get("symbol", ""),
    )


def preview_connector_svg(conn_json: str) -> str:
    """The connector editor's live preview, drawn by the real renderer."""
    data = json.loads(conn_json)
    conn_type = _connector_type(data.get("type", ""))
    if conn_type is None:
        return ""
    return render_connector_svg(_connector_from_dict(data), conn_type)


def generate(board_toml: str, image_data_uri: str = "", theme_name: str = "") -> str:
    """Render a board TOML to a finished pinout page.

    This runs the same sequence the CLI runs, against the same loaders, so the
    result matches ``pinout-gen`` byte for byte for the same input.
    """
    WORK.mkdir(parents=True, exist_ok=True)
    BOARD_PATH.write_text(board_toml, encoding="utf-8")

    board = load_board(BOARD_PATH)
    try:
        connector_types = load_all_connector_types(board, BOARD_PATH)
    except FileNotFoundError as e:
        raise RuntimeError(f"{e}\n\n{_CUSTOM_DIR_HINT}") from None
    try:
        theme = load_theme(theme_name or board.theme, BOARD_PATH, board.theme_dir)
    except FileNotFoundError as e:
        raise RuntimeError(f"{e}\n\n{_CUSTOM_DIR_HINT}") from None

    return generate_html(
        board, connector_types,
        theme=theme,
        image_data_uri=image_data_uri or None,
    )
