"""Config parsing for board pinout and connector type definitions."""
from __future__ import annotations

import base64
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
    style: str
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
    symbol: str = ""


@dataclass
class Board:
    title: str
    image: str
    width: int
    height: int
    connector_dir: str
    theme: str = "default"
    theme_dir: str = "./themes"
    connectors: list[Connector] = field(default_factory=list)


# ── Loading ──────────────────────────────────────────────────────────

def _require(table: dict, key: str, ctx: str):
    """Fetch a required key, raising a clear ValueError (not a bare KeyError)
    naming the missing field and where it belongs. The board TOML is meant to
    be hand-editable, so a missing key must read as a message, not a traceback.
    """
    try:
        return table[key]
    except (KeyError, TypeError):
        raise ValueError(f"{ctx}: missing required key '{key}'") from None


def load_board(path: Path) -> Board:
    try:
        with open(path, "rb") as f:
            raw = tomllib.load(f)
    except tomllib.TOMLDecodeError as e:
        raise ValueError(f"invalid TOML in {path.name}: {e}") from None

    if "board" not in raw:
        raise ValueError(f"{path.name}: missing required [board] table")
    b = raw["board"]

    width = _require(b, "width", "[board]")
    height = _require(b, "height", "[board]")
    image = _require(b, "image", "[board]")
    for dim, val in (("width", width), ("height", height)):
        if isinstance(val, bool) or not isinstance(val, (int, float)) or val <= 0:
            raise ValueError(
                f"[board]: {dim} must be a positive number (got {val!r}); "
                f"set width/height to the board image's pixel dimensions"
            )
    if not image:
        raise ValueError("[board]: 'image' must name the board image the pinout overlays")

    board = Board(
        title=b.get("title", "Pinout"),
        image=image, width=width, height=height,
        connector_dir=b.get("connector_dir", "./connectors"),
        theme=b.get("theme", "default"),
        theme_dir=b.get("theme_dir", "./themes"),
    )

    connectors_raw = raw.get("connector", [])
    if isinstance(connectors_raw, dict):
        # A single `[connector]` table instead of `[[connector]]` (array of
        # tables) is a classic TOML slip; tomllib parses it as a dict.
        raise ValueError(
            "connectors must be written as '[[connector]]' (an array of tables), not '[connector]'"
        )

    seen_ids: set[str] = set()
    for i, c in enumerate(connectors_raw):
        cid = _require(c, "id", f"[[connector]] #{i + 1}")
        # Ids key the connector data, the hotspot rects, and the sidebar entries
        # in the generated page; a duplicate would silently overwrite one
        # connector's pinout and mis-target hover/click. Reject it up front.
        if cid in seen_ids:
            raise ValueError(
                f"duplicate connector id '{cid}': every [[connector]] must have a unique id"
            )
        seen_ids.add(cid)
        ctx = f"connector '{cid}'"
        pins = [
            Pin(name=_require(p, "name", f"{ctx} pin #{j + 1}"),
                color=p.get("color", "#888888"), row=p.get("row", 1))
            for j, p in enumerate(c.get("pin", []))
        ]
        board.connectors.append(Connector(
            id=cid,
            name=_require(c, "name", ctx), type=_require(c, "type", ctx), pins=pins,
            x1=_require(c, "x1", ctx), y1=_require(c, "y1", ctx),
            x2=_require(c, "x2", ctx), y2=_require(c, "y2", ctx),
            orientation=c.get("orientation", 0),
            description=c.get("description", ""),
            label_style=c.get("label_style", "staggered"),
            symbol=c.get("symbol", ""),
        ))
    return board


