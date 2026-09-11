"""Serve the designer locally.

`pinout-gen --serve` exists so the designer is one command away rather than a
directory change, a separate web server, and a reminder to activate a virtual
environment.  The designer has to be served over HTTP because it fetches its
Python payload, so opening index.html from disk does not work.
"""
from __future__ import annotations

import socket
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .designer import PAYLOAD_NAME, build_payload, designer_root


class _Handler(SimpleHTTPRequestHandler):
    """Static files, never cached.

    The payload is rebuilt whenever the package changes and the designer's own
    modules change under anyone editing them, so a cached copy is always the
    wrong answer here.

    The payload is served from wherever it was actually built, which is not
    always inside the served directory: an installed package may be read-only,
    in which case it lives in a per-user cache.
    """

    payload: Path | None = None

    # SimpleHTTPRequestHandler takes its content types from mimetypes, which on
    # Windows consults the registry, where an installed application can have
    # remapped .js to text/plain.  The browser then refuses the module scripts
    # and the designer renders as a blank page.  State the few types this app
    # actually serves so that cannot happen.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".zip": "application/zip",
        ".wasm": "application/wasm",
        ".svg": "image/svg+xml",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def translate_path(self, path: str) -> str:
        served = super().translate_path(path)
        if self.payload is not None and Path(served).name == PAYLOAD_NAME:
            return str(self.payload)
        return served

    def log_message(self, fmt: str, *args) -> None:
        pass  # one line per asset is noise; errors still surface below


def _probe(port: int) -> int | None:
    """Bind a port to see whether it is free, returning the number it got."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        # The real server sets allow_reuse_address; without the same option here
        # a port still in TIME_WAIT from the previous run reads as taken on
        # Linux and macOS, and the requested port is abandoned for no reason.
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("127.0.0.1", port))
            return s.getsockname()[1]
        except OSError:
            return None


def _pick_port(preferred: int) -> int:
    if preferred:
        got = _probe(preferred)
        if got is not None:
            return got
        print(f"Port {preferred} is in use, choosing another.")
    got = _probe(0)
    if got is None:
        raise OSError("could not bind a port")
    return got


def serve(port: int = 0, *, open_browser: bool = True) -> None:
    if not 0 <= port <= 65535:
        raise ValueError(f"port must be between 0 and 65535, got {port}")

    root: Path = designer_root()
    payload = build_payload()
    print(f"Designer:  {root}")
    print(f"Payload:   {payload}  ({payload.stat().st_size / 1024:.0f} KB)")
    if payload.parent != root:
        print("           (built outside the package, which is not writable)")

    bound = _pick_port(port)
    handler = partial(_Handler, directory=str(root))
    _Handler.payload = payload
    # The probe socket is closed by now, so another process could take the port
    # in between. Report that rather than dying on a bare traceback.
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", bound), handler)
    except OSError as e:
        raise OSError(f"could not serve on port {bound}: {e}") from None

    url = f"http://127.0.0.1:{bound}"
    print(f"Serving:   {url}\nPress Ctrl+C to stop.")
    if open_browser:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()
