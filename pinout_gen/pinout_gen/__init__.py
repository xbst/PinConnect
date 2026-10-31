"""Old name of the ``pinconnect`` package, kept so existing imports work.

Each ``pinout_gen.<module>`` is the matching ``pinconnect`` module itself, so
``from pinout_gen.renderer import generate_html`` still works. ``designer`` was
renamed ``pinconnect.payload``. ``pinout_gen.cli`` is a small module of its own,
because its ``main`` is the old ``pinout-gen`` command, not ``pinconnect``'s.
"""
import importlib
import sys
import warnings

warnings.warn(
    "pinout_gen was renamed to pinconnect; import pinconnect instead",
    DeprecationWarning,
    stacklevel=2,
)

_RENAMED = {
    "config": "pinconnect.config",
    "renderer": "pinconnect.renderer",
    "symbols": "pinconnect.symbols",
    "serve": "pinconnect.serve",
    "designer": "pinconnect.payload",
}

for _old, _new in _RENAMED.items():
    _module = importlib.import_module(_new)
    sys.modules[f"{__name__}.{_old}"] = _module
    globals()[_old] = _module

del _old, _new, _module
