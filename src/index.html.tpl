<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orb Weaver</title>
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden}
canvas{display:block}
body.idle{cursor:none}
#cap{position:fixed;left:28px;bottom:24px;font:300 15px/1.35 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;color:rgba(255,248,235,.82);text-shadow:0 1px 6px rgba(0,0,0,.7);pointer-events:none;max-width:60vw;transition:opacity .6s}
#cap b{display:block;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:12px;opacity:.75;margin-bottom:2px}
#hud{position:fixed;right:28px;top:22px;font:500 13px system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.45);padding:6px 12px;border-radius:14px;opacity:0;transition:opacity .4s;pointer-events:none}
#help{position:fixed;right:28px;bottom:24px;font:400 12.5px/1.7 system-ui,sans-serif;color:rgba(255,255,255,.85);background:rgba(10,10,14,.5);padding:10px 14px;border-radius:10px;opacity:0;transition:opacity .8s;pointer-events:none;backdrop-filter:blur(4px)}
#help.show{opacity:1}
#help kbd{font:600 11px ui-monospace,monospace;background:rgba(255,255,255,.15);padding:1px 6px;border-radius:4px;margin-right:6px}
</style></head><body>
<canvas id="c"></canvas>
<div id="cap"></div><div id="hud"></div>
<div id="help" class="show">
<div><kbd>F</kbd>full screen (or double-click)</div>
<div><kbd>P</kbd>clean / pixel</div>
<div><kbd>S</kbd>true scale / enlarged spider</div>
<div><kbd>[</kbd><kbd>]</kbd>slower / faster</div>
<div><kbd>T</kbd>advance one hour</div>
<div><kbd>I</kbd>captions on / off</div>
<div><kbd>W</kbd>natural webs / spider writes words</div>
<div><kbd>A</kbd>farm / rainy alley</div>
<div><kbd>B</kbd>send a bug</div>
<div><kbd>N</kbd>new web &nbsp;<kbd>Space</kbd>pause &nbsp;<kbd>H</kbd>help</div>
</div>
<script>/*ASSETS*/</script>
<script>/*APP*/</script>
</body></html>
