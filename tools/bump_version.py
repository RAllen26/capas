# Stamps a version on every local script/stylesheet URL and on the service worker cache,
# so phones fetch fresh files after a push.
# Usage (before committing a release): python3 tools/bump_version.py
import re, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime('%Y%m%d%H%M')
for name in ['index.html', 'theme.html']:
    p = root / name
    s = re.sub(r'((?:src|href)="(?:js|css)/[^"?]+)(\?v=[^"]*)?"', rf'\1?v={v}"', p.read_text())
    p.write_text(s)
# Module imports between our own files ('./three-layer.js', './objects.js', ...) get the same stamp.
for p in (root / 'js').glob('*.js'):
    s = p.read_text()
    t = re.sub(r"('\./[\w-]+\.js)(\?v=[^']*)?'", rf"\1?v={v}'", s)
    if t != s: p.write_text(t)
p = root / 'sw.js'
p.write_text(re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{v}';", p.read_text()))
print('version', v)