def load_connector_type(path: Path) -> ConnectorType:
    try:
        with open(path, "rb") as f:
            raw = tomllib.load(f)
    except tomllib.TOMLDecodeError as e:
        raise ValueError(f"invalid TOML in {path.name}: {e}") from None

    if "connector" not in raw:
        raise ValueError(f"{path.name}: missing required [connector] table")
    info = raw["connector"]
    geo_raw = raw.get("geometry", {})

    # A misspelled geometry key used to be silently dropped, so the field kept
    # its default and the connector drew wrong with no warning. Reject unknown
    # keys, and coerce each value to its field's type so a wrong-typed value is
    # a clear error here rather than a deep TypeError during rendering.
    fields = ConnectorGeometry.__dataclass_fields__
    unknown = sorted(k for k in geo_raw if k not in fields)
    if unknown:
        raise ValueError(f"{path.name}: unknown [geometry] key(s): {', '.join(unknown)}")
    geo_kwargs = {}
    for k, v in geo_raw.items():
        target = type(fields[k].default)
        try:
            geo_kwargs[k] = target(v)
        except (TypeError, ValueError):
            raise ValueError(
                f"{path.name}: [geometry] '{k}' must be {target.__name__}, got {v!r}"
            ) from None

    return ConnectorType(
        name=_require(info, "name", f"{path.name} [connector]"),
        style=info.get("style", "box"),
        geometry=ConnectorGeometry(**geo_kwargs),
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


# ── Theme ────────────────────────────────────────────────────────────

# Built-in default palette: the colours PinConnect used before theming.
# A theme TOML overrides only the tokens it names; unnamed tokens fall back
# here, so a board with no theme (or a minimal one) renders unchanged.
_DEFAULT_COLORS_LIGHT: dict[str, str] = {
    "bg": "#ffffff", "text": "#1a1a1a",
    "tip-bg": "#ffffff", "tip-border": "#d0d0d0", "tip-shadow": "rgba(0,0,0,.12)",
    "hs-hover": "rgba(59,130,246,.13)", "hs-stroke": "rgba(59,130,246,.5)",
    "hs-active": "rgba(59,130,246,.22)",
    "hint-bg": "rgba(30,30,30,.75)", "hint-text": "#fff",
    "divider": "#e5e5e5",
    "conn-body": "#e8e8e0", "conn-cavity": "#d0d0c8", "conn-stroke": "#555",
    "line-color": "#777", "label-color": "#333",
    "desc-color": "#555", "type-color": "#888",
    "scroll-thumb": "rgba(0,0,0,.22)", "scroll-track": "transparent",
}
_DEFAULT_COLORS_DARK: dict[str, str] = {
    "bg": "#131313", "text": "#e0e0e0",
    "tip-bg": "#1e1e1e", "tip-border": "#3a3a3a", "tip-shadow": "rgba(0,0,0,.4)",
    "hs-hover": "rgba(96,165,250,.15)", "hs-stroke": "rgba(96,165,250,.5)",
    "hs-active": "rgba(96,165,250,.25)",
    "hint-bg": "rgba(240,240,240,.85)", "hint-text": "#131313",
    "divider": "#333",
    "conn-body": "#3a3a35", "conn-cavity": "#2e2e28", "conn-stroke": "#aaa",
    "line-color": "#888", "label-color": "#ddd",
    "desc-color": "#aaa", "type-color": "#888",
    "scroll-thumb": "rgba(255,255,255,.20)", "scroll-track": "transparent",
}


@dataclass
class ThemeFont:
    """A font a theme uses.  ``source`` is ``google`` (loaded via a Fonts <link>),
    ``bundled`` (a font file embedded as a base64 @font-face, so output stays
    self-contained), or ``system`` (``family`` is used verbatim as a CSS stack).
    ``data_uri``/``fmt`` are filled in by :func:`_parse_font` for bundled fonts."""
    family: str = "Roboto"
    source: str = "google"
    weights: str = "400;500;600"
    data_uri: str = ""
    fmt: str = ""

    def css_family(self, generic: str = "system-ui,sans-serif") -> str:
        """The CSS ``font-family`` value: a system stack verbatim, otherwise the
        quoted family followed by a generic fallback."""
        if self.source == "system":
            return self.family
        return f"'{self.family}',{generic}"


@dataclass
class ThemeBehavior:
    """How the pinout's chrome behaves.  Defaults reproduce the original layout:
    a collapsed 240px sidebar, no narrow-screen restacking."""
    sidebar_default_open: bool = False       # start with the connector list shown
    sidebar_max_width: int = 340             # max sidebar width in px; the panel sizes to its
                                             # content up to this (and 40vw), wrapping only if longer
    sidebar_responsive_stack: bool = False   # below the breakpoint, list moves below the image
    sidebar_stack_breakpoint: int = 640      # px width at/under which stacking kicks in
    show_symbols: bool = True                # show per-connector symbols in the list & tooltip
    symbol_style_fallback: bool = False      # symbol-less connectors fall back to a style default
    font_scale: float = 1.0                  # multiplier for the list / tooltip / bottom-bar text
    symbol_size: int = 16                    # connector-symbol icon size in px
    tooltip_box_scale: float = 1.5           # tooltip drawing's long side, as a multiple of the
                                             # connector's on-screen box; 0 disables (natural size)
    tooltip_min_scale: float = 0.5           # never shrink the drawing below this fraction of its
                                             # natural size, so pin labels stay readable


@dataclass
class Theme:
    """A resolved theme.  Field defaults reproduce PinConnect's built-in look, so
    ``Theme()`` == no theme."""
    name: str = "Default"
    colors_light: dict[str, str] = field(default_factory=lambda: dict(_DEFAULT_COLORS_LIGHT))
    colors_dark: dict[str, str] = field(default_factory=lambda: dict(_DEFAULT_COLORS_DARK))
    font: ThemeFont = field(default_factory=ThemeFont)
    label_font: ThemeFont | None = None
    behavior: ThemeBehavior = field(default_factory=ThemeBehavior)
    extra_css: str = ""


_BUNDLED_THEMES = Path(__file__).parent / "themes"

_FONT_MIME = {"woff2": "font/woff2", "woff": "font/woff", "ttf": "font/ttf", "otf": "font/otf"}
_FONT_FORMAT = {"woff2": "woff2", "woff": "woff", "ttf": "truetype", "otf": "opentype"}


def _parse_font(d: dict, base_dir: Path) -> ThemeFont:
    """Build a ThemeFont from a theme's [font] (or [font.label]) table.  For a
    bundled font, read the file (relative to the theme file) and embed it as a
    base64 data URI so the generated HTML stays self-contained."""
    source = d.get("source", "google")
    if source not in ("google", "bundled", "system"):
        raise ValueError(f"font source must be google|bundled|system, got '{source}'")
    font = ThemeFont(
        family=d.get("family", "Roboto"),
        source=source,
        weights=str(d.get("weights", "400;500;600")),
    )
    if source == "bundled":
        fname = d.get("file", "")
        if not fname:
            raise ValueError(f"bundled font '{font.family}' needs a 'file' path")
        fpath = (base_dir / fname).resolve()
        if not fpath.exists():
            raise FileNotFoundError(f"font file not found: {fpath}")
        ext = fpath.suffix.lower().lstrip(".")
        mime = _FONT_MIME.get(ext, "font/woff2")
        font.fmt = _FONT_FORMAT.get(ext, "woff2")
        b64 = base64.b64encode(fpath.read_bytes()).decode("ascii")
        font.data_uri = f"data:{mime};base64,{b64}"
    return font


def load_theme(name: str, board_path: Path, theme_dir: str = "./themes") -> Theme:
    """Resolve a theme by name.

    Looks in the board-local ``theme_dir`` first, then the themes bundled with
    the package.  Tokens the file omits fall back to the built-in default
    palette, so a minimal theme only needs to state what differs.  The built-in
    ``default`` needs no file; any other unknown name is an error.
    """
    theme = Theme()
    search = [
        (board_path.parent / theme_dir).resolve() / f"{name}.toml",
        _BUNDLED_THEMES / f"{name}.toml",
    ]
    toml_path = next((p for p in search if p.exists()), None)
    if toml_path is None:
        if name and name != "default":
            raise FileNotFoundError(
                f"Theme '{name}' not found in {search[0].parent} or {_BUNDLED_THEMES}"
            )
        return theme

    with open(toml_path, "rb") as f:
        raw = tomllib.load(f)

    t = raw.get("theme", {})
    theme.name = t.get("name", name)
    colors = raw.get("colors", {})
    theme.colors_light.update(colors.get("light", {}))
    theme.colors_dark.update(colors.get("dark", {}))
    fdict = raw.get("font", {})
    if isinstance(fdict, dict) and fdict:
        theme.font = _parse_font(fdict, toml_path.parent)
        label = fdict.get("label")
        if isinstance(label, dict):
            theme.label_font = _parse_font(label, toml_path.parent)

    bdict = raw.get("behavior", {})
    if isinstance(bdict, dict) and bdict:
        beh = theme.behavior
        beh.sidebar_default_open = bool(bdict.get("sidebar_default_open", beh.sidebar_default_open))
        beh.sidebar_max_width = int(bdict.get("sidebar_max_width", beh.sidebar_max_width))
        beh.sidebar_responsive_stack = bool(bdict.get("sidebar_responsive_stack", beh.sidebar_responsive_stack))
        beh.sidebar_stack_breakpoint = int(bdict.get("sidebar_stack_breakpoint", beh.sidebar_stack_breakpoint))
        beh.show_symbols = bool(bdict.get("show_symbols", beh.show_symbols))
        beh.symbol_style_fallback = bool(bdict.get("symbol_style_fallback", beh.symbol_style_fallback))
        beh.font_scale = float(bdict.get("font_scale", beh.font_scale))
        beh.symbol_size = int(bdict.get("symbol_size", beh.symbol_size))
        beh.tooltip_box_scale = max(0.0, float(bdict.get("tooltip_box_scale", beh.tooltip_box_scale)))
        beh.tooltip_min_scale = min(1.0, max(0.0, float(
            bdict.get("tooltip_min_scale", beh.tooltip_min_scale))))

    extra = raw.get("extra_css", {})
    if isinstance(extra, dict):
        theme.extra_css = extra.get("css", "")
    elif isinstance(extra, str):
        theme.extra_css = extra
    return theme
