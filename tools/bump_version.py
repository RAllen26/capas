# Stamps a version on every local script/stylesheet URL so phones fetch fresh files after a push.
# Usage (before committing a release): python3 tools/bump_version.py
import re, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime('%Y%m%d%H%M')
for name in ['index.html', 'ar.html', 'theme.html']:
    p = root / name
    s = re.sub(r'((?:src|href)="(?:js|css)/[^"?]+)(\?v=[^"]*)?"', rf'\1?v={v}"', p.read_text())
    p.write_text(s)
p = root / 'js/ar.js'
p.write_text(re.sub(r"three-layer\.js(\?v=[^']*)?'", f"three-layer.js?v={v}'", p.read_text()))
print('version', v)
