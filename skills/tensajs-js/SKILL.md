---
name: tensajs-js
description: JavaScript API, physics engine, plugins, and utilities for the Tensa animation library.
---

# Tensa: JavaScript API Reference



## Imports

Tensa exposes two equivalent forms: a default `Tensa` namespace object with every method as `Tensa.xxx` (e.g. `Tensa.animate(...)`, `Tensa.timeline(...)`), and individual named exports for the same functions. Both come from the same module and can be mixed. The named-export form is recommended for application code.

```javascript
// Named export form (recommended)
import {
  animate, animateFrom, sequence, apply, timeline,
  ticker, measure, createTracker, responsive, resizeManager,
  defineEase, parseEase, getEaseNames,
  stop, kill, stopAll, killAll, getAnimations, defaults, getAll,
  fromJSON, validateSchema, registerCallback,
  config, hook, willChange, clearWillChange, Tween, Timeline
} from 'tensajs';

// Namespace form
import Tensa from 'tensajs';
Tensa.animate('.box', { x: 200 });

// Plugins - each from its own sub-path
import { springTo, throwTo, applyGravity, applyMagnetic, applyFollower,
         applySlide, applyPendulum, applyFluidDrag, applyRepulsion,
         applySwarm, applyTether, applyOrbit, applyCollision,
         applySoftBody, applyExplosion, trackVelocity } from 'tensajs/plugins/Dynamics';
import { TextEffects, TextSlicer, blurReveal, glitch, scatter, neonFlicker,
         sineWave, marquee, slotMachine, clipPathReveal, squeezeAndPop,
         flip3D, spotlight, textSwap, matrixRain, textAlongPath,
         elasticSnap, unfold, jigsaw } from 'tensajs/plugins/Text';
import { ScrollSync }      from 'tensajs/plugins/ScrollSync';
import { Interactable }    from 'tensajs/plugins/Interactable';
import { LayoutMorph }     from 'tensajs/plugins/LayoutMorph';
import { PathMorphPlugin as PathMorph } from 'tensajs/plugins/PathMorph';
import { PathTransition }  from 'tensajs/plugins/PathTransition';
```

---

## 1. Targets

All animation functions accept targets as:
- CSS selector string: `'.box'`, `'#hero'`
- DOM Element
- Array or NodeList of elements
- Plain JS object (for tweening numeric properties directly)

---

## 2. Animatable Properties

### Transform shorthands (composited into a single GPU `transform`)
| Property | Unit | Description |
|---|---|---|
| `x`, `y`, `z` | px | Translation |
| `rotation` | deg | Z-axis rotation |
| `rotationX`, `rotationY` | deg | 3D rotation |
| `rotate`, `rotateX`, `rotateY`, `rotateZ` | deg | Aliases |
| `scale`, `scaleX`, `scaleY` | - | Scale (1 = normal) |
| `skewX`, `skewY` | deg | Skew |
| `perspective` | px | Perspective depth |
| `translateX`, `translateY`, `translateZ` | px | Aliases for x/y/z |

Multiple transform shorthands on the same element never conflict: Tensa composes them into one matrix.

### CSS properties
Any valid CSS property: `opacity`, `width`, `height`, `backgroundColor`, `borderRadius`, `filter`, `clipPath`, `boxShadow`, `fontSize`, etc.

### CSS custom properties
```javascript
animate('.el', { '--accent-color': '#ff2d6a', '--opacity': 0 });
```

### Color values
Accepts: `'#rgb'`, `'#rrggbb'`, `'#rrggbbaa'`, `'rgb(r,g,b)'`, `'rgba(r,g,b,a)'`, `'hsl(h,s%,l%)'`, named colors (`'red'`, `'transparent'`). Interpolates in RGB space.

### Relative values
A `+=`, `-=`, or `*=` prefix sets a value relative to the current one:
```javascript
animate('.el', { x: '+=100', scale: '*=1.5', opacity: '-=0.3' });
```

### Array keyframes
An array value auto-distributes across the duration:
```javascript
animate('.el', { y: [0, -50, 0, -25, 0], duration: 1.5 });
```

---

## 3. Core Animation Functions

### `animate(targets, vars)`
Animates from current live state to `vars`.

