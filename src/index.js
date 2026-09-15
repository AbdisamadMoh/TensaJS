

// ─────────────────────────────────────────────────────────────────────────────
// Core
// ─────────────────────────────────────────────────────────────────────────────
import { Tween }            from './core/Tween.js';
import { Timeline }         from './core/Timeline.js';
import { tweenManager }     from './core/TweenManager.js';
import ticker               from './core/Ticker.js';
import { parseEase, defineEase, getEaseNames } from './core/Easing.js';
import { measure }          from './core/Inspector.js';
import { createTracker }    from './core/Tracker.js';
import { createResponsive } from './core/Responsive.js';
import { resizeManager }    from './core/ResizeManager.js';
import { resolveTargets, resolveTarget, getOwnerWindow, getOwnerDocument, isElementLike, isNodeListLike, isShadowRootLike, isWindowLike } from './core/TargetResolver.js';
import { registerPropertyPlugin, applyWillChange, releaseWillChange, inferWillChange, getTransformState, buildTransformString, applyProperty, prepareProperty, clearTransformCache } from './core/CSSPlugin.js';
import { registerTweenHook } from './core/TweenManager.js';
import { config }           from './core/Config.js';

// ─────────────────────────────────────────────────────────────────────────────
// JSON Engine
// ─────────────────────────────────────────────────────────────────────────────
import fromJSON, { registerCallback, registerAction, registerTweenParser } from './json/SchemaParser.js';
import { validateSchema, registerValidTweenType, registerValidAction, registerValidEasePattern } from './json/SchemaValidator.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tensa Public API
// ─────────────────────────────────────────────────────────────────────────────

