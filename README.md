# Tensa

[![npm version](https://img.shields.io/npm/v/tensajs.svg)](https://www.npmjs.com/package/tensajs)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/tensajs)](https://bundlephobia.com/package/tensajs)
[![license](https://img.shields.io/npm/l/tensajs.svg)](LICENSE)

Timelines, tweens, text effects, and real physics for the DOM, with zero dependencies.

[Website](https://tensajs.com) · [Docs](https://docs.tensajs.com) · [Playground](https://docs.tensajs.com/playground)

## Install

```bash
npm install tensajs
```

```js
import { animate, timeline } from 'tensajs';

animate('.box', { x: 200, rotate: 360, duration: 1 });
```

Or drop it in with a script tag:

```html
<script src="https://unpkg.com/tensajs/dist/cdn/tensajs.js"></script>
<script>
  Tensa.animate('.box', { x: 200, duration: 1 });
</script>
```

## Why Tensa

Most animation libraries stop at tweens and easing curves. Tensa adds a real physics layer directly in the core - gravity, springs, collisions, soft bodies - so motion can react to itself instead of just following a pre-baked curve.

**Core**
- Tweens, timelines, and JSON-driven playback via `fromJSON()`
- Labels, relative positioning, nesting, repeat/yoyo, and scrubbing

**Physics & dynamics**
- Gravity, collisions, explosions, fluid drag, magnetism
- Orbits, pendulums, repulsion, soft body, swarming, tethers, springs, throw-with-velocity

**Text**
- Blur reveal, flip 3D, elastic snap, glitch, jigsaw, scatter, slot machine
- Typewriter, scramble text, number counters, and more

**Interaction & layout**
- Draggable elements with inertia, bounds, and snapping (`Interactable`)
- Scroll-triggered and scroll-scrubbed animation (`ScrollSync`)
- FLIP-style layout animation and SVG path morphing (`LayoutMorph`, `PathMorph`, `PathTransition`)

## Plugins

Each plugin is a separate import so the core stays small:

```js
import { blurReveal } from 'tensajs/plugins/Text';
import { applyGravity } from 'tensajs/plugins/Dynamics';
```

Full API reference and guides live at [docs.tensajs.com](https://docs.tensajs.com).

## License

MIT