### `animateFrom(targets, vars)`
Instantly applies `vars` then animates back to current state. `immediateRender: true` by default.

### `sequence(targets, fromVars, toVars)`
Animates from `fromVars` to `toVars`. Config keys (`duration`, `ease`, etc.) go in the **second** `toVars` argument.
```javascript
sequence('.el', { x: 0, opacity: 0 }, { x: 200, opacity: 1, duration: 0.8 });
```

### `apply(targets, vars)`
Instant set with zero duration. Useful for resetting state before an animation.

---

## 4. Tween Config Keys (`vars`)

These reserved keys configure the tween. Everything else is treated as an animatable CSS property.

| Key | Default | Description |
|---|---|---|
| `duration` | `0.5` | Seconds |
| `delay` | `0` | Wait before starting (seconds) |
| `ease` | `'cubic.out'` | Easing string (see below) |
| `repeat` | `0` | Extra cycles. `-1` = infinite |
| `yoyo` | `false` | Reverse direction on alternating cycles |
| `repeatDelay` | `0` | Pause between cycles (seconds) |
| `paused` | `false` | Start paused |
| `timeScale` | `1` | Speed multiplier applied from construction (also settable/gettable afterward via `tw.timeScale`). Clamped to a minimum of `0.001`. |
| `willChange` | `false` | `true` (auto-infers properties), or explicit string like `'transform, opacity'`. Ref-counted lifecycle on GPU compositor layer. |
| `overwrite` | `'auto'` | `'auto'` removes conflicting props on same target. `true` kills all other tweens on same targets |
| `immediateRender` | varies | Force initial render at construction time |
| `startAt` | - | Properties to apply instantly before the tween begins |
| `id` | - | Optional identifier |
| `stagger` | - | Per-target delay offset (number or config object) |
| `onStart` | - | Fires when tween begins. `this` = tween instance. No arguments. |
| `onUpdate` | - | Fires every frame. `this` = tween instance. No arguments. |
| `onComplete` | - | Fires on completion. `this` = tween instance. |
| `onRepeat` | - | Fires at each cycle boundary. |
| `onReverseComplete` | - | Fires when reversed tween reaches t=0. |

A tween's own `timeScale` has no effect once it becomes a child of a `Timeline`. The parent drives children directly, so only the outermost timeline's `timeScale` (and the global `ticker.timeScale`) affect playback speed at that point.

> **Callbacks receive no arguments.** `this` provides access to tween state: `onUpdate: function() { console.log(this.progress); }`

### Easing
Format: `'family.direction'` or `'family.direction(params)'`

Families: `quad`, `cubic`, `quart`, `quint`, `sine`, `expo`, `circ`, `back`, `elastic`, `bounce`

Directions: `.in`, `.out`, `.inOut`

Special: `'none'` / `'linear'`, `'steps(6)'`, `'steps(4, start)'`, `'cubic-bezier(x1,y1,x2,y2)'`

Parameterized: `'back.out(1.7)'`, `'elastic.out(1, 0.3)'`

Power aliases: `power1` = `quad`, `power2` = `cubic`, `power3` = `quart`, `power4` = `quint`

Shorthand without direction defaults to `.out`: `'cubic'` → `'cubic.out'`

### Stagger
```javascript
stagger: 0.05  // simple: 50ms per element

stagger: {
  amount: 0.6,       // total time spread (use OR each, not both)
  each: 0.05,        // per-element delay (takes priority over amount)
  from: 'center',    // 'start' | 'end' | 'center' | 'edges' | 'random' | number index | [col, row]
  grid: [4, 3],      // [columns, rows] for 2D radial stagger
  axis: 'x',         // restrict grid distance to one axis
  ease: 'cubic.in'   // ease applied to the distribution, not the animation
}
```

---

## 5. Tween Playback Methods

All methods return `this` for chaining.

