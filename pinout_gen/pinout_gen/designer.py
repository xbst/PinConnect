"""Locating the bundled designer and building the payload it runs in the browser.

The designer loads this package into Pyodide rather than reimplementing the
renderer in JavaScript, so it needs the package source as a zip it can fetch.
That zip is generated, never committed: ``build_payload`` writes it, and both
``pinout-gen --serve`` and the GitHub Pages workflow call it.
"""
from __future__ import annotations

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


def payload_is_stale(dest: Path, members: list[tuple[str, Path]]) -> bool:
    if not dest.is_file():
        return True
    built = dest.stat().st_mtime
    return any(src.stat().st_mtime > built for _, src in members)


def build_payload(dest: Path | None = None, *, force: bool = False) -> Path:
    """Write the Pyodide payload zip, skipping the work if it is already current.

    Entries carry a fixed timestamp so repeated builds of unchanged sources
    produce an identical file, which keeps HTTP caching predictable.
    """
    dest = Path(dest) if dest is not None else designer_root() / PAYLOAD_NAME
    members = _payload_members()
    if not force and not payload_is_stale(dest, members):
        return dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for arcname, src in members:
            info = zipfile.ZipInfo(arcname, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, src.read_bytes())
    return dest
