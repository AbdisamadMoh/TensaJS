# Tensa

[![npm version](https://img.shields.io/npm/v/tensajs.svg)](https://www.npmjs.com/package/tensajs)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/tensajs)](https://bundlephobia.com/package/tensajs)
[![license](https://img.shields.io/npm/l/tensajs.svg)](LICENSE)

A JavaScript animation engine with a real physics layer built in - tweens, timelines, text effects, and zero dependencies.

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

Tensa includes a physics layer - gravity, springs, collisions, soft bodies - built into the same timeline and tween system as everything else.

**Core**
- Tweens, timelines, and JSON-driven playback
- Labels, nesting, stagger, and scrubbing

**Physics & dynamics**
- Gravity, springs, collisions, and soft bodies
- Orbits, pendulums, magnetism, and throw-with-velocity

**Text**
- Blur reveal, glitch, jigsaw, and scatter
- Typewriter, scramble text, and number counters

**Interaction & layout**
- Draggable elements with inertia and snapping
- Scroll-driven animation and FLIP-style layout morphing

## Plugins

Each plugin is a separate import so the core stays small:

```js
import { blurReveal } from 'tensajs/plugins/Text';
import { applyGravity } from 'tensajs/plugins/Dynamics';
```

Full API reference and guides live at [docs.tensajs.com](https://docs.tensajs.com).

## License

MIT
