# Procedural Spiderweb

A 2D screensaver of a European garden spider (orb weaver) spinning a web from scratch between two fence posts on a farm. Every thread is laid by the spider itself; nothing is drawn in. No two webs are the same.

Open `index.html` in a browser. Press **F** or double-click for full screen.

## Controls

| Key | Action |
| --- | --- |
| F / double-click | Full screen |
| P | Clean / pixel look |
| S | True-to-life scale / enlarged spider and prey |
| [ ] | Slower / faster (0.5× to 16×) |
| T | Advance one hour |
| B | Send a bug into the finished web |
| I | Captions on / off |
| N | Start a new web |
| Space | Pause |
| H | Help |

## How the spider builds

Following real *Araneus* behaviour:

1. **Bridge line:** it waits on a post for a breeze, lets silk drift until it snags the far post, pulls it taut and reinforces it.
2. **The Y:** it lays a slack line, walks out on it and drops on a dragline to the bottom rail. Reeling in pulls the slack line into a Y, and its centre becomes the hub.
3. **Frame threads:** lower frame lines out to bottom-rail anchors, and lines tying the top frame up to the rail.
4. **Radii:** one at a time, out along a neighbouring radius, across the frame, and back along the new one, alternating sides.
5. **Hub loops**, then a wide **temporary spiral** working outward.
6. **Sticky spiral:** inward, with turnbacks filling the larger lower half. The spider eats the temporary spiral as it goes. A hind leg holds the new thread, and the abdomen dips to glue it to each radius.
7. **Waiting:** it sits head-down at the hub.

Insects fly into the web from in front. The spider bites the prey, then holds and rolls it with its front legs while its hind legs comb silk over it. It cuts the parcel free, carries it to the hub to feed, and drops the husk afterward. Struggling prey can tear threads, and the spider patches the damage with uneven makeshift repairs. Badly damaged webs are eaten and rebuilt.

## Physics

Silk is a graph of nodes and rope constraints that pull but never push. Slack lines sag, the web gives under the spider's weight, and wind moves everything. The spider walks the graph with path-finding, and its legs grip actual threads using inverse kinematics in an alternating gait.

## Code layout

`index.html` is the built, self-contained screensaver. Edit the sources, then rebuild.

- `src/js/`: the simulation and renderer, split by area. The files share one scope and are concatenated in name order:
  - `00-core.js`: config and math helpers
  - `01-silk.js`: the silk graph and its physics
  - `02-motor.js`: what the spider can physically do (walk, reach, lay a line, drop, eat)
  - `03-orb-weaving.js`: the web-building behaviour, built only from those moves
  - `04-prey.js`: insects, damage, repair, and tending the finished web
  - `05-life.js`: the daily loop (build, tend, take down, repeat)
  - `06-scene.js`: the farm, lighting by time of day
  - `07-spider-rig.js`: sprites, leg IK and gait
  - `08-render.js`: per-frame drawing
  - `09-main.js`: main loop and controls

  New behaviours (such as a mode that writes words) go alongside `03`/`04` and reuse the moves in `02`.
- `src/index.html.tpl`: the page shell.
- `assets/`: spider sprites cut from `art/rig-sheet.png`, plus `meta.json` with joint points.

## Building and testing

```
python3 tools/build.py        # rebuild index.html after editing src/
npm install && npx playwright install chromium
npm test                      # runs a full web cycle headlessly and checks each stage
```

`tools/cut_sprites.py` regenerates the sprites from the rig sheet (needs numpy, scipy and opencv). Opening `index.html?debug` exposes the test hooks.
