"""Locating the bundled designer and building the payload it runs in the browser.

The designer loads this package into Pyodide rather than reimplementing the
renderer in JavaScript, so it needs the package source as a zip it can fetch.
That zip is generated, never committed: ``build_payload`` writes it, and both
``pinout-gen --serve`` and the GitHub Pages workflow call it.
"""
from __future__ import annotations

import os
import sys
import zipfile
from pathlib import Path

_PKG = Path(__file__).resolve().parent

PAYLOAD_NAME = "pinout_gen.zip"

# Server-side only modules.  They would never be imported in the browser, so
# keeping them out of the payload saves bytes and avoids confusing tracebacks.
_PAYLOAD_EXCLUDE = {"cli.py", "serve.py", "designer.py"}


def designer_root() -> Path:
    """Directory holding the designer's static files.

    A sibling checkout wins over the copy inside the package.  Only a source
    tree has that sibling: in an installed wheel the path does not exist, so the
    packaged copy is used.  Checking the checkout first matters because building
    a wheel leaves its copy behind in the source tree, and preferring that copy
    would quietly serve stale files to whoever is editing the designer.
    """
    candidates = (_PKG.parent.parent / "pinout_design", _PKG / "designer")
    for path in candidates:
        if (path / "index.html").is_file():
            return path
    raise FileNotFoundError(
        "Could not find the designer's files. Looked in:\n  "
        + "\n  ".join(str(p) for p in candidates)
        + "\nReinstall pinout-gen, or run --serve from a source checkout."
    )


def _payload_members() -> list[tuple[str, Path]]:
    """``(name inside the zip, file on disk)`` for everything Pyodide needs."""
    members = [("bridge.py", designer_root() / "py" / "bridge.py")]
    for path in sorted(_PKG.rglob("*")):
        if not path.is_file() or path.suffix not in (".py", ".toml"):
            continue
        rel = path.relative_to(_PKG)
        # Skip caches, the designer copied in beside us, and the server-side
        # modules.  Without the designer check a wheel build would nest the
        # designer inside its own payload.
        if "__pycache__" in rel.parts or rel.parts[0] == "designer":
            continue
        if len(rel.parts) == 1 and rel.name in _PAYLOAD_EXCLUDE:
            continue
        members.append((f"pinout_gen/{rel.as_posix()}", path))
    return members


def _cache_root() -> Path:
    base = os.environ.get("LOCALAPPDATA") if sys.platform == "win32" \
        else os.environ.get("XDG_CACHE_HOME")
    return Path(base) if base else Path.home() / ".cache"


def default_payload_path() -> Path:
    """Where to build the payload when nobody names a location.

    Beside the designer when that directory is writable, which keeps a source
    checkout self-contained and lets a plain HTTP server find the file. An
    installed package is often read-only or owned by root, and writing into
    site-packages would leave a file pip never recorded and will not remove,
    so that case goes to a per-user cache instead.
    """
    root = designer_root()
    if os.access(root, os.W_OK):
        return root / PAYLOAD_NAME
    return _cache_root() / "pinconnect" / PAYLOAD_NAME


def payload_is_stale(dest: Path, members: list[tuple[str, Path]]) -> bool:
    """Whether the payload needs rebuilding.

    Comparing the archive's contents, not just modification times, is what
    catches a source file that was deleted or renamed: every remaining file is
    older than the zip in that case, so an mtime test alone would keep serving
    a connector type or theme the package no longer has.
    """
    if not dest.is_file():
        return True
    try:
        with zipfile.ZipFile(dest) as zf:
            if sorted(zf.namelist()) != sorted(name for name, _ in members):
                return True
    except (OSError, zipfile.BadZipFile):
        return True          # unreadable or truncated: rebuild rather than serve it
    built = dest.stat().st_mtime
    return any(src.stat().st_mtime > built for _, src in members)


def _write_payload(dest: Path, members: list[tuple[str, Path]]) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for arcname, src in members:
            info = zipfile.ZipInfo(arcname, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, src.read_bytes())


def build_payload(dest: Path | None = None, *, force: bool = False) -> Path:
    """Write the Pyodide payload zip, skipping the work if it is already current.

    Entries carry a fixed timestamp so repeated builds of unchanged sources
    produce an identical file, which keeps HTTP caching predictable.

    Falls back to a per-user cache if the chosen location turns out to be
    unwritable, so serving the designer from a system-wide install works
    instead of dying on a PermissionError.  Returns the path actually written.
    """
    explicit = dest is not None
    dest = Path(dest) if explicit else default_payload_path()
    members = _payload_members()
    if not force and not payload_is_stale(dest, members):
        return dest

    try:
        _write_payload(dest, members)
        return dest
    except OSError:
        fallback = _cache_root() / "pinconnect" / PAYLOAD_NAME
        if explicit or dest == fallback:
            raise    # the caller named this path, or the cache itself failed
        if not payload_is_stale(fallback, members):
            return fallback
        _write_payload(fallback, members)
        return fallback
