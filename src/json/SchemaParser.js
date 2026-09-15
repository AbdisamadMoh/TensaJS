/**
 * Tensa SchemaParser - Parse an Tensa JSON document into a live Timeline/Tween graph
 * 
 * Supports the full schema:
 * - Nested timelines
 * - Labels and position expressions
 * - Stagger
 * - All easing types
 * - Keyframes
 * - customEasings  — inline named easing definitions (cubicBezier, steps, alias)
 * - variables      — $varName substitution throughout the document
 * - callbacks      — inline action sequences (no external JS required)
 * - fromTo props split
 */

import { Timeline } from '../core/Timeline.js';
import { Tween } from '../core/Tween.js';
import { tweenManager } from '../core/TweenManager.js';
import { defineEase, parseEase } from '../core/Easing.js';
import { validateSchema } from './SchemaValidator.js';

// Registry for named callbacks registered externally via registerCallback()
const callbackRegistry = {};

/**
 * Register a named callback function for use in JSON animations.
 * @param {string} name
 * @param {Function} fn
 */
export function registerCallback(name, fn) {
  if (callbackRegistry[name]) {
    console.warn(`[Tensa] Callback "${name}" is being overwritten by a new registration.`);
  }
  callbackRegistry[name] = fn;
}

// ─── Variable resolution ─────────────────────────────────────────────────────

/**
 * Resolve $varName references in any value (string, number, object, array).
 * Numbers and booleans pass through unchanged.
 */
function resolveVars(value, vars) {
  if (!vars) return value;
  if (typeof value === 'string') {
    // Exact match: "$varName" → direct substitution (preserves original type)
    if (/^\$[A-Za-z_]\w*$/.test(value)) {
      const key = value.slice(1);
      return key in vars ? vars[key] : value;
    }
    // Expression: any string containing "$varName" tokens
    // e.g. "-$slideY", "$dur+0.2", "$w*2-10"
    if (value.includes('$')) {
      const substituted = value.replace(/\$([A-Za-z_]\w*)/g, (_, name) =>
        name in vars ? vars[name] : `$${name}`
      );
      if (substituted.includes('$')) return substituted; // unresolved var — leave as-is
      const result = evalArithmetic(substituted);
      return result !== null ? result : substituted;
    }
  }
  if (Array.isArray(value)) return value.map(v => resolveVars(v, vars));
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveVars(v, vars);
    return out;
  }
  return value;
}

/**
 * Minimal safe arithmetic evaluator.
 * Accepts only numbers, +  -  *  /  ( )  and decimal points.
 * No eval / Function — pure recursive descent.
 * Returns the numeric result, or null if the expression is not valid arithmetic.
 */