```javascript
const tw = animate('.el', { x: 200, paused: true });

tw.play(fromTime?)      // Start/resume forward
tw.pause(atTime?)       // Halt at current position
tw.resume()             // Unpause without changing direction
tw.reverse(from?)       // Play backward
tw.seek(timeOrLabel)    // Jump to absolute time in seconds or a label string
tw.restart()            // Reset and play from 0
tw.kill()               // Stop and remove from ticker
tw.toggle()             // play() if paused, pause() if playing
tw.forward(0.5)         // Seek forward 0.5s from current position
tw.backward(0.5)        // Seek backward 0.5s from current position
tw.invalidate()         // Re-read live DOM start values on next play

tw.progress             // 0-1 getter/setter
tw.timeScale            // Speed multiplier getter/setter (1 = normal, 2 = double)
tw.duration             // Base duration in seconds (read-only)
tw.totalDuration        // Duration including repeats (read-only, Infinity if repeat=-1)
tw.paused               // Boolean getter
tw.isCompleted          // Boolean getter
tw.isActive             // Boolean getter
```

### `retarget(newVars, resetDuration = true)`
Updates destination values on a live tween without creating a new one. The current rendered position becomes the new starting point, which is essential for mouse-follow and real-time interactions.
```javascript
const tw = animate('.el', { x: 0, duration: 0.4 });
document.addEventListener('mousemove', e => tw.retarget({ x: e.clientX }));
```

---

## 6. Timeline

A sequence container. Children are detached from the global ticker; the timeline drives them directly.

```javascript
const tl = timeline({
  paused: false,
  repeat: 0,
  yoyo: false,
  delay: 0,
  repeatDelay: 0,
  ease: 'none',     // timeline-level ease warps all children's time
  onComplete: () => {}
});
```

### Adding children

```javascript
tl.add(tween, position)              // Add a Tween, Timeline, Function, or Array
tl.animate(targets, vars, position)  // Shorthand: creates and adds an animate tween
tl.animateFrom(targets, vars, pos)
tl.sequence(targets, from, to, pos)
tl.apply(targets, vars, pos)
tl.call(fn, params?, position)       // Add a callback at a specific time
```

### Position syntax
| Value | Meaning |
|---|---|
| omitted / `null` | Append at end of timeline |
| `1.5` | Absolute 1.5 seconds |
| `'+=0.5'` | +0.5s from end of timeline |
| `'-=0.3'` | -0.3s from end of timeline (overlap) |
| `'<'` | Start of last child |
| `'<+=0.5'` | +0.5s from start of last child |
| `'<-=0.3'` | -0.3s from start of last child |
| `'>'` | End of last child |
| `'>+=0.5'` | +0.5s from end of last child |
| `'>-0.2'` | -0.2s from end of last child |
| `'myLabel'` | Absolute time of that label |
| `'myLabel+=0.5'` | +0.5s after a label |
| `'myLabel-=0.3'` | -0.3s before a label |

General rule: an anchor (`<`, `>`, a label name, or nothing) followed by `+=`, `-=`, `+`, or `-` (the `=` is optional), followed by a number of seconds, resolves relative to that anchor. An anchor that does not match `<`, `>`, or a real label name falls back to the end of the timeline instead of throwing an error. Negative results from a `-=` offset are clamped to `0`.

### Management
```javascript
tl.addLabel('phase2', 1.5)     // Register a named timestamp
tl.getLabels()                  // { name: time } object
tl.remove(child)                // Remove a specific child
tl.clear(includeLabels = true)  // Remove all children
```

All `Playable` methods apply: `play()`, `pause()`, `reverse()`, `seek()`, `restart()`, `kill()`, `timeScale`, `progress`, etc.

---

## 7. Global Management

```javascript
stop(target, props?)  // Kill tweens on a target. Pass prop name or array to kill only those props.
kill(target)          // Alias for stop()
stopAll()             // Kill every active tween globally
killAll()             // Alias for stopAll()
getAnimations(target) // Returns active Tween[] for a target
defaults({ duration: 0.3, ease: 'quad.out' }) // Set global defaults
getAll()              // Returns all registered tweens
```

---

## 8. Plugins

### `ScrollSync`
The `scrollSync` tween key requires importing `ScrollSync` first. The import auto-registers the hook.

