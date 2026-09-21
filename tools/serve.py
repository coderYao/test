#!/usr/bin/env python3
"""Local dev server: like `python3 -m http.server`, but tells the browser never to cache,
so a plain reload always shows the files on disk. Usage: python3 tools/serve.py [port] [dir]"""
import os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    target = os.path.join(root, sys.argv[2]) if len(sys.argv) > 2 else root
    if not os.path.isdir(target):
        sys.exit(f'{sys.argv[2]}: no such directory (for dist/crazygames, run python3 tools/build_crazygames.py first)')
    os.chdir(target)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'Serving {os.getcwd()} at http://localhost:{port}/ (no caching)')
    ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