function evalArithmetic(expr) {
  const str = expr.replace(/\s/g, '');
  // Quick sanity check — reject anything that isn't pure arithmetic
  if (!/^[0-9.()+\-*/]+$/.test(str)) return null;
  let pos = 0;

  function peek() { return str[pos]; }

  function parseExpr() {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = str[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = str[pos++];
      const right = parseFactor();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseFactor() {
    if (peek() === '-') { pos++; return -parseFactor(); }
    if (peek() === '+') { pos++; return parseFactor(); }
    if (peek() === '(') {
      pos++; // consume '('
      const val = parseExpr();
      if (peek() === ')') pos++; // consume ')'
      return val;
    }
    let numStr = '';
    while (pos < str.length && (str[pos] === '.' || (str[pos] >= '0' && str[pos] <= '9'))) {
      numStr += str[pos++];
    }
    return numStr ? parseFloat(numStr) : NaN;
  }

  try {
    const result = parseExpr();
    return pos === str.length ? result : null; // reject if not fully consumed
  } catch {
    return null;
  }
}

// ─── Inline callback (action sequence) executor ──────────────────────────────

const ACTION_HANDLERS = {
  addClass:        ({ target, class: cls }) => document.querySelectorAll(target).forEach(el => el.classList.add(cls)),
  removeClass:     ({ target, class: cls }) => document.querySelectorAll(target).forEach(el => el.classList.remove(cls)),
  toggleClass:     ({ target, class: cls }) => document.querySelectorAll(target).forEach(el => el.classList.toggle(cls)),
  setAttribute:    ({ target, attr, value }) => document.querySelectorAll(target).forEach(el => el.setAttribute(attr, value)),
  removeAttribute: ({ target, attr }) => document.querySelectorAll(target).forEach(el => el.removeAttribute(attr)),
  setStyle:        ({ target, style }) => document.querySelectorAll(target).forEach(el => Object.assign(el.style, style)),
  setText:         ({ target, text }) => document.querySelectorAll(target).forEach(el => { el.textContent = text; }),
  animate:         ({ target, props = {}, duration, delay, ease }) =>
                     Tween.animate(target, { ...props, duration, delay, ease }),
  animateFrom:     ({ target, props = {}, duration, delay, ease }) =>
                     Tween.animateFrom(target, { ...props, duration, delay, ease }),
  apply:           ({ target, props = {} }) => Tween.apply(target, props),
  stop:            ({ target }) => tweenManager.stop(target ? Array.from(document.querySelectorAll(target)) : null),
  play:            ({ id, from }) => { const tl = _timelineRegistry.get(id); tl?.play(from); },
  pause:           ({ id, atTime }) => { const tl = _timelineRegistry.get(id); tl?.pause(atTime); },
  seek:            ({ id, time }) => { const tl = _timelineRegistry.get(id); tl?.seek(time); },
  restart:         ({ id }) => { const tl = _timelineRegistry.get(id); tl?.restart(); },
  dispatch:        ({ event, detail }) => window.dispatchEvent(new CustomEvent(event, { detail })),
  navigate:        ({ url }) => { window.location.href = url; },
  wait:            ({ seconds }) => new Promise(r => setTimeout(r, (seconds ?? 0) * 1000)),
};

/**
 * Register a custom action handler for use in JSON callbacks.
 * @param {string} name - The action name.
 * @param {Function} handler - The handler function receiving the action definition.
 */
export function registerAction(name, handler) {
  if (ACTION_HANDLERS[name]) {
    console.warn(`[Tensa] Action "${name}" is being overwritten by a new registration.`);
  }
  ACTION_HANDLERS[name] = handler;
}

// Registry of custom tween parsers
const TWEEN_PARSERS = {};

/**
 * Register a custom tween parser for a specific tween type.
 * @param {string} type - The tween type.
 * @param {Function} parserFn - The function returning a tween or timeline. Receives (def, sharedConfig).
 */
export function registerTweenParser(type, parserFn) {
  if (TWEEN_PARSERS[type]) {
    console.warn(`[Tensa] Tween type "${type}" is being overwritten by a new registration.`);
  }
  TWEEN_PARSERS[type] = parserFn;
}

// Registry of timelines by id — populated during parsing for play/pause/seek actions
const _timelineRegistry = new Map();

/**
 * Build a real function from an action sequence array.
 * Actions run sequentially; if an action returns a Promise (wait), it awaits it.
 */
function buildActionCallback(sequence) {
  return async function () {
    for (const action of sequence) {
      const handler = ACTION_HANDLERS[action.action];
      if (!handler) {
        console.warn(`[Tensa] Unknown action: "${action.action}"`);
        continue;
      }
      const result = handler(action);
      if (result instanceof Promise) await result;
    }
  };
}

// ─── Callback resolution ─────────────────────────────────────────────────────

function resolveCallback(nameOrArray, inlineCallbacks) {
  if (!nameOrArray) return null;
  if (typeof nameOrArray === 'function') return nameOrArray;
  if (Array.isArray(nameOrArray)) return buildActionCallback(nameOrArray);

  const name = nameOrArray;

  // Explicit window lookup: "window.myHandler" → window["myHandler"]
  if (typeof name === 'string' && name.startsWith('window.')) {
    const globalName = name.slice(7);
    const fn = typeof window !== 'undefined' ? window[globalName] : undefined;
    if (typeof fn === 'function') return fn;
    console.warn(`[Tensa] window["${globalName}"] is not a function.`);
    return null;
  }

  // Inline callbacks defined in the document take precedence
  if (inlineCallbacks && inlineCallbacks[name]) {
    return buildActionCallback(inlineCallbacks[name]);
  }

  // Fall back to externally registered callbacks
  const fn = callbackRegistry[name];
  if (!fn) {
    console.warn(`[Tensa] Callback "${name}" is not registered. Use Tensa.registerCallback() or define it in "callbacks".`);
    return null;
  }
  return fn;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Parse an Tensa JSON document and return a live Timeline (or Tween array).
 * 
 * @param {Object|string} doc - Tensa JSON document (object or JSON string)
 * @param {Object} [options]
 * @param {boolean} [options.validate=true] - run schema validation before parsing
 * @param {boolean} [options.paused] - override paused state
 * @returns {Timeline}
 */
export function fromJSON(doc, options = {}) {
  // Parse string input
  if (typeof doc === 'string') {
    try { doc = JSON.parse(doc); }
    catch (e) { throw new Error(`[Tensa] Invalid JSON: ${e.message}`); }
  }

  // 1. Register custom easings first — they must exist before validation and parsing
  if (Array.isArray(doc.customEasings)) {
    for (const entry of doc.customEasings) {
      if (!entry.name) continue;
      if (entry.cubicBezier) {
        const [x1, y1, x2, y2] = entry.cubicBezier;
        defineEase(entry.name, `cubic-bezier(${x1},${y1},${x2},${y2})`);
      } else if (entry.steps) {
        const [count, direction = 'end'] = entry.steps;
        defineEase(entry.name, `steps(${count},${direction})`);
      } else if (entry.from) {
        defineEase(entry.name, entry.from);
      }
    }
  }

  // 2. Build variable map
  const vars = doc.variables ?? null;

  // 3. Resolve variables in the entire document (shallow clone to avoid mutation)
  const resolved = vars ? resolveVars(doc, vars) : doc;

  // 4. Document-scoped tween defaults (merged per-tween below, never touches the
  // global tweenManager singleton so one document can't leak defaults into the rest of the page)
  const docDefaults = resolved.defaults ?? {};

  // 5. Validate (uses the resolved doc; custom ease names are already registered)
  const shouldValidate = options.validate !== false;
  if (shouldValidate) {
    const { valid, errors } = validateSchema(resolved);
    if (!valid) {
      throw new Error(`[Tensa] Schema validation failed:\n${errors.map(e => `  • ${e}`).join('\n')}`);
    }
  }

  // 5.5 Run synchronous setup actions (e.g. splitText, setStyle) before resolving targets
  if (resolved.setup) {
    const setupSeq = Array.isArray(resolved.setup) ? resolved.setup : [resolved.setup];
    for (const action of setupSeq) {
      const handler = ACTION_HANDLERS[action.action];
      if (handler) handler(action);
      else console.warn(`[Tensa] Unknown setup action: "${action.action}"`);
    }
  }

  // 6. Collect inline callbacks
  const inlineCallbacks = resolved.callbacks ?? null;

  // 7. Build timeline or flat tween list
  _timelineRegistry.clear();
  let root;

  if (resolved.timeline) {
    root = parseTimeline(resolved.timeline, { paused: options.paused }, inlineCallbacks, docDefaults);
  } else if (resolved.tweens) {
    root = new Timeline({ paused: options.paused ?? false });
    resolved.tweens.forEach(tweenDef => {
      const tween = parseTween(tweenDef, inlineCallbacks, docDefaults);
      root.add(tween, tweenDef.position);
    });
  } else if (resolved.target && (resolved.props || resolved.keyframes)) {
    resolved.paused = options.paused ?? resolved.paused;
    root = parseTween(resolved, inlineCallbacks, docDefaults);
  } else {
    // setup-only document — actions already ran above, return an inert timeline
    root = new Timeline({ paused: true });
  }

  return root;
}

/**
 * Parse a timeline definition.
 */
function parseTimeline(def, overrides = {}, inlineCallbacks, docDefaults = {}) {
  const tl = new Timeline({
    paused:       overrides.paused ?? def.paused ?? false,
    repeat:       def.repeat ?? 0,
    repeatDelay:  def.repeatDelay ?? 0,
    yoyo:         def.yoyo ?? false,
    delay:        def.delay ?? 0,
    ease:         def.ease ?? 'none',
    id:           def.id,
    timeScale:    def.timeScale ?? 1,
    onStart:            resolveCallback(def.onStart, inlineCallbacks),
    onUpdate:           resolveCallback(def.onUpdate, inlineCallbacks),
    onComplete:         resolveCallback(def.onComplete, inlineCallbacks),
    onRepeat:           resolveCallback(def.onRepeat, inlineCallbacks),
    onReverseComplete:  resolveCallback(def.onReverseComplete, inlineCallbacks),
  });

  if (def.id) _timelineRegistry.set(def.id, tl);

  // Add labels
  if (def.labels) {
    for (const [name, time] of Object.entries(def.labels)) {
      tl.addLabel(name, time);
    }
  }

  // Add child tweens
  if (Array.isArray(def.tweens)) {
    for (const tweenDef of def.tweens) {
      const tween = parseTween(tweenDef, inlineCallbacks, docDefaults);
      tl.add(tween, tweenDef.position);
    }
  }

  // Add nested timelines
  if (Array.isArray(def.timelines)) {
    for (const entry of def.timelines) {
      const nestedTl = parseTimeline(entry.timeline, { paused: true }, inlineCallbacks, docDefaults);
      tl.add(nestedTl, entry.position);
    }
  }

  return tl;
}

/**
 * Parse a tween definition.
 */
function parseTween(def, inlineCallbacks, docDefaults = {}) {
  const type = def.type ?? 'animate';

  // Run generic synchronous setup actions for this specific tween (e.g. splitText)
  if (def.setup) {
    const setupSeq = Array.isArray(def.setup) ? def.setup : [def.setup];
    for (const action of setupSeq) {
      const handler = ACTION_HANDLERS[action.action];
      if (handler) {
        // Automatically inject the tween's target if the action doesn't specify one
        if (!action.target) action.target = def.target;
        const result = handler(action);
        if (typeof result === 'string' || Array.isArray(result)) {
          def.target = result;
        }
      } else {
        console.warn(`[Tensa] Unknown setup action: "${action.action}"`);
      }
    }
  }

  const sharedConfig = {
    duration:    def.duration ?? docDefaults.duration,
    delay:       def.delay ?? 0,
    ease:        def.ease ?? docDefaults.ease,
    repeat:      def.repeat ?? docDefaults.repeat ?? 0,
    repeatDelay: def.repeatDelay ?? docDefaults.repeatDelay ?? 0,
    yoyo:        def.yoyo ?? docDefaults.yoyo ?? false,
    paused:      def.paused ?? false,
    id:          def.id,
    stagger:     def.stagger,
    overwrite:   def.overwrite ?? docDefaults.overwrite ?? 'auto',
    willChange:  def.willChange ?? docDefaults.willChange,
    onStart:           resolveCallback(def.onStart ?? (inlineCallbacks?.onStart ? 'onStart' : null), inlineCallbacks),
    onUpdate:          resolveCallback(def.onUpdate ?? (inlineCallbacks?.onUpdate ? 'onUpdate' : null), inlineCallbacks),
    onComplete:        resolveCallback(def.onComplete ?? (inlineCallbacks?.onComplete ? 'onComplete' : null), inlineCallbacks),
    onRepeat:          resolveCallback(def.onRepeat ?? (inlineCallbacks?.onRepeat ? 'onRepeat' : null), inlineCallbacks),
    onReverseComplete: resolveCallback(def.onReverseComplete ?? (inlineCallbacks?.onReverseComplete ? 'onReverseComplete' : null), inlineCallbacks),
  };

  if (def.keyframes) {
    return parseKeyframeTween(def, sharedConfig);
  }

  switch (type) {
    case 'animate': {
      const toVars = { ...sharedConfig, ...(def.props || {}) };
      return Tween.animate(def.target, toVars);
    }
    case 'animateFrom': {
      const fromVars = { ...sharedConfig, ...(def.props || def.fromProps || {}) };
      return Tween.animateFrom(def.target, fromVars);
    }
    case 'sequence': {
      const fromVars = def.fromProps || {};
      const toVars   = { ...sharedConfig, ...(def.props || {}) };
      return Tween.sequence(def.target, fromVars, toVars);
    }
    case 'apply': {
      const vars = { ...sharedConfig, ...(def.props || {}) };
      return Tween.apply(def.target, vars);
    }
    default:
      if (TWEEN_PARSERS[type]) {
        return TWEEN_PARSERS[type](def, sharedConfig);
      }
      console.warn(`[Tensa] Unknown tween type: "${type}", defaulting to "animate".`);
      return Tween.animate(def.target, { ...sharedConfig, ...(def.props || {}) });
  }
}

/**
 * Parse a keyframe tween - creates a timeline with individual tweens per keyframe segment.
 */
function parseKeyframeTween(def, sharedConfig) {
  const keyframes = [...def.keyframes].sort((a, b) => {
    const atA = parseKeyframeAt(a.at);
    const atB = parseKeyframeAt(b.at);
    return atA - atB;
  });

  const totalDuration = sharedConfig.duration ?? 1;
  
  const tl = new Timeline({ paused: sharedConfig.paused ?? false });

  let prevAt = 0;
  let prevProps = {};

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const at = parseKeyframeAt(kf.at);
    const segDuration = (at - prevAt) * totalDuration;

    if (segDuration > 0 && i > 0) {
      const tween = Tween.sequence(def.target, prevProps, {
        ...sharedConfig,
        ...kf.props,
        duration: segDuration,
        ease: kf.ease ?? sharedConfig.ease ?? 'cubic.out',
        paused: true,
        // Each segment is driven exclusively by the parent timeline's scrub();
        // without this, a paused "sequence" tween auto-renders its "from" state
        // the instant it's constructed, which stomps over earlier segments still
        // sitting on the DOM before playback even starts.
        immediateRender: false,
      });
      tl.add(tween, prevAt * totalDuration);
    }

    prevAt = at;
    prevProps = { ...kf.props };
  }

  return tl;
}

function parseKeyframeAt(at) {
  if (typeof at === 'number') return at;
  if (typeof at === 'string' && at.endsWith('%')) {
    return parseFloat(at) / 100;
  }
  return parseFloat(at) || 0;
}

export { parseTimeline, parseTween, ACTION_HANDLERS, TWEEN_PARSERS };
export default fromJSON;
