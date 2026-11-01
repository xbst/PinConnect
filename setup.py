"""Build hook that keeps files deleted from the source out of the wheel.

setuptools stages the package into build/lib and never prunes it, so anything a
previous in-tree build put there (`pip install .`, `pip wheel .`) is copied
into the next wheel: modules, connector types or designer files since deleted
or renamed, and stale bytecode. Clearing the staged package first makes each
build reflect only what is in src/ now. Everything else is in pyproject.toml.
"""
import shutil
from pathlib import Path

from setuptools import setup

_STAGED = Path(__file__).resolve().parent / "build" / "lib" / "pinconnect"
if _STAGED.exists():
    shutil.rmtree(_STAGED, ignore_errors=True)

setup()
