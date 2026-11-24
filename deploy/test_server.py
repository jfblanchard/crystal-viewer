#!/usr/bin/env python3
"""Local test server: serves deploy/ statically and proxies /cod like the
Cloudflare Pages Function, so the viewer can be tested end to end."""
import json
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent

MINERALS = {
    'sapphire': 'Al2 O3', 'ruby': 'Al2 O3', 'corundum': 'Al2 O3',
    'quartz': 'O2 Si', 'halite': 'Cl Na', 'salt': 'Cl Na',
    'calcite': 'C Ca O3', 'pyrite': 'Fe S2', 'fluorite': 'Ca F2',
    'galena': 'Pb S', 'hematite': 'Fe2 O3', 'magnetite': 'Fe3 O4',
    'rutile': 'O2 Ti', 'anatase': 'O2 Ti', 'ice': 'H2 O',
    'diamond': 'C', 'graphite': 'C',
    'opal': 'O2 Si', 'glass': 'O2 Si', 'obsidian': 'O2 Si',
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path.startswith('/cod'):
            url = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(url.query)
            if 'id' in params:
                cod_id = params['id'][0]
                with urllib.request.urlopen(f'https://www.crystallography.net/cod/{cod_id}.cif') as r:
                    body = r.read()
                self.send_response(200)
                self.send_header('content-type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(body)
                return
            if 'search' in params:
                q = params['search'][0].strip()
                queries = [f'text={urllib.parse.quote(q)}']
                formula = MINERALS.get(q.lower())
                if formula:
                    queries.append(f'formula={urllib.parse.quote(formula)}')
                seen = {}
                for query in queries:
                    try:
                        with urllib.request.urlopen(
                                f'https://www.crystallography.net/cod/result.php?format=json&{query}&limit=12') as r:
                            rows = json.load(r)
                        for row in rows:
                            if row['file'] not in seen:
                                seen[row['file']] = {**row, '_formula': query.startswith('formula')}
                    except Exception:
                        pass
                rows = list(seen.values())
                has_carbon = lambda f: bool(__import__('re').search(r'(^|\s)C\d', f or ''))
                rows.sort(key=lambda x: (0 if x['_formula'] else 1) + (0 if x.get('mineral') else 1) + (2 if has_carbon(x.get('formula')) else 0))
                body = json.dumps(rows[:8]).encode()
                self.send_response(200)
                self.send_header('content-type', 'application/json')
                self.end_headers()
                self.wfile.write(body)
                return
        return super().do_GET()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
