"""Build hook that bundles the designer into the distribution.

The designer lives beside this package rather than inside it, so setuptools
would not ship it on its own. `pinout-gen --serve` has to work from any install,
including `pip install` straight from GitHub, so the designer's static files are
copied into the package before any build command runs.

The copy is skipped when the source is absent, which is the case when building
from an sdist: the designer is already inside the package there.
"""
import shutil
from pathlib import Path

from setuptools import setup

_HERE = Path(__file__).resolve().parent
_SRC = _HERE.parent / "pinout_design"
_DEST = _HERE / "pinout_gen" / "designer"

# Checkout-only tooling and generated files have no place in a wheel. The
# payload zip in particular is rebuilt at runtime from the installed package.
_SKIP_DIRS = {"tools", "__pycache__", "node_modules", ".git"}
_SKIP_FILES = {"pinout_gen.zip", "README.md"}


def _bundle_designer() -> None:
    if not (_SRC / "index.html").is_file():
        return  # building from an sdist; the copy is already in place
    if _DEST.exists():
        shutil.rmtree(_DEST)
    shutil.copytree(
        _SRC, _DEST,
        ignore=lambda _dir, names: [
            n for n in names if n in _SKIP_DIRS or n in _SKIP_FILES
        ],
    )


_bundle_designer()

setup()