const Tensa = {
  // ── Core Animation ──────────────────────────────────────────────────────

  /**
   * Animate targets TO the given properties.
   * @param {string|Element|Element[]} targets
   * @param {Object} vars - CSS properties + config (duration, ease, delay, etc.)
   * @returns {Tween}
   */
  animate(targets, vars) {
    return Tween.animate(targets, vars);
  },

  /**
   * Animate targets FROM the given properties back to their current state.
   * @returns {Tween}
   */
  animateFrom(targets, vars) {
    return Tween.animateFrom(targets, vars);
  },

  /**
   * Animate targets FROM fromVars TO toVars.
   * @returns {Tween}
   */
  sequence(targets, fromVars, toVars) {
    return Tween.sequence(targets, fromVars, toVars);
  },

  /**
   * Instantly set properties on targets (duration: 0).
   * @returns {Tween}
   */
  apply(targets, vars) {
    return Tween.apply(targets, vars);
  },

  // ── Timeline ────────────────────────────────────────────────────────────

  /**
   * Create a new Timeline for sequencing animations.
   * @param {Object} [config]
   * @returns {Timeline}
   */
  timeline(config={}) {
    return new Timeline(config);
  },

  // ── JSON Engine ─────────────────────────────────────────────────────────

  /**
   * Parse and run an Tensa JSON animation document.
   * @param {Object|string} doc
   * @param {Object} [options]
   * @returns {Timeline}
   */
  fromJSON(doc, options) {
    return fromJSON(doc, options);
  },

  /**
   * Validate an Tensa JSON document without running it.
   * @param {Object} doc
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateJSON(doc) {
    return validateSchema(doc);
  },

  /**
   * Register a named callback for use in JSON animations.
   * @param {string} name
   * @param {Function} fn
   */
  registerCallback(name, fn) {
    registerCallback(name, fn);
    return Tensa;
  },

  /**
   * Register a custom action type for use in JSON animations.
   * @param {string} name
   * @param {Function} handler
   */
  registerAction(name, handler) {
    registerAction(name, handler);
    return Tensa;
  },

  /**
   * Register a custom tween parser for a specific type in JSON animations.
   * @param {string} type
   * @param {Function} parserFn
   */
  registerTweenParser(type, parserFn) {
    registerTweenParser(type, parserFn);
    return Tensa;
  },

  /**
   * Whitelist a custom tween type for JSON schema validation.
   * @param {string} type
   */
  registerValidTweenType(type) {
    registerValidTweenType(type);
    return Tensa;
  },

  /**
   * Whitelist a custom action type for JSON schema validation.
   * @param {string} action
   */
  registerValidAction(action) {
    registerValidAction(action);
    return Tensa;
  },

  /**
   * Whitelist a custom ease regex pattern for JSON schema validation.
   * @param {RegExp} pattern
   */
  registerValidEasePattern(pattern) {
    registerValidEasePattern(pattern);
    return Tensa;
  },

  // ── Utilities ───────────────────────────────────────────────────────────

  /**
   * Get the current value of a property on a target.
   * @param {string|Element} target
   * @param {string} prop
   * @param {string} [unit]
   * @returns {number|string}
   */
  measure(target, prop, unit) {
    return measure(target, prop, unit);
  },

  /**
   * Create a high-frequency update setter for one or more properties.
   * @param {string|Element|Array} target
   * @param {string|string[]} prop
   * @param {Object} [config]
   * @returns {Function}
   */
  createTracker(target, prop, config) {
    return createTracker(target, prop, config);
  },

  /**
   * Create a responsive animation context (media-query scoped).
   * @returns {ResponsiveContext}
   */
  responsive() {
    return createResponsive();
  },

  // ── Easing ──────────────────────────────────────────────────────────────

  /**
   * Register a custom easing function.
   * @param {string} name
   * @param {Function|string} easeOrBezier
   */
  defineEase(name, easeOrBezier) {
    defineEase(name, easeOrBezier);
    return Tensa;
  },

  /**
   * Parse an easing string into a function.
   * @param {string|Function} ease
   * @returns {Function}
   */
  parseEase(ease) {
    return parseEase(ease);
  },

  /**
   * Get all registered easing names.
   * @returns {string[]}
   */
  getEaseNames() {
    return getEaseNames();
  },

  // ── Management ──────────────────────────────────────────────────────────

  /**
   * Kill all tweens targeting a specific element/object.
   * @param {*} target
   * @param {string|Object} [props] - only kill these properties
   */
  stop(target, props) {
    tweenManager.stop(target, props);
    return Tensa;
  },

  /**
   * Alias for stop()
   */
  kill(target, props) {
    return Tensa.stop(target, props);
  },

  /**
   * Get all active animations for a target.
   * @param {*} target
   * @returns {Tween[]}
   */
  getAnimations(target) {
    return tweenManager.getAnimations(target);
  },

  /**
   * Stop ALL active tweens globally.
   */
  stopAll() {
    tweenManager.stopAll();
    return Tensa;
  },

  /**
   * Alias for stopAll()
   */
  killAll() {
    return Tensa.stopAll();
  },

  /**
   * Set global defaults for all new tweens.
   * @param {Object} config
   */
  defaults(config) {
    tweenManager.setDefaults(config);
    return Tensa;
  },

  /**
   * Get all currently registered tweens.
   * @returns {Tween[]}
   */
  getAll() {
    return tweenManager.getAll();
  },

  /**
   * Manually hint will-change on an element with reference counting.
   * @param {Element} target
   * @param {string} value
   */
  willChange(target, value) {
    applyWillChange(target, value);
    return Tensa;
  },

  /**
   * Manually release will-change hint on an element with reference counting.
   * @param {Element} target
   * @param {string} [value]
   */
  clearWillChange(target, value) {
    releaseWillChange(target, value);
    return Tensa;
  },

  // ── Ticker ──────────────────────────────────────────────────────────────

  /**
   * The global RAF ticker. Add listeners, adjust timeScale, etc.
   */
  loop: ticker,

  /**
   * The global resize/layout manager.
   */
  resizeManager,

  // ── Configuration ────────────────────────────────────────────────────────

  /**
   * Set global Tensa configuration.
   * @param {Object} options
   * @param {boolean} [options.strictMode] - If true, throws errors instead of silently failing.
   */
  config(options) {
    config(options);
    return Tensa;
  },

  // ── Version ─────────────────────────────────────────────────────────────
  version: '1.0.0',

  // ── Plugin System ───────────────────────────────────────────────────────
  use: registerPropertyPlugin,
  hook: registerTweenHook,
  defineEase: defineEase,

  // ── Internals (for CDN plugins) ─────────────────────────────────────────
  __internal: {
    getTransformState,
    buildTransformString,
    resolveTargets,
    resolveTarget,
    getOwnerWindow,
    getOwnerDocument,
    isElementLike,
    isNodeListLike,
    isShadowRootLike,
    isWindowLike,
    registerPropertyPlugin,
    applyProperty,
    prepareProperty,
    clearTransformCache
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Named exports for tree-shaking
// ─────────────────────────────────────────────────────────────────────────────
export const animate = Tween.animate;
export const animateFrom = Tween.animateFrom;
export const sequence = Tween.sequence;
export const apply = Tween.apply;
/**
 * Create a new Timeline for sequencing animations.
 * @param {Object} [config]
 * @returns {Timeline}
 */
export const timeline = (config = {}) => new Timeline(config);
export const stop = tweenManager.stop.bind(tweenManager);
export const kill = stop;
export const stopAll = tweenManager.stopAll.bind(tweenManager);
export const killAll = stopAll;
export const getAnimations = tweenManager.getAnimations.bind(tweenManager);
export const defaults = tweenManager.setDefaults.bind(tweenManager);
export const getAll = tweenManager.getAll.bind(tweenManager);
export const loop = ticker;
export const hook = registerTweenHook;
export const use = registerPropertyPlugin;
export const willChange = applyWillChange;
export const clearWillChange = releaseWillChange;
export const version = '1.0.0';

export { Tween, Timeline, tweenManager, ticker, fromJSON, validateSchema, registerCallback, registerAction, registerTweenParser, registerPropertyPlugin };
export { registerValidTweenType, registerValidAction, registerValidEasePattern } from './json/SchemaValidator.js';
export { parseEase, defineEase, getEaseNames } from './core/Easing.js';
export { config } from './core/Config.js';
export { measure }          from './core/Inspector.js';
export { createTracker }    from './core/Tracker.js';
export { createResponsive as responsive } from './core/Responsive.js';
export { resizeManager }    from './core/ResizeManager.js';
export { resolveTargets };

Tensa.Tween = Tween;
Tensa.Timeline = Timeline;

export default Tensa;
export { Tensa };
