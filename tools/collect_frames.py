#!/usr/bin/env python3
"""Collects the frames tools/record.html renders and encodes them to MP4 with ffmpeg.

    python3 tools/collect_frames.py            # listens on http://localhost:8002
    open http://localhost:8000/tools/record.html?format=landscape&post=http://localhost:8002
    open http://localhost:8000/tools/record.html?format=portrait&post=http://localhost:8002

Frames land in dist/crazygames-video/frames-<format>/ and the result in
dist/crazygames-video/preview-<format>-<w>x<h>.mp4: H.264, yuv420p, no audio track, faststart.
CrazyGames allows at most 50 MB per video, so the quality is lowered until the file fits.
"""
import os, re, shutil, subprocess, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'dist', 'crazygames-video')
ALLOWED_ORIGIN = 'http://localhost:8000'
MAX_BYTES = 50 * 2**20


def encode(video, fps, w, h):
    frames = os.path.join(OUT, f'frames-{video}')
    target = os.path.join(OUT, f'preview-{video}-{w}x{h}.mp4')
    for crf in (17, 20, 23, 26):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(frames, '%05d.jpg'),
                        # JPEG frames are full-range BT.601; web players expect limited-range BT.709
                        '-vf', 'scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=full:out_range=tv,format=yuv420p',
                        '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf),
                        '-movflags', '+faststart', '-an', target], check=True)
        if os.path.getsize(target) <= MAX_BYTES:
            break
    n = len(os.listdir(frames))
    return f'{os.path.relpath(target, ROOT)}: {n} frames, {n / fps:.1f}s, crf {crf}, {os.path.getsize(target) / 2**20:.1f} MB'


class Handler(BaseHTTPRequestHandler):
    def _reply(self, code, body=b''):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
        self.send_header('Access-Control-Allow-Headers', 'content-type')  # image/jpeg bodies are preflighted
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._reply(204)

    def do_POST(self):
        url = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(url.query).items()}
        video = re.sub(r'[^a-z]', '', q.get('video', ''))
        if not video:
            return self._reply(400, b'video?')
        frames = os.path.join(OUT, f'frames-{video}')
        if url.path == '/frame':
            n = int(q['n'])
            if n == 0:
                shutil.rmtree(frames, ignore_errors=True)
            os.makedirs(frames, exist_ok=True)
            data = self.rfile.read(int(self.headers['Content-Length']))
            with open(os.path.join(frames, f'{n:05d}.jpg'), 'wb') as f:
                f.write(data)
            return self._reply(200)
        if url.path == '/encode':
            try:
                msg = encode(video, int(q.get('fps', 30)), int(q['w']), int(q['h']))
            except Exception as e:  # ffmpeg missing or failed: report it to the page
                return self._reply(500, str(e).encode())
            print(msg)
            return self._reply(200, msg.encode())
        self._reply(404)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg not found (brew install ffmpeg)')
    os.makedirs(OUT, exist_ok=True)
    print(f'Collecting frames into {os.path.relpath(OUT, ROOT)}/ on http://localhost:8002')
    HTTPServer(('127.0.0.1', 8002), Handler).serve_forever()
