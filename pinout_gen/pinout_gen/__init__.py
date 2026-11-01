"""Old name of the ``pinconnect`` package, kept so existing imports work.

Each ``pinout_gen.<module>`` is the matching ``pinconnect`` module itself, so
``from pinout_gen.renderer import generate_html`` still works. ``designer`` was
renamed ``pinconnect.payload``. ``pinout_gen.cli`` is a small module of its own,
because its ``main`` is the old ``pinout-gen`` command, not ``pinconnect``'s.
"""
import importlib
import sys
import warnings

# Attributed to this module, not to the importer: Python skips the import
# machinery's frames, so stacklevel=2 would land on a script's own
# `import pinout_gen`, and a DeprecationWarning raised from __main__ is shown by
# default. Old scripts must keep a clean stderr (PowerShell 5.1 can turn native
# stderr into an error), so it is shown only when warnings are enabled.
warnings.warn(
    "pinout_gen was renamed to pinconnect; import pinconnect instead",
    DeprecationWarning,
    stacklevel=1,
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
