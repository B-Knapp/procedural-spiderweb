"""Build the self-contained index.html: inlines the spider sprites and the app script."""
import base64, json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
meta = json.loads((root / 'assets/meta.json').read_text())
assets = {'meta': meta, 'img': {k: 'data:image/png;base64,' + base64.b64encode((root / 'assets' / f'{k}.png').read_bytes()).decode() for k in meta}}
tpl = (root / 'src/index.html.tpl').read_text()
html = tpl.replace('/*ASSETS*/', 'window.SPIDER_ASSETS=' + json.dumps(assets) + ';').replace('/*APP*/', (root / 'src/app.js').read_text())
(root / 'index.html').write_text(html)
print('wrote index.html', len(html), 'bytes')