```javascript
import { ScrollSync } from 'tensajs/plugins/ScrollSync';

// Tween hook (simplest usage)
animate('.box', {
  x: 500,
  scrollSync: {
    trigger: '.section',       // Element that triggers
    start: 'top center',       // "triggerEdge viewportEdge"
    end: 'bottom top',
    scrub: 1,                  // false=play/reverse, true=direct, number=smoothing seconds
    pin: true,                 // Pin trigger during scroll range
    once: false,
    toggleClass: 'is-active',
    markers: true,             // Debug markers
    onEnter() {}, onLeave() {}, onEnterBack() {}, onLeaveBack() {},
    onUpdate() { /* this.progress */ }
  }
});

// Standalone instance
const st = new ScrollSync({
  trigger: '.section',
  animation: myTimeline,       // Pre-built paused timeline
  scrub: 1.5
});
st.refresh(); // Recalculate bounds after DOM changes
st.kill();

ScrollSync.getAll();   // All active instances
ScrollSync.stopAll();  // Kill all
```

### `PathMorph`
Morphs an SVG `<path>` element into another path shape. Used as a tween property.
```javascript
import { PathMorphPlugin as PathMorph } from 'tensajs/plugins/PathMorph';

animate('#circle', {
  morphPath: '#star',        // Selector, Element, or raw 'd' string
  duration: 1.5,
  ease: 'elastic.out(1, 0.3)'
});

// Explicit from/to
animate(myObject, {
  morphPath: { from: 'M 10 10 L 90 90 Z', to: '#star' },
  duration: 1
});
```

### `PathTransition`
Moves an element along an SVG path. Used as a tween property.
```javascript
animate('.spaceship', {
  pathTransition: {
    path: '#flight-path',       // SVG selector, Element, or [{x,y}] array
    autoRotate: true,           // Rotate element to match path tangent
    alignOrigin: [0.5, 0.5],    // Transform origin [0,0]=top-left [0.5,0.5]=center
    start: 0,                   // Normalized start 0-1
    end: 1,                     // Normalized end 0-1
    offsetX: 0,
    offsetY: 0
  },
  duration: 4
});
```

### `Interactable`
```javascript
const drag = new Interactable('.card', {
  type: 'x,y',             // 'x' | 'y' | 'x,y' | 'rotation'
  bounds: '.container',    // CSS selector, Element, or {minX,maxX,minY,maxY}
  edgeResistance: 0.85,    // 0-1 resistance at bounds
  inertia: false,          // Momentum after release
  friction: 0.92,          // Per-frame velocity decay
  snap: 50,                // Grid (number), points ([{x,y}]), or function({x,y})=>{x,y}
  liveSnap: false,         // Snap while dragging (not just on release)
  minimumMovement: 2,      // Pixels before drag activates
  onPress() {},
  onDragStart() {},
  onDrag() {},
  onDragEnd() {},
  onRelease() {},
  onSnap() {}
});
// drag.kill() - removes all listeners
// drag.x / drag.y - current position
Interactable.getAll()      // All active instances
```

### `LayoutMorph`
FLIP animation for layout changes.
```javascript
// 1. Record before DOM change
const state = LayoutMorph.record('.item', {
  props: ['backgroundColor', 'borderRadius']  // extra CSS props to capture
});

// 2. Mutate the DOM
container.classList.toggle('grid-view');

// 3. Animate from recorded state to new layout
const tl = LayoutMorph.play(state, {
  duration: 0.6,
  ease: 'cubic.inOut',
  stagger: 0.04,
  absolute: false,     // Pull elements out of flow during animation
  nested: false        // Subtract parent morph offsets for nested elements
});

// Fit one element's bounds to another
LayoutMorph.fit('.hero', '.thumbnail', { duration: 0.5 });

// Check if element is currently morphing
LayoutMorph.isMorphing('.item');
```

### Inline property plugins
These are tween properties that trigger built-in plugins automatically on import of their module.

