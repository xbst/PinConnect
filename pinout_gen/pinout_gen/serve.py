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

from .designer import build_payload, designer_root


class _Handler(SimpleHTTPRequestHandler):
    """Static files, never cached.

    The payload zip is rebuilt whenever the package changes, and the designer's
    modules change under anyone editing them, so a cached copy is always the
    wrong answer here.
    """

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        pass  # one line per asset is noise; errors still surface below


def _pick_port(preferred: int) -> int:
    """Bind the requested port, or let the OS choose when it is 0 or taken."""
    for candidate in ([preferred] if preferred else []) + [0]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", candidate))
                return s.getsockname()[1]
            except OSError:
                print(f"Port {candidate} is in use, choosing another.")
    raise OSError("could not bind a port")


def serve(port: int = 0, *, open_browser: bool = True) -> None:
    root: Path = designer_root()
    payload = build_payload()
    print(f"Designer:  {root}")
    print(f"Payload:   {payload.name}  ({payload.stat().st_size / 1024:.0f} KB)")

    bound = _pick_port(port)
    httpd = ThreadingHTTPServer(("127.0.0.1", bound), partial(_Handler, directory=str(root)))
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
