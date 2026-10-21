# Minimal GitHub Pages imitation: path, path.html, path/index.html, else <site>/404.html with status 404.
import http.server, os, sys
ROOT = sys.argv[1]; PREFIX = '/emis-plus-app'; PORT = int(sys.argv[2])
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def send_head(self):
        path = self.path.split('?')[0].split('#')[0]
        rel = path[len(PREFIX):] if path.startswith(PREFIX) else None
        if rel is not None:
            base = os.path.join(ROOT, rel.lstrip('/'))
            for cand in (base, base + '.html', os.path.join(base, 'index.html')):
                if os.path.isfile(cand):
                    self.path = PREFIX + '/' + os.path.relpath(cand, ROOT)
                    return super().send_head()
        f = open(os.path.join(ROOT, '404.html'), 'rb')
        self.send_response(404); self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(os.fstat(f.fileno()).st_size)); self.end_headers(); return f
    def translate_path(self, path):
        path = path.split('?')[0]
        if path.startswith(PREFIX): path = path[len(PREFIX):]
        return os.path.join(ROOT, path.lstrip('/'))
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