```javascript
animate('.el', {
  // Typewriter effect
  typewriter: 'Hello World',
  // or with config:
  typewriter: { value: 'Hello World', delimiter: '', cursor: '|', cursorBlink: true, cursorSpeed: 1 },

  // Scramble text (matrix decode)
  scrambleText: 'ACCESS GRANTED',
  // or:
  scrambleText: { text: 'GRANTED', chars: 'upperCase', revealDelay: 0.3, speed: 1 },
  // chars presets: 'upperCase' | 'lowerCase' | 'numbers' | 'all' | 'hiragana' | custom string

  // Animated number counter
  count: 5000,
  // or:
  count: { from: 0, to: 5000, decimals: 2, prefix: '$', suffix: '%', useCommas: true },

  // Gradient text fill
  textGradient: { angle: 135, stops: ['#ff6b6b 0%', '#ffd93d 100%'] },

  // Highlight/underline reveal
  textHighlight: '#ffd93d',
  // or:
  textHighlight: { color: '#ffd93d', type: 'marker', height: '40%', offset: '85%' },
  // type: 'marker' (default) or 'underline'
});
```

**Note:** The `scrollSync` key also requires importing `ScrollSync` first. `morphPath` requires importing `PathMorph`. `pathTransition` requires importing `PathTransition`. All other inline plugins auto-register from their respective Text plugin import.

---

## 9. TextSlicer

```javascript
import { TextSlicer } from 'tensajs/plugins/Text';

const split = new TextSlicer('.heading', {
  type: 'chars,words',   // any combo of 'chars', 'words', 'lines'
  charsClass: 'ax-char',
  wordsClass: 'ax-word',
  linesClass: 'ax-line',
  aria: true             // preserves accessibility with aria-label
});

split.chars   // Element[]
split.words   // Element[]
split.lines   // Element[]
split.revert() // Restore original innerHTML

// Static factory alias
const split2 = TextSlicer.split('.heading', { type: 'chars' });
```

---

## 10. TextEffects

Each effect takes `(target, config?)` and returns a `Timeline` that plays immediately.

```javascript
import { TextEffects, blurReveal, glitch } from 'tensajs/plugins/Text';

// Namespace
const tl = TextEffects.blurReveal('.title', { stagger: 0.08 });

// Named import (identical)
const tl2 = blurReveal('.title', { stagger: 0.08 });
```

All effects accept standard tween config: `duration`, `ease`, `stagger`, `repeat`, `yoyo`, `paused`, `onComplete`.
All except `marquee`, `spotlight`, `matrixRain`, `textSwap` accept `revertOnComplete: true`.

| Effect | Split unit | Key config |
|---|---|---|
| `blurReveal` | words/chars/lines (`type`) | `blur`, `y` |
| `clipPathReveal` | words/chars/lines (`type`) | `direction` ('right'\|'left'\|'down'\|'up'\|'center'), `fade` |
| `elasticSnap` | chars | `stretchX`, `stretchY`, `y` |
| `flip3D` | chars/words/lines (`type`) | `axis` ('X'\|'Y'), `rotate`, `fade`, `perspective`, `transformOrigin` |
| `glitch` | chars/words/lines (`type`) | `iterations`, `stepDuration`, `intensity` |
| `jigsaw` | chars | `spreadX`, `spreadY`, `rotation`, `scale` |
| `marquee` | - (full innerHTML) | `speed`, `direction` ('left'\|'right') |
| `matrixRain` | - (canvas overlay) | `fontSize`, `chars`, `color`, `fadeAmount`, `duration`, `zIndex` |
| `neonFlicker` | chars/words/lines (`type`) | `color`, `dimOpacity`, `flickers`, `flickerDuration` |
| `scatter` | chars/words/lines (`type`) | `spreadX`, `spreadY`, `rotation`, `scale` |
| `sineWave` | chars/words/lines (`type`) | `amplitude`, `repeat` (-1 default), `yoyo` (true default) |
| `slotMachine` | chars | `reelLength`, `charsPool` |
| `spotlight` | - (full element) | `color`, `darkColor`, `size`, `fadeSize`, `y` |
| `squeezeAndPop` | chars/words/lines (`type`) | `yOffset`, `squashY`, `squashX`, `stretchY`, `stretchX`, `bounceHeight` |
| `textAlongPath` | chars/words/lines (`type`) | `path` (required), `autoRotate`, `charSpacing`, `travel` |
| `textSwap` | - (character slots) | `text` (required), `stagger` |
| `unfold` | lines | `rotateX`, `transformOrigin`, `fade` |

---

## 11. Physics (`Dynamics`)

