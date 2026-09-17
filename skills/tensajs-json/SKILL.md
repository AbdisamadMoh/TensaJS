---
name: tensajs-json
description: Complete JSON Engine schema, callback actions, math expressions, and declarative sequencing for the Tensa animation library.
---

# Tensa: JSON Engine Reference

Tensa can describe entire animation sequences as plain JSON.

## Imports

```javascript
import { fromJSON, validateSchema, registerCallback,
         registerAction, registerTweenParser,
         registerValidTweenType, registerValidAction } from 'tensajs';
```

`validateSchema` is the named export. The `Tensa` namespace object also exposes the same function as `Tensa.validateJSON(doc)`.

---

## 1. Core Execution

### `fromJSON(doc, options?)`
Parses a JSON object or string, validates it against the schema, resolves all internal variables/math and custom easings, registers callbacks, and returns a playable Timeline.
```javascript
const tl = fromJSON(myDoc, { paused: true });
tl.play();
```

### `validateSchema(doc)`
Performs a dry-run validation against the JSON payload to ensure structure is correct without instantiating any DOM classes or tweens. Returns `{ valid: boolean, errors: string[] }`.

---

## 2. Complete JSON Document Structure

An Tensa JSON document accepts the following top-level keys. A document must define at least one of: `timeline`, `tweens`, `setup`, or a root-level single tween shorthand (`target` + `props`, or `target` + `keyframes`).

*   **`version`**: (Optional) Must be `"1.0"` if present. Omitting it is valid; including a different value fails validation.
*   **`id`**: (Optional) Name for tooling and external timeline action targeting.
*   **`_note`**: (Optional) Developer note or comment.
*   **`customEasings`**: (Optional) Array of objects (`{ "name": "custom", "cubicBezier": [0.1,0.5,0.2,1] }` or `steps: 5`).
*   **`variables`**: (Optional) Object of reusable constants (`{ "dur": 0.6, "slideY": -40 }`).
*   **`callbacks`**: (Optional) Object of named action sequences.
*   **`setup`**: (Optional) Array of synchronous actions executed before any tweens are parsed.
*   **`defaults`**: (Optional) Global tween defaults applied to everything in the document (`{ "duration": 0.5 }`).
*   **`timeline`**: (Optional) The root timeline object for complex sequencing via `position`.
*   **`tweens`**: (Optional) Array of concurrent tweens (shorthand if no complex timeline sequencing is needed).
*   **`target` + `props`/`keyframes`**: (Optional) The whole document can itself be a single root-level tween instead of using `timeline`/`tweens`, shown in the example below.

```json
{ "target": ".box", "duration": 1, "props": { "x": 200 } }
```

---

## 3. Variables & Math Expressions

Declare constants in `variables` and reference them anywhere in the document with the `$` prefix. 
Tensa supports inline math evaluation (`+`, `-`, `*`, `/`, `()`) against variables.

```json
{
  "variables": { "baseDur": 0.5, "slideY": -40 },
  "defaults": { "duration": "$baseDur" },
  "tweens": [
    { "target": "#hero", "props": { "y": "$slideY * 2" } },
    { "target": "#text", "props": { "y": "($slideY + 10) / 2" }, "duration": "$baseDur + 0.2" }
  ]
}
```

---

## 4. Timelines & Tweens

The `timeline` root allows complex, deeply nested sequencing.
**CRITICAL:** A root timeline must be wrapped in the `"timeline"` key (e.g., `"timeline": { "tweens": [...] }`). The shorthand `"type": "timeline"` at the document root is invalid.

```json
{
  "version": "1.0",
  "timeline": {
    "labels": { "intro": 0, "out": 2 },
    "tweens": [
      {
        "target": ".box",
        "type": "animateFrom",
        "props": { "opacity": 0, "y": 50 },
        "position": "intro+=0.5"
      }
    ],
    "timelines": [
      { 
        "position": "+=0.2", 
        "timeline": { "tweens": [ ... ] } 
      }
    ]
  }
}
```

### Position Syntax
Inside a timeline, `position` controls timing:
- `1.5`: Absolute time (1.5 seconds)
- `"+=0.5"`: 0.5s after the end of the timeline
- `"-=0.5"`: 0.5s before the end of the timeline (overlap)
- `"<"`: Start of the last inserted child
- `"<+=0.5"`: 0.5s after the start of the last inserted child
- `"<-=0.3"`: 0.3s before the start of the last inserted child
- `">"`: End of the last inserted child
- `">+=0.5"`: 0.5s after the end of the last inserted child
- `">-0.2"`: 0.2s before the end of the last inserted child
- `"labelName"`: Absolute time of a named label
- `"labelName+=0.5"`: 0.5s after a named label
- `"labelName-=0.3"`: 0.3s before a named label

General rule: an anchor (`<`, `>`, a label name, or nothing) followed by `+=`, `-=`, `+`, or `-` (the `=` is optional), followed by a number of seconds, resolves relative to that anchor. An anchor that does not match `<`, `>`, or a real label name falls back to the end of the timeline instead of failing validation or throwing an error. Negative results from a `-=` offset are clamped to `0`.

### Timeline object keys
Besides `labels`, `tweens`, `timelines`, and `id`, the `timeline` object itself accepts standard playback config, same names as the JS `timeline()` constructor:

| Key | Default | Description |
|---|---|---|
| `repeat` | `0` | Extra cycles. `-1` = infinite |
| `repeatDelay` | `0` | Pause between cycles (seconds). Works even on a timeline with no `tweens` (e.g. a callback-only loop) |
| `yoyo` | `false` | Reverse direction on alternating cycles |
| `delay` | `0` | Wait before starting (seconds) |
| `timeScale` | `1` | Speed multiplier for the whole timeline and all its children |
| `ease` | `'none'` | Timeline-level ease that warps all children's time |
| `paused` | `false` | Start paused |
| `onStart` / `onUpdate` / `onComplete` / `onRepeat` / `onReverseComplete` | - | Callback name strings, resolved the same way as tween callbacks |

