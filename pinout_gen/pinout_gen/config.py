"""Config parsing for board pinout and connector type definitions."""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:
    try:
        import tomllib
    except ModuleNotFoundError:
        import tomli as tomllib  # type: ignore[no-redef]


# ── Connector type (geometry definition) ─────────────────────────────

@dataclass
class ConnectorGeometry:
    pin_pitch: float = 10.0
    padding_left: float = 10.0
    padding_right: float = 10.0
    height: float = 23.0
    wall: float = 2.6          # wall thickness
    pin_cy: float = 13.5       # pin center Y from top at 0°
    pin_radius: float = 3.0
    pinout_side: str = "bottom"
    line_length: float = 20.0
    rows: int = 1
    row2_pin_cy: float = 0.0
    row2_pinout_side: str = "top"
    row2_line_length: float = 20.0
    row2_padding_left: float = -1.0
    row2_pin_pitch_y: float = 0.0
    row2_pin_radius: float = -1.0
    cavity_size: float = 0.0
    mating_pin_scale: float = 1.0

    def connector_width(self, n_pins: int) -> float:
        if n_pins < 1:
            return self.padding_left + self.padding_right
        return self.padding_left + (n_pins - 1) * self.pin_pitch + self.padding_right

    def pin_centers_x(self, n_pins: int) -> list[float]:
        return [self.padding_left + i * self.pin_pitch for i in range(n_pins)]


@dataclass
class ConnectorType:
    name: str
    style: str  # "latch" (XH/PH) or "box" (simple rectangle)
    geometry: ConnectorGeometry


# ── Board config ─────────────────────────────────────────────────────

@dataclass
class Pin:
    name: str
    color: str = "#888888"
    row: int = 1


@dataclass
class Connector:
    id: str
    name: str
    type: str
    pins: list[Pin]
    x1: int = 0
    y1: int = 0
    x2: int = 0
    y2: int = 0
    orientation: int = 0
    description: str = ""
    label_style: str = "staggered"


@dataclass
class Board:
    title: str
    image: str
    width: int
    height: int
    connector_dir: str
    connectors: list[Connector] = field(default_factory=list)


# ── Loading ──────────────────────────────────────────────────────────

def load_board(path: Path) -> Board:
    with open(path, "rb") as f:
        raw = tomllib.load(f)

    b = raw["board"]
    board = Board(
        title=b.get("title", "Pinout"),
        image=b["image"],
        width=b["width"],
        height=b["height"],
        connector_dir=b.get("connector_dir", "./connectors"),
    )

    for c in raw.get("connector", []):
        pins = [
            Pin(name=p["name"], color=p.get("color", "#888888"), row=p.get("row", 1))
            for p in c.get("pin", [])
        ]
        board.connectors.append(Connector(
            id=c["id"], name=c["name"], type=c["type"], pins=pins,
            x1=c["x1"], y1=c["y1"], x2=c["x2"], y2=c["y2"],
            orientation=c.get("orientation", 0),
            description=c.get("description", ""),
            label_style=c.get("label_style", "staggered"),
        ))
    return board


def load_connector_type(path: Path) -> ConnectorType:
    with open(path, "rb") as f:
        raw = tomllib.load(f)

    info = raw["connector"]
    geo_raw = raw.get("geometry", {})
    geo = ConnectorGeometry(**{
        k: v for k, v in geo_raw.items()
        if k in ConnectorGeometry.__dataclass_fields__
    })
    return ConnectorType(
        name=info["name"],
        style=info.get("style", "box"),
        geometry=geo,
    )


_BUNDLED_CONNECTORS = Path(__file__).parent / "connectors"


def load_all_connector_types(board: Board, board_path: Path) -> dict[str, ConnectorType]:
    connector_dir = (board_path.parent / board.connector_dir).resolve()
    types: dict[str, ConnectorType] = {}
    for type_name in {c.type for c in board.connectors}:
        toml_path = connector_dir / f"{type_name}.toml"
        if not toml_path.exists():
            toml_path = _BUNDLED_CONNECTORS / f"{type_name}.toml"
        if not toml_path.exists():
            raise FileNotFoundError(f"Connector type '{type_name}' not found at {connector_dir} or {_BUNDLED_CONNECTORS}")
        types[type_name] = load_connector_type(toml_path)
    return types