Physics simulations run indefinitely on the RAF ticker until energy settles. They return `{ kill() }` and do not return a Tween.

All functions write through Tensa's transform cache, so multiple simulations on the same element (e.g., `applyGravity` for Y and `throwTo` for X) compose correctly.

### `throwTo(target, props, config?)`
Inertia/momentum with friction and bounds.
```javascript
const engine = throwTo('.ball', {
  x: { velocity: 800, friction: 0.92, min: 0, max: 500 },
  y: { velocity: -300, friction: 0.92, acceleration: 50 }
}, {
  bounds: '#stage',            // Auto-computes x/y wall limits
  onUpdate: ({ state }) => {},
  onComplete: () => {},
  onWallBounce: (side, impact) => {} // side: 'left'|'right'|'top'|'bottom'
});
engine.kill();
```
Per-prop options: `velocity`, `friction` (0.85 default), `acceleration`, `min`, `max`, `end` (snap-to value on settle).

### `springTo(target, props, config?)`
Hooke's law spring to a target value.
```javascript
const engine = springTo('.modal', {
  x: 200,
  scale: 1.2,
  // or with initial velocity: x: { end: 200, velocity: 100 }
}, {
  stiffness: 200,  // spring tension (higher = faster)
  damping: 15,     // friction (higher = less bounce, <10 oscillates)
  mass: 1
});
// engine.kill() / engine.state
```

### `applyGravity(target, config?)`
```javascript
applyGravity('.ball', {
  gravity: 980,           // px/s² (default 980)
  direction: 'y',         // 'y' (down) or 'x' (right)
  bounce: 0.6,            // energy retention 0-1
  bounds: '#stage',       // auto floor/ceiling
  initialVelocityY: -500, // shoot upward
  onBounce: (side, v) => {}
});
```

### `applyMagnetic(target, config?)`
Springs element toward the pointer on hover.
```javascript
applyMagnetic('.btn', {
  power: 0.4,       // fraction of distance to move toward cursor
  radius: 0,        // activation radius (0 = anywhere in trigger)
  stiffness: 150,
  damping: 15,
  trigger: '.btn',  // hover area (defaults to target)
  onEnter() {}, onLeave() {}
});
```

### `applyFollower(targets, config?)`
Chain of elements trailing a leader via springs.
```javascript
applyFollower('.chain-item', {
  leader: 'pointer',  // 'pointer' or a DOM element
  stiffness: 120,
  damping: 14,
  mass: 1
});
```

### `applyPendulum(target, config?)`
```javascript
applyPendulum('.pendulum', {
  length: 200,          // string length in px (defaults to element height)
  gravity: 980,
  friction: 0.98,       // air resistance per frame (1 = no friction)
  initialAngle: 45,     // degrees
  initialVelocity: 0
});
```

### `applyCollision(targets, config?)`
Circle-circle collisions with wall bounds.
```javascript
const engine = applyCollision('.ball', {
  bounds: '#stage',
  friction: 0.99,
  restitution: 1.0,     // 1 = elastic, 0 = inelastic
  onCollide: (el1, el2, impact) => {},
  onWallBounce: (el, side, impact) => {}
});
engine.setDragged(el, true);        // Freeze one element for dragging
engine.injectVelocity(el, vx, vy);  // Apply impulse
engine.state;  // internal physics state array
```

### Other physics functions (config in dedicated docs)
- `applySlide(target, config)`: inclined plane (`angle`, `gravity`, `friction`, `bounds`, `initialVelocity`)
- `applyFluidDrag(target, config)`: terminal velocity (`drag`, `gravity`, `mass`, `bounce`, `bounds`)
- `applyRepulsion(targets, config)`: scatter from pointer (`source`, `radius`, `strength`, `stiffness`, `damping`)
- `applySwarm(targets, config)`: Boids flocking (`target`, `perceptionRadius`, `maxSpeed`, `maxForce`, `separation`, `alignment`, `cohesion`, `attraction`)
- `applyTether(targets, config)`: elastic cord (`target`, `length`, `stiffness`, `damping`, `gravity`, `airFriction`)
- `applyOrbit(targets, config)`: gravity orbit or rigid rotation (`center`, `radius` for kinematic, `gravity` for Newtonian)
- `applySoftBody(target, config)`: SVG path jiggle (`stiffness`, `damping`, `pullRadius`, `pullForce`)
- `applyExplosion(target, config)`: radial impulse (`force`, `decay`, `gravity`, `radius`, `spin`, `bounds`)
- `trackVelocity(target, propsList)`: returns `{ get(prop), kill() }`

