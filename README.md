# Tensa

A lightweight animation engine for the DOM - timelines, tweens, text effects, and physics-based motion, with zero dependencies.

## Install

```bash
npm install tensajs
```

```js
import { animate, timeline } from 'tensajs';

animate('.box', { x: 200, rotate: 360, duration: 1 });
```

Or via CDN:

```html
<script src="https://unpkg.com/tensajs/dist/cdn/tensajs.js"></script>
<script>
  Tensa.animate('.box', { x: 200, duration: 1 });
</script>
```

## Features

- **Tweens & Timelines** - `animate()`, `animateFrom()`, `sequence()`, `apply()`, and a full `timeline()` sequencer with labels, relative positioning, nesting, repeat/yoyo, and scrubbing.
- **JSON-driven animation** - describe tweens and timelines as plain JSON and run them with `fromJSON()`.
- **Text effects** - split text into chars/words/lines and animate it: blur reveal, flip 3D, elastic snap, glitch, jigsaw, scatter, slot machine, typewriter, scramble, number counters, and more.
- **Physics & dynamics** - gravity, collisions, explosions, fluid drag, magnetism, orbits, pendulums, repulsion, soft body, swarming, tethers, springs, and throw-with-velocity.
- **Interactable** - draggable elements with inertia, bounds, and snapping.
- **ScrollSync** - scroll-triggered and scroll-scrubbed animation.
- **LayoutMorph, PathMorph, PathTransition** - FLIP-style layout animation and SVG path morphing/motion.

## Plugins

Plugins are imported separately to keep the core small:

```js
import { blurReveal } from 'tensajs/plugins/Text';
import { applyGravity } from 'tensajs/plugins/Dynamics';
```

## License

MIT
