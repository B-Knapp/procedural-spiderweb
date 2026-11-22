"""Build the self-contained index.html.
Inlines the spider sprites (assets/) and the source files in src/js/ (in name order,
sharing one scope) into src/index.html.tpl."""
import base64, json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
meta = json.loads((root / 'assets/meta.json').read_text())
assets = {'meta': meta, 'img': {k: 'data:image/png;base64,' + base64.b64encode((root / 'assets' / f'{k}.png').read_bytes()).decode() for k in meta}}
header = """/* Orb Weaver: a procedural web-weaving screensaver.
   Every thread exists only because the spider physically laid it.
   Built from src/js/*.js by tools/build.py; edit those, not this. */
(() => {
'use strict';
"""
body = '\n'.join(p.read_text() for p in sorted((root / 'src/js').glob('*.js')))
app = header + body + '})();\n'
tpl = (root / 'src/index.html.tpl').read_text()
html = tpl.replace('/*ASSETS*/', 'window.SPIDER_ASSETS=' + json.dumps(assets) + ';').replace('/*APP*/', app)
(root / 'index.html').write_text(html)
print('wrote index.html', len(html), 'bytes')
