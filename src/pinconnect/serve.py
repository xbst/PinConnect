"""Serve the designer locally.

`pinconnect` with no config file serves the designer, so it is one command
away rather than a directory change, a separate web server, and a reminder to
activate a virtual environment.  The designer has to be served over HTTP because it fetches its
Python payload, so opening index.html from disk does not work.
"""
from __future__ import annotations

import socket
import sys
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .payload import PAYLOAD_NAME, build_payload, designer_root


class _Handler(SimpleHTTPRequestHandler):
    """Static files, never cached.

    The payload is rebuilt whenever the package changes and the designer's own
    modules change under anyone editing them, so a cached copy is always the
    wrong answer here.

    The payload is served from wherever it was actually built, which is not
    always inside the served directory: for an installed package it lives in
    a per-user cache.
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


# On Windows, SO_REUSEADDR lets a socket bind a port another process is already
# listening on, so the designer would share a port with some other server and
# report it as its own. SO_EXCLUSIVEADDRUSE is the safe option there; Windows
# does not hold a port in TIME_WAIT against a new listener, so nothing is lost.
_WINDOWS = sys.platform == "win32"


def _set_port_options(s: socket.socket) -> None:
    if _WINDOWS:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    else:
        # The real server sets allow_reuse_address; without the same option
        # here a port still in TIME_WAIT from the previous run reads as taken
        # on Linux and macOS, and the requested port is abandoned for no reason.
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)


class _Server(ThreadingHTTPServer):
    allow_reuse_address = not _WINDOWS

    def server_bind(self) -> None:
        if _WINDOWS:
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def _answers(port: int) -> bool:
    """Whether something already accepts connections on 127.0.0.1 at this port.

    A bind alone cannot tell on Windows: it succeeds while another server
    listens on all interfaces, as `python -m http.server` does by default. A
    listener accepts within milliseconds; a closed port is only slow to refuse
    (Windows retries the handshake), so a short timeout means free.
    """
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.2):
            return True
    except OSError:
        return False


def _probe(port: int) -> int | None:
    """Bind a port to see whether it is free, returning the number it got."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        _set_port_options(s)
        try:
            s.bind(("127.0.0.1", port))
            got = s.getsockname()[1]
        except OSError:
            return None
    return None if _answers(got) else got


def _pick_port(preferred: int) -> int:
    if preferred:
        got = _probe(preferred)
        if got is not None:
            return got
        print(f"Port {preferred} is in use, choosing another.")
    # A port the system hands out can still be held on another address, so
    # ask again a few times before giving up.
    for _ in range(10):
        got = _probe(0)
        if got is not None:
            return got
    raise OSError("could not bind a port")


def serve(port: int = 0, *, open_browser: bool = True) -> None:
    if not 0 <= port <= 65535:
        raise ValueError(f"port must be between 0 and 65535, got {port}")

    root: Path = designer_root()
    payload = build_payload()
    print(f"Designer:  {root}")
    print(f"Payload:   {payload}  ({payload.stat().st_size / 1024:.0f} KB)")
    if payload.parent != root:
        print("           (built in the user cache, outside the installed package)")

    bound = _pick_port(port)
    handler = partial(_Handler, directory=str(root))
    _Handler.payload = payload
    # The probe socket is closed by now, so another process could take the port
    # in between. Report that rather than dying on a bare traceback.
    try:
        httpd = _Server(("127.0.0.1", bound), handler)
    except OSError as e:
        raise OSError(f"could not serve on port {bound}: {e}") from None

    url = f"http://127.0.0.1:{bound}"
    # Flushed so a script or tool reading a pipe sees the address before
    # serving blocks.
    print(f"Serving:   {url}\nPress Ctrl+C to stop.", flush=True)
    if open_browser:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()
