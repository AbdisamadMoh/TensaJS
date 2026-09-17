---
name: tensajs-modules
description: Correct npm/ESM import paths and CDN (browser-global) usage for the Tensa animation library.
---

# Tensa: Module Import Paths and CDN Usage

All exports are ES modules. The package name is `tensajs`. Sub-path exports follow the `tensajs/plugins/*` pattern defined in `package.json`.

---

## `tensajs` (main entry)

```javascript
import {
  // Core animation
  animate, animateFrom, sequence, apply, timeline,

  // Playback / management
  stop, kill,           // kill is alias for stop
  stopAll, killAll,     // killAll is alias for stopAll
  getAnimations,        // active tweens for a target
  defaults,             // set global tween defaults
  getAll,               // all registered tweens

  // Ticker
  ticker,
  loop,                 // alias for ticker

  // Utilities
  measure,
  createTracker,
  responsive,
  resizeManager,
  resolveTargets,
  willChange,            // manually attach a ref-counted will-change hint
  clearWillChange,       // release a ref-counted will-change hint
  version,               // package version string, e.g. '1.0.0'

  // Easing
  parseEase, defineEase, getEaseNames,

  // Config
  config,

  // Plugin system
  hook,                  // register tween init hook
  use,                    // register a custom animatable property (alias for registerPropertyPlugin)
  registerPropertyPlugin, // same function as `use`

  // JSON engine
  fromJSON, validateSchema, registerCallback,
  registerAction,        // register a custom action type for JSON callbacks
  registerTweenParser,   // register a custom tween type for JSON documents

  // JSON validator extension
  registerValidTweenType, registerValidAction, registerValidEasePattern,

  // Classes (for instanceof checks or direct instantiation)
  Tween, Timeline, tweenManager
} from 'tensajs';
```

---

## `tensajs/plugins/Dynamics`

```javascript
import {
  throwTo,
  springTo,
  applyGravity,
  applySlide,
  applyMagnetic,
  applyPendulum,
  applyFollower,
  applyFluidDrag,
  applyRepulsion,
  applySwarm,
  applyTether,
  applyOrbit,
  applyCollision,
  applySoftBody,
  applyExplosion,
  trackVelocity,

  Dynamics   // namespace object with the same functions; named imports are preferred
} from 'tensajs/plugins/Dynamics';
```

---

## `tensajs/plugins/Text`

```javascript
import {
  // TextSlicer
  TextSlicer,

  // Inline property plugins (auto-register on import)
  ScrambleTextPlugin,
  NumberCounterPlugin,
  TextGradientPlugin,
  TextHighlightPlugin,
  TypewriterPlugin,

  // TextEffects namespace
  TextEffects,

  // Individual effect functions (same as TextEffects.xxx)
  blurReveal, clipPathReveal, elasticSnap, flip3D, glitch,
  jigsaw, marquee, matrixRain, neonFlicker, scatter, sineWave,
  slotMachine, spotlight, squeezeAndPop, textAlongPath, textSwap, unfold
} from 'tensajs/plugins/Text';
```

---

## `tensajs/plugins/ScrollSync`

```javascript
import { ScrollSync } from 'tensajs/plugins/ScrollSync';
// Importing this also registers the scrollSync tween hook,
// enabling the scrollSync: {} property on any animate() call.
```

---

## `tensajs/plugins/Interactable`

```javascript
import { Interactable } from 'tensajs/plugins/Interactable';
```

---

## `tensajs/plugins/LayoutMorph`

```javascript
import { LayoutMorph } from 'tensajs/plugins/LayoutMorph';
```

---

## `tensajs/plugins/PathMorph`

```javascript
import { PathMorphPlugin as PathMorph } from 'tensajs/plugins/PathMorph';
// Importing this registers the morphPath: property plugin on animate().
```

---

## `tensajs/plugins/PathTransition`

```javascript
import { PathTransition, PathTransitionPlugin } from 'tensajs/plugins/PathTransition';
// Importing this registers the pathTransition: property plugin on animate().
```

---

## CDN usage (no bundler, no npm install)

The package ships a separate pre-built browser-global (IIFE) distribution alongside the ESM/CJS one, at `dist/cdn/`. This is what `<script src>` tags on `unpkg`/`jsdelivr` actually serve. It is not the same build as the npm/ESM entry, though the API surface is identical.

```html
<!-- Core - always required first, defines window.Tensa -->
<script src="https://unpkg.com/tensajs/dist/cdn/tensajs.js"></script>

<!-- Plugins - each is a separate opt-in file, loaded after the core script -->
<script src="https://unpkg.com/tensajs/dist/cdn/plugins/interactable.js"></script>
<script src="https://unpkg.com/tensajs/dist/cdn/plugins/dynamics.js"></script>
<script src="https://unpkg.com/tensajs/dist/cdn/plugins/text.js"></script>
<script src="https://unpkg.com/tensajs/dist/cdn/plugins/layoutmorph.js"></script>
<script src="https://unpkg.com/tensajs/dist/cdn/plugins/pathmorph.js"></script>
<script src="https://unpkg.com/tensajs/dist/cdn/plugins/pathtransition.js"></script>
<script src="https://unpkg.com/tensajs/dist/cdn/plugins/scrollsync.js"></script>


<script>
  // Core: every named export is a direct property on the global.
  Tensa.animate('.box', { x: 200, duration: 1 });
  Tensa.timeline({ repeat: -1 });

  // Interactable / LayoutMorph / PathTransition / ScrollSync: assigned directly
  // as the global itself (no extra nesting) - same shape as the ESM class/object.
  Tensa.Interactable.create('.box', { inertia: true });
  new Tensa.Interactable('.box', { inertia: true }); // equivalent

  // Dynamics / Text: multiple named exports, so they land under a namespace object.
  Tensa.Dynamics.throwTo('.ball', { x: { velocity: 800 } });
  Tensa.Text.glitch('.title');

  // PathMorph is the one irregular case: it's exposed as BOTH
  // Tensa.PathMorph.PathMorph and Tensa.PathMorph.PathMorphPlugin (same object).
  // Loading pathmorph.js also self-registers the morphPath: property, so it
  // works directly inside Tensa.animate() without touching the namespace object.
  Tensa.animate('#circle', { morphPath: '#star', duration: 1 });
</script>
```

Per-plugin CDN files map 1:1 to the plugin name in lowercase (`dist/cdn/plugins/<name>.js`, e.g. `Interactable` → `interactable.js`, `LayoutMorph` → `layoutmorph.js`). `Dynamics` also ships granular single-function sub-bundles under `dist/cdn/plugins/dynamics/*.js` (e.g. `dist/cdn/plugins/dynamics/applygravity.js`) for cases where loading the full combined `dynamics.js` isn't wanted.

---

## Notes

- `validateSchema` is the named export. The `Tensa` namespace object also exposes the same function as `Tensa.validateJSON(doc)`.

