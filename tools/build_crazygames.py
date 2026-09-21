#!/usr/bin/env python3
"""Package Ink Koi for upload to CrazyGames.

Writes dist/crazygames/ (index.html, style.css, js/) and dist/ink-koi-crazygames.zip with index.html at
the zip root. Only the Ink Koi files go in: no Perigee, docs or tools. The build differs from the web
version in two ways: the CrazyGames SDK script is added to <head> (js/platform.js picks it up), and asset
URLs are stamped with the current commit. Usage: python3 tools/build_crazygames.py
"""
import os, re, shutil, subprocess, sys, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'dist', 'crazygames')
ZIP = os.path.join(ROOT, 'dist', 'ink-koi-crazygames.zip')
SDK = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'
LIMIT_FILES, LIMIT_TOTAL, LIMIT_INITIAL = 1500, 250 * 2**20, 50 * 2**20  # CrazyGames technical requirements


def version():
    try:
        return subprocess.check_output(['git', 'rev-parse', '--short=8', 'HEAD'], cwd=ROOT, text=True).strip()
    except Exception:
        return 'build'


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(os.path.join(OUT, 'js'))
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    if SDK in html or '</head>' not in html:
        sys.exit('index.html: unexpected <head>; refusing to build')
    html = html.replace('</head>', SDK + '\n</head>').replace('?v=dev', '?v=' + version())

    # every local file the page references must exist and be relative, or it will 404 on the portal
    refs = re.findall(r'(?:src|href)="([^"]+)"', html)
    local = [r.split('?')[0] for r in refs if not re.match(r'^(https?:)?//', r)]
    bad = [r for r in local if r.startswith('/') or not os.path.isfile(os.path.join(ROOT, r))]
    if bad:
        sys.exit('index.html references missing or absolute paths: ' + ', '.join(bad))

    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)
    for rel in local:
        os.makedirs(os.path.dirname(os.path.join(OUT, rel)) or OUT, exist_ok=True)
        shutil.copyfile(os.path.join(ROOT, rel), os.path.join(OUT, rel))

    files = [os.path.join(d, f) for d, _, fs in os.walk(OUT) for f in fs]
    total = sum(os.path.getsize(f) for f in files)
    if len(files) > LIMIT_FILES or total > min(LIMIT_TOTAL, LIMIT_INITIAL):
        sys.exit(f'build exceeds CrazyGames limits: {len(files)} files, {total} bytes')
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(files):
            z.write(f, os.path.relpath(f, OUT))
    external = [r for r in refs if re.match(r'^(https?:)?//', r)]
    print(f'{len(files)} files, {total / 1024:.0f} KB -> {os.path.relpath(ZIP, ROOT)} ({os.path.getsize(ZIP) / 1024:.0f} KB)')
    print('external requests:', ', '.join(sorted(set(re.sub(r'^(https?:)?//([^/]+).*', r'\2', r) for r in external))))


if __name__ == '__main__':
    main()
