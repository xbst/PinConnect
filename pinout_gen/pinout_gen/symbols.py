"""Named semantic icons for connectors.

A board connector opts into a symbol via ``[[connector]] symbol = "..."``.  The
value is a named icon (resolved to a bundled SVG here), a literal unicode glyph
(rendered as text), or ``"none"`` (no symbol).  Icons are simple 24x24 line
drawings that use ``currentColor`` so they inherit the surrounding text colour.
"""
from __future__ import annotations

import html

# Inner markup of each icon (inside a 24x24 viewBox).  Keep them simple and
# monochrome; _wrap() supplies the <svg> shell.
SYMBOLS: dict[str, str] = {
    "power": '<path d="M18.36 6.64a9 9 0 1 1-12.72 0"/><path d="M12 2v10"/>',
    "fan": (
        '<path d="M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 '
        '6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002'
        'l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z"/>'
        '<path d="M12 12v.01"/>'
    ),
    "heater": (
        '<path d="M9.5 3.5c-1.5 1.4-1.5 3 0 4.5s1.5 3.1 0 4.5"/>'
        '<path d="M14.5 3.5c-1.5 1.4-1.5 3 0 4.5s1.5 3.1 0 4.5"/>'
        '<path d="M4 20h16"/>'
    ),
    "fire": (
        '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 '
        '2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3'
        'a2.5 2.5 0 0 0 2.5 2.5z"/>'
    ),
    "temperature": '<path d="M14 14.76V4a2 2 0 1 0-4 0v10.76a4 4 0 1 0 4 0z"/>',
    "switch": (
        '<rect x="1.5" y="6" width="21" height="12" rx="6"/>'
        '<circle cx="16" cy="12" r="3.4" fill="currentColor" stroke="none"/>'
    ),
    "led": (
        '<path d="M9.5 18h5"/><path d="M10 21h4"/>'
        '<path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1.2.9 1.9v.3h5.4v-.3c0-.7.3-1.4.9-1.9'
        'A6 6 0 0 0 12 3z"/>'
    ),
    "setting": (
        '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/>'
        '<path d="M2 14h4M10 8h4M18 16h4"/>'
    ),
    "usb": (
        '<path d="M12 21.5V4"/>'
        '<path d="M9 6.5l3-3 3 3"/>'
        '<circle cx="12" cy="21.5" r="1.6" fill="currentColor" stroke="none"/>'
        '<path d="M12 13l-3.3-3.3"/>'
        '<circle cx="8" cy="9" r="1.7" fill="currentColor" stroke="none"/>'
        '<path d="M12 16l3.3-3.3"/>'
        '<rect x="14" y="10.7" width="3.2" height="3.2" fill="currentColor" stroke="none"/>'
    ),
    "data": (
        '<path d="M3 9h14"/><path d="M13 5l4 4-4 4"/>'
        '<path d="M21 15H7"/><path d="M11 11l-4 4 4 4"/>'
    ),
    "motor": (
        '<circle cx="12" cy="12" r="9"/>'
        '<path d="M8.5 15.5V8.5l3.5 4.2 3.5-4.2v7"/>'
    ),
    "fuse": (
        '<rect x="5" y="9" width="14" height="6" rx="1.5"/>'
        '<path d="M2 12h3M19 12h3"/><path d="M6.5 12h11"/>'
    ),
    # Extras beyond the requested set.
    "ground": '<path d="M12 3v10"/><path d="M6 13h12"/><path d="M8.5 16.5h7"/><path d="M11 20h2"/>',
    "signal": '<path d="M3 12h3l2-6 4 12 2.5-6H21"/>',
    "button": (
        '<circle cx="12" cy="12" r="8.5"/>'
        '<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>'
    ),
    "speaker": '<path d="M4 9h3l5-4v14l-5-4H4z"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7"/>',
    "battery": (
        '<rect x="2.5" y="8" width="16" height="8" rx="1.5"/><path d="M21 11v2"/>'
        '<path d="M6 12h2"/><path d="M14 12h2M15 11v2"/>'
    ),
    "lightning": '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    "gear": (
        '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0'
        'l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51'
        'a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 '
        '0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 '
        '1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73'
        'l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38'
        'a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>'
        '<circle cx="12" cy="12" r="3"/>'
    ),
}

# Common synonyms → canonical names.
_ALIASES: dict[str, str] = {
    "temp": "temperature", "thermistor": "temperature", "thermal": "temperature",
    "gnd": "ground", "earth": "ground",
    "jumper": "setting", "jumpers": "setting", "dip": "setting",
    "dipswitch": "setting", "settings": "setting", "config": "setting",
    "buzzer": "speaker", "spkr": "speaker",
    "stepper": "motor", "servo": "motor",
    "batt": "battery",
    "bus": "data", "i2c": "data", "spi": "data", "uart": "data", "can": "data",
    "bolt": "lightning", "zap": "lightning", "flash": "lightning",
    "cog": "gear", "cogwheel": "gear",
    "flame": "fire",
}

# Weak fall-backs from a connector's physical style, used only when a theme
# opts in with symbol_style_fallback and the connector sets no symbol.
_STYLE_DEFAULTS: dict[str, str] = {
    "button": "button",
    "slide-switch": "switch",
    "xt30": "power",
}

_SVG_OPEN = (
    '<svg class="sym" width="16" height="16" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true">'
)


def _canon(name: str) -> str:
    key = name.strip().lower()
    return _ALIASES.get(key, key)


def icon_svg(name: str) -> str | None:
    """The full ``<svg>`` for a named icon (after alias resolution), or None."""
    inner = SYMBOLS.get(_canon(name))
    return f"{_SVG_OPEN}{inner}</svg>" if inner else None


def render_symbol(symbol: str, style: str = "", *, style_fallback: bool = False) -> str:
    """Safe inner HTML for a connector's symbol, or '' for no symbol.

    - ``"none"`` → '' (explicitly suppressed)
    - a known icon name (incl. aliases) → its SVG
    - any other non-empty string → a literal unicode glyph (HTML-escaped)
    - empty → the connector style's default icon if ``style_fallback`` else ''
    """
    s = (symbol or "").strip()
    if s.lower() == "none":
        return ""
    if s:
        svg = icon_svg(s)
        return svg if svg is not None else html.escape(s)
    if style_fallback:
        name = _STYLE_DEFAULTS.get(style)
        if name:
            return icon_svg(name) or ""
    return ""
