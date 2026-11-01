"""Build hook that keeps pinout-gen 0.2.0's files out of this stub's wheel.

setuptools stages the package into build/lib and never prunes it. A checkout
that built pinout-gen 0.2.0 still has that whole package staged there (the
renderer, the bundled connectors, the designer copy), and building this stub
over it would ship all of it again under the old name. Clearing the staged
package first makes the wheel hold only the stub. Everything else is in
pyproject.toml.
"""
import shutil
from pathlib import Path

from setuptools import setup

_STAGED = Path(__file__).resolve().parent / "build" / "lib" / "pinout_gen"
if _STAGED.exists():
    shutil.rmtree(_STAGED, ignore_errors=True)

setup()