---

## 12. Utilities

### `createTracker(target, prop, config?)`
Optimized setter for high-frequency events. Calls `retarget()` internally, so no new tweens are allocated.
```javascript
const setXY = createTracker('#cursor', ['x', 'y'], { duration: 0.25, ease: 'cubic.out' });
document.addEventListener('mousemove', e => setXY(e.clientX, e.clientY));
```

### `measure(target, prop, unit?)`
Reads live CSS or transform value. Returns a number without a unit, or a string with a unit.
```javascript
measure('.el', 'x')          // 120 (px number)
measure('.el', 'x', 'px')    // '120px'
measure('.el', 'opacity')    // 0.5
```

### `responsive()`
Media-query-scoped animation context. Auto-reverts when query no longer matches.
```javascript
const ctx = responsive();
ctx.add('(min-width: 768px)', (context) => {
  const tw = animate('.hero', { x: 200 });
  context.add(tw);       // register for auto-cleanup
  return () => { /* optional manual cleanup */ };
});
ctx.revert(); // kill all registered animations
```

### `ticker`
```javascript
ticker.timeScale = 0.5   // Global slow motion
ticker.targetFps = 30    // Cap frame rate (0 = unthrottled)
ticker.fps               // Current rolling FPS (getter)
const unsub = ticker.add((time, delta) => { /* ms */ });
unsub();                 // Remove listener
```

### `defineEase(name, fnOrBezier)`
```javascript
defineEase('snap', 'cubic-bezier(0.34, 1.56, 0.64, 1)');
defineEase('custom', t => t * t);
```

### `hook(fn)`
Registers a function called for every new Tween and Timeline at construction time, used by plugins that need to intercept tween creation.
```javascript
hook((playable, config) => {
  if (config.myProp) { /* handle custom config */ }
});
```

### `config(options)`
```javascript
config({ strictMode: true }); // Throw errors instead of console.warn
```

### `version`
```javascript
import { version } from 'tensajs';
console.log(version); // package version string
```

### `willChange(target, value)`
Attaches a reference-counted `will-change` CSS hint on DOM elements.
```javascript
willChange('.card', 'transform'); // Attach GPU layer hint
```

### `clearWillChange(target, value?)`
Releases a reference-counted `will-change` CSS hint on DOM elements.
```javascript
clearWillChange('.card'); // Decrement ref-count and remove when 0 active
```

### `registerCallback(name, fn)`
Registers a named JS function for use in JSON animations.
```javascript
registerCallback('onHeroDone', () => el.classList.add('done'));
```

### `registerAction(name, handler)`
Registers a custom action type for use in JSON `callbacks` arrays.
```javascript
registerAction('playSound', ({ src }) => new Audio(src).play());
```

### `registerTweenParser(type, parserFn)`
Registers a custom tween type for JSON documents.
```javascript
registerTweenParser('physics', (def, sharedConfig) => springTo(def.target, def.props, sharedConfig));
```

### `use(name, plugin)` (alias: `registerPropertyPlugin`)
Registers a custom animatable property. `plugin` needs `prepare(target, prop, fromVal, toVal)` (called once, returns a descriptor) and `render(target, descriptor, progress)` (called every frame with `progress` between 0 and 1). This is how the built-in inline text properties (`typewriter`, `scrambleText`, `count`, `textGradient`, `textHighlight`) are implemented.
```javascript
use('myProp', {
  prepare(target, prop, fromVal, toVal) { return { fromVal, toVal }; },
  render(target, descriptor, t) { /* apply interpolated value at progress t */ }
});

animate('.el', { myProp: 100, duration: 1 }); // now animatable
```

### `registerValidTweenType(type)` / `registerValidAction(name)` / `registerValidEasePattern(pattern)`
Extends the JSON validator to accept custom types without failing validation.

