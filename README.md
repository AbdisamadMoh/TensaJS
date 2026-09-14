# TensaJS

[![npm version](https://img.shields.io/npm/v/tensajs.svg)](https://www.npmjs.com/package/tensajs)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/tensajs)](https://bundlephobia.com/package/tensajs)
[![license](https://img.shields.io/npm/l/tensajs.svg)](LICENSE)

TensaJS is a **JavaScript animation engine built to animate anything JavaScript can access**. Animate DOM elements, CSS properties, SVG, paths, plain JavaScript objects, values, and more using **JavaScript or JSON**. Build everything from simple tweens and timelines to complex physics-based motion, scroll-driven animations, text effects, interactive motion, and much more.

TensaJS combines a powerful animation system with a **built-in physics engine**. Tweens, timelines, and physics work together, so physical motion can be combined directly with traditional animation. Gravity, springs, collisions, soft bodies, velocity, and other dynamic behaviors sit alongside the rest of the animation.

TensaJS provides a broad system for creating and controlling motion, including **tweens, timelines, labels, nesting, staggering, scrubbing, easing, repetition, dragging, inertia, snapping, scroll-driven animation, SVG and path animation, FLIP-style layout animation, text effects, physics, dynamics, and much more**. These capabilities are designed to work together, so complex animations can be built and sequenced without switching between separate animation systems.

[![Website](https://img.shields.io/badge/Website-tensajs.com-1a1a1a?style=for-the-badge)](https://tensajs.com)
[![Docs](https://img.shields.io/badge/Docs-docs.tensajs.com-1a1a1a?style=for-the-badge)](https://docs.tensajs.com)
[![Playground](https://img.shields.io/badge/Playground-try_it_live-ff2a6d?style=for-the-badge)](https://docs.tensajs.com/playground)

---

## Features

### JavaScript or JSON
The JSON system animates the same things the JavaScript API does. Definitions can be validated against a schema in real time, catching mistakes while an animation is still being written.

JSON can also be compiled into real TensaJS code, the same tweens, timelines, and plugin-driven animations the JavaScript API produces. Once compiled, the result can be edited, extended, combined with other animations, or nested into larger timelines like any other animation in the system.

JSON isn't a limited or separate mode. It's another way to write native TensaJS animations.

### Physics & Dynamics
TensaJS supports dynamic behaviors including:

- Gravity
- Springs
- Collisions
- Soft bodies
- Orbits
- Pendulums
- Magnetism
- Velocity-based motion
- Inertia
- Throw interactions
- Slide
- Explosions
- Fluid drag
- Follower motion
- Repulsion
- Swarm behavior
- Tethers

These combine directly with tweens and timelines to build interactions and sequences that would otherwise need a separate physics library.

### Animation
Tools for building and controlling motion:

- Tweens and timelines
- Labels and nested timelines
- Staggering
- Scrubbing
- Easing
- Repetition and yoyo
- Scroll-driven animation
- Dragging, inertia, and snapping
- FLIP-style layout animation
- SVG and path animation

### Text
Built-in text effects include:

- Blur reveals
- Glitch
- Jigsaw
- Scatter
- Typewriter
- Scramble text
- Number counters
- Clip-path reveals
- Elastic snap
- 3D flips
- Marquee
- Matrix rain
- Neon flicker
- Sine wave
- Slot machine
- Spotlight
- Squeeze and pop
- Text along a path
- Text swap
- Unfold
- Text gradients
- Text highlighting

### Plugins
Additional capabilities ship as plugins, keeping the core small:

```js
import { blurReveal } from 'tensajs/plugins/Text';
import { applyGravity } from 'tensajs/plugins/Dynamics';
```

Plugins add animation, text, physics, and interaction features without changing the core API.

---

## Install

```bash
npm install tensajs
```

```js
import { animate, timeline } from 'tensajs';

animate('.box', {
  x: 200,
  rotate: 360,
  duration: 1
});
```

Or use the CDN:

```html
<script src="https://unpkg.com/tensajs/dist/cdn/tensajs.js"></script>

<script>
  Tensa.animate('.box', {
    x: 200,
    duration: 1
  });
</script>
```

TensaJS is **zero-dependency** and designed to give you one animation system for ordinary UI motion, SVG and path animation, complex timelines, text, scrolling, interaction, physics, and dynamically generated animations.

Whether you are writing animations directly in JavaScript, defining them in JSON, combining physics with timelines, animating SVG paths, driving motion from scrolling, or generating and compiling animations dynamically, TensaJS gives you the control to build it all within the same system.

---

## License

MIT