### Tween Properties
*   **`target`**: CSS selector or array of selectors (`".card"`, `["#a", "#b"]`).
*   **`type`**: `"animate"` (default), `"animateFrom"`, `"sequence"`, or `"apply"`.
    - `"sequence"` requires BOTH `fromProps` and `props` fields, unless `keyframes` is also present (keyframes ignore `type` entirely, see below).
*   **`props`**: Destination property values. Supports relative (`"+=50"`, `"*=1.2"`) and array values (`"y": [0, -50, 0]`).
*   **`fromProps`**: Starting values. Used ONLY with `type: "sequence"`.
*   **`timeScale`**: (Optional) Number, default `1`. Speed multiplier for this individual tween. Only has an effect on a root-level single-tween document (`target` + `props`/`keyframes`, no `timeline`/`tweens` wrapper). A tween's `timeScale` inside a `tweens` array or a `timeline.tweens` array is ignored, since the parent timeline drives it directly.
*   **`willChange`**: (Optional) Boolean (`true` to auto-infer) or string (e.g. `"transform"`, `"transform, opacity"`) for GPU compositor layer hint.
*   **`stagger`**: Number or stagger config object. When using object form, `each` takes priority over `amount` if both are set.
*   **`keyframes`**: Splits one tween into multiple sequential segments, each with its own props and ease. The tween's `duration` is the total and each segment's duration is derived from the difference between consecutive `at` values.

```json
{
  "target": ".ball",
  "duration": 2,
  "keyframes": [
    { "at": "0%",   "props": { "x": 0,   "y": 0,   "opacity": 0 } },
    { "at": "30%",  "props": { "x": 100, "y": -80 }, "ease": "cubic.out" },
    { "at": "70%",  "props": { "x": 300, "y": 0   }, "ease": "bounce.out" },
    { "at": "100%", "props": { "x": 400, "opacity": 1 }, "ease": "cubic.in" }
  ]
}
```

`at` accepts a percentage string (`"50%"`) or a normalized number (`0.5`). The `ease` on each keyframe controls the curve into that waypoint from the previous one. The first keyframe at `"0%"` sets starting values; if omitted, the element's live state is used as the start. When `keyframes` is present, `props` and `type` are ignored.

*   **`setup`**: Array/object of synchronous actions run on this tween before it parses.
*   **`_note`**: Optional developer note or comment.

---

## 5. The Callback Engine (Actions)

Callbacks sequence DOM changes, external events, and animations entirely in JSON without writing JavaScript. They are attached via standard tween lifecycle hooks (`onStart`, `onUpdate`, `onComplete`, `onRepeat`, `onReverseComplete`).
```json
{
  "callbacks": {
    "prepState": [ { "action": "addClass", "target": "#hero", "class": "animating" } ],
    "trackProgress": [ { "action": "dispatch", "event": "hero:progress" } ],
    "onHeroDone": [
      { "action": "removeClass", "target": "#hero", "class": "animating" },
      { "action": "wait", "seconds": 0.5 },
      { "action": "dispatch", "event": "hero:complete" }
    ],
    "onLoop": [ { "action": "dispatch", "event": "hero:loop" } ],
    "onRewind": [ { "action": "dispatch", "event": "hero:rewind" } ]
  },
  "tweens": [
    { 
      "target": "#hero", 
      "props": { "opacity": 1 }, 
      "repeat": 2,
      "yoyo": true,
      "onStart": "prepState",
      "onUpdate": "trackProgress",
      "onComplete": "onHeroDone",
      "onRepeat": "onLoop",
      "onReverseComplete": "onRewind"
    }
  ]
}
```

### Complete List of Available Action Types

**DOM Manipulation:**
*   `addClass` (Requires `target`, `class`)
*   `removeClass` (Requires `target`, `class`)
*   `toggleClass` (Requires `target`, `class`)
*   `setAttribute` (Requires `target`, `attr`, `value`)
*   `removeAttribute` (Requires `target`, `attr`)
*   `setStyle` (Requires `target`, `style` object)
*   `setText` (Requires `target`, `text`)

**Animation Triggers:**
*   `animate`, `animateFrom` (Requires `target`, `props`, `duration`, `delay`, `ease`)
*   `apply` (Requires `target`, `props`)
*   `stop` (Requires `target`)

**Timeline Control:**
*   `play`, `pause`, `restart` (Requires `id` of registered timeline)
*   `seek` (Requires `id`, `time`)

**Utilities:**
*   `dispatch` (Requires `event` name, optional `detail` object) - Fires a `window.CustomEvent`.
*   `navigate` (Requires `url`) - Redirects `window.location.href`.
*   `wait` (Requires `seconds`) - Pauses the sequential execution of the callback array via Promises.

**Not built-in - requires manual registration:**
*   `splitText` is not included in the default action set. Using it requires calling `registerAction('splitText', handler)` and `registerValidAction('splitText')` before `fromJSON()` runs; otherwise it fails with an "Unknown action" error. The JS skill doc's `TextSlicer` section has the handler implementation.

### Custom JavaScript Functions
Custom JS logic requires registering a function in the application code before parsing the JSON:

```javascript
registerCallback('trackEvent', () => { analytics.track('animation-complete'); });
```
```json
{ "onComplete": "trackEvent" }
```
*(Alternatively, for `<script>` globals, the `"window."` prefix in the JSON handles it: `"onComplete": "window.myGlobalHandler"`.)*
