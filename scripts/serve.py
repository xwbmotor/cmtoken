#!/usr/bin/env python3
"""Lightweight HTTP server for cmtoken plugin distribution.

Auto-detects OS via User-Agent and returns the right installer.

Linux/Mac:   curl -fsSL http://159.75.246.86:19000/install | bash
Windows:     powershell -ExecutionPolicy Bypass -Command "iwr http://159.75.246.86:19000/install -UseBasicParsing | iex"
"""

import os
import http.server

PORT = 19000
BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SERVE_DIR = os.path.dirname(os.path.abspath(__file__))


class PluginHandler(http.server.BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path.split("?")[0]
        ua = self.headers.get("User-Agent", "").lower()

        # Explicit routes
        if path == "/cmtoken.tgz":
            self._serve_file(os.path.join(BASE_DIR, "cmtoken.tgz"), "application/x-tar")
            return
        if path == "/install.sh":
            self._serve_file(os.path.join(SERVE_DIR, "install.sh"), "text/x-shellscript")
            return
        if path == "/install.ps1":
            self._serve_file(os.path.join(SERVE_DIR, "install.ps1"), "text/plain")
            return

        # /install — auto-detect OS by User-Agent
        if path in ("/", "/install"):
            is_windows = any(w in ua for w in ("windows", "powershell", "msie", "trident", "edge", ".net"))
            if is_windows:
                self._serve_file(os.path.join(SERVE_DIR, "install.ps1"), "text/plain")
            else:
                self._serve_file(os.path.join(SERVE_DIR, "install.sh"), "text/x-shellscript")
            return

        self.send_error(404)

    def _serve_file(self, filepath, content_type):
        try:
            with open(filepath, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self.send_error(404)

    def log_message(self, fmt, *args):
        print(f"[cmtoken] {args[0]}")


if __name__ == "__main__":
    class ReusableServer(http.server.HTTPServer):
        allow_reuse_address = True

    with ReusableServer(("0.0.0.0", PORT), PluginHandler) as httpd:
        print(f"🚀 cmtoken plugin server on :{PORT}")
        print(f"")
        print(f"   Linux/Mac:")
        print(f"   curl -fsSL http://159.75.246.86:{PORT}/install | bash")
        print(f"")
        print(f"   Windows:")
        print(f'   powershell -ExecutionPolicy Bypass -Command "iwr http://159.75.246.86:{PORT}/install -UseBasicParsing | iex"')
        httpd.serve_forever()
