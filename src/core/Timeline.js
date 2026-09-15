/**
 * Tensa Timeline - Sequence container for tweens
 * 
 * Features:
 * - .add(tween, position) with flexible position syntax:
 *     absolute time (number), label (string), '<' (last insert), '>' (end of last)
 *     '<+=0.5', '>-0.3', '+=1' (relative to timeline end)
 * - .to(), .from(), .fromTo(), .set(), .call() shorthands
 * - Nesting: timelines within timelines
 * - Labels: .addLabel(), .getLabels()
 * - Full Playable API (play, pause, reverse, seek, timeScale, etc.)
 */

import { Playable, PlayState } from './Playable.js';
import { parseEase } from './Easing.js';
import { Tween } from './Tween.js';
import ticker from './Ticker.js';
import { tweenManager, tweenInitHooks } from './TweenManager.js';

// Tolerance for float subtraction error (time - startTime).
const EPSILON = 1e-9;

export class Timeline extends Playable {
  /**
   * @param {Object} [config]
   * @param {boolean} [config.paused=false]
   * @param {number} [config.repeat=0]
   * @param {boolean} [config.yoyo=false]
   * @param {number} [config.delay=0]
   * @param {string} [config.ease]
   * @param {string} [config.id]
   * @param {number} [config.timeScale=1]
   * @param {number} [config.repeatDelay=0]
   * @param {Function} [config.onStart]
   * @param {Function} [config.onUpdate]
   * @param {Function} [config.onComplete]
   * @param {Function} [config.onRepeat]
   * @param {Function} [config.onReverseComplete]
   */
  constructor(config = {}) {
    super();
    this._children   = [];  // { tween: Tween|Timeline, startTime: number }
    this._duration   = 0;
    this._delay      = config.delay ?? 0;
    this._repeat     = config.repeat ?? 0;
    this._yoyo       = config.yoyo ?? false;
    this._paused     = config.paused ?? false;
    this._ease       = parseEase(config.ease ?? 'none');
    this._id         = config.id ?? null;
    this._timeScale  = Math.max(0.001, config.timeScale ?? 1);
    this._repeatDelay = config.repeatDelay ?? 0;

    // Callbacks
    this.onStart            = config.onStart ?? null;
    this.onUpdate           = config.onUpdate ?? null;
    this.onComplete         = config.onComplete ?? null;
    this.onRepeat           = config.onRepeat ?? null;
    this.onReverseComplete  = config.onReverseComplete ?? null;

    this._lastInsertTime = 0; // tracks position of last added child
    this._lastInsertEndTime = 0; // tracks end of last added child
    this._startTime = null;
    this._started = false;
    this._repeatCount = 0;
    this._tickerRemove = null;

    // Run lifecycle hooks (like ScrollTrack)
    for (const hook of tweenInitHooks) {
      hook(this, config);
    }
  }

  // Adding Children

  /**
   * Add a tween, timeline, callback, or label to the timeline.
   * @param {Tween|Timeline|Function|string} child
   * @param {number|string} [position] - when to insert
   */
  add(child, position) {
    const startTime = this._resolvePosition(position);

    if (typeof child === 'string') {
      // Adding a label
      this._labels[child] = startTime;
      return this;
    }

    if (typeof child === 'function') {
      // Callback - wrap in a zero-duration pseudo-tween
      const callTween = {
        _startTime: startTime,
        _duration: 0,
        _isCallback: true,
        _fn: child,
        _called: false,
      };
      this._children.push({ child: callTween, startTime });
      this._recalcDuration();
      this._lastInsertTime = startTime;
      this._lastInsertEndTime = startTime;
      // Auto-start timeline on first add (mirrors the check below for Tween/Timeline children)
      if (!this._paused && !this._tickerRemove) {
        this._startTicker();
      }
      return this;
    }

    if (Array.isArray(child)) {
      child.forEach(c => this.add(c, position));
      return this;
    }

    if (!(child instanceof Tween) && !(child instanceof Timeline)) {
      throw new TypeError(`[Tensa] Timeline.add(): Invalid child. Expected Tween, Timeline, function, string, or Array. Received: ${child}`);
    }

    // Detach child from its own ticker (timeline controls it)
    if (child._tickerRemove) {
      child._tickerRemove();
      child._tickerRemove = null;
    }
    child._paused = true;
    child._startTime = null;

    this._children.push({ child, startTime });
    this._recalcDuration();
    this._lastInsertTime = startTime;
    this._lastInsertEndTime = startTime + (child.totalDuration === Infinity ? 0 : child.totalDuration);

    // Auto-start timeline on first add
    if (!this._paused && !this._tickerRemove) {
      this._startTicker();
    }

    return this;
  }

  /** Remove a child tween or timeline */
  remove(child) {
    this._children = this._children.filter(({ child: c }) => c !== child);
    this._recalcDuration();
    return this;
  }

  /** Empties the timeline of all children and optionally labels, allowing it to be reused */
  clear(labels = true) {
    this._children = [];
    this._duration = 0;
    this._lastInsertTime = 0;
    this._lastInsertEndTime = 0;
    this._time = 0;
    this._elapsedTime = 0;
    this._repeatCount = 0;
    this._started = false;
    
    if (labels) {
      this._labels = {};
    }
    
    this.pause();
    return this;
  }

 /**
   * Add a label at the given position
   * @param {string} name The name of the label
   * @param {number|string} position The position of the label
   * @returns {Timeline} The timeline
   */
  addLabel(name, position) {
    const time = this._resolvePosition(position);
    this._labels[name] = time;
    return this;
  }

  /**
   * Create and add a tween that animates properties from current values to new values.
   * @param {*} targets DOM elements, Selectors, or Object to animate
   * @param {Object} vars Animation properties and callbacks
   * @param {number|string} [position=""] Where to insert the tween
   * @returns {Timeline} The created tween
   */
  animate(targets, vars, position="") {
    const tween = Tween.animate(targets, { ...vars, paused: true });
    return this.add(tween, position);
  }

  /**
   * Create and add a tween that animates properties from initial values to target values.
   * @param {*} targets DOM elements, Selectors, or Object to animate
   * @param {Object} vars Animation properties and callbacks
   * @param {number|string} [position=""] Where to insert the tween
   * @returns {Timeline} The created tween
   */
  animateFrom(targets, vars, position="") {
    const tween = Tween.animateFrom(targets, { ...vars, paused: true });
    return this.add(tween, position);
  }

  /**
   * Create and add a tween that animates properties from initial values to target values.
   * @param {*} targets DOM elements, Selectors, or Object to animate
   * @param {Object} vars Animation properties and callbacks
   * @param {number|string} [position=""] Where to insert the tween
   * @returns {Timeline} The created tween
   */
  sequence(targets, fromVars, toVars, position="") {
    const tween = Tween.sequence(targets, fromVars, { ...toVars, paused: true });
    return this.add(tween, position);
  }

  /**
   * Create and add an instant-apply tween to the timeline.
   * @param {*} targets DOM elements, Selectors, or Object to animate
   * @param {Object} vars Animation properties and callbacks
   * @param {number|string} [position=""] Where to insert the tween
   * @returns {Timeline} The created tween
   */
  apply(targets, vars, position="") {
    const tween = Tween.apply(targets, { ...vars, paused: true });
    return this.add(tween, position);
  }

  /**
   * Create and add a callback to the timeline.
   * @param {Function} fn The callback function to execute
   * @param {Array} [params=[]] Parameters to pass to the callback
   * @param {number|string} [position=""] Where to insert the callback
   * @returns {Timeline} The timeline
   */
  call(fn, params, position="") {
    return this.add(() => fn.apply(this, params || []), position);
  }

  // Position Resolution

  _resolvePosition(position) {
    if (typeof position === 'string') {
      position = position.trim();
    }

    if (position === undefined || position === null) {
      return this._duration; // append at end
    }
    if (position === '>') {
      return this._lastInsertEndTime; // end of last inserted child
    }
    if (position === '<') {
      return this._lastInsertTime; // start of last inserted child
    }

    if (typeof position === 'number') return position;

    if (typeof position === 'string') {
      // Label
      if (this._labels[position] !== undefined) {
        return this._labels[position];
      }

      // '<+=0.5', '>-0.3', '+=1', 'label+=0.2' patterns (allow optional spaces)
      const match = position.match(/^(.*?)\s*([\+\-]=?)\s*([\d.]+)$/);
      if (match) {
        const anchor = match[1].trim();
        const op     = match[2];
        const offset = parseFloat(match[3]);
        let base;
        
        if (anchor === '<') base = this._lastInsertTime;
        else if (anchor === '>') base = this._lastInsertEndTime;
        else if (anchor === '') base = this._duration;
        else if (this._labels[anchor] !== undefined) base = this._labels[anchor];
        else {
          // If anchor is provided but not found as a label, just use _duration as fallback
          // (or treat the whole string as a new label, but here we fallback to end)
          base = this._duration;
        }

        if (op === '+=' || op === '+') return base + offset;
        if (op === '-=' || op === '-') return Math.max(0, base - offset);
        return offset;
      }

      // Pure numeric string
      const n = parseFloat(position);
      if (!isNaN(n)) return n;
    }

    return this._duration;
  }

  _recalcDuration() {
    let max = 0;
    for (const { child, startTime } of this._children) {
      // Callback pseudo-tweens are plain objects without totalDuration; use _duration (always 0)
      const childDur = child._isCallback ? 0 : (child.totalDuration ?? 0);
      const end = startTime + childDur;
      if (end > max) max = end;
    }
    this._duration = max;
  }

  // Ticker Integration

  _startTicker() {
    if (this._tickerRemove) return;
    this._startTime = null;
    this._tickerRemove = ticker.add((time, delta) => this._tickUpdate(time, delta));
    this._state = PlayState.PLAYING;
  }

  _stopTicker() {
    if (this._tickerRemove) {
      this._tickerRemove();
      this._tickerRemove = null;
    }
  }

  _onPause() {
    this._stopTicker();
  }

  _onKill() {
    this._stopTicker();
  }

  _tickUpdate(time, delta) {
    if (this._paused) return;

    if (this._startTime === null) {
      const initialDelta = Math.min(delta, 16.67) / 1000 * this._timeScale;
      const startOffset = (this._elapsedTime || 0) + (this._delay || 0) + initialDelta;
      this._startTime = time - (startOffset * 1000 / this._timeScale);
    }

    const elapsed = (time - this._startTime) / 1000 * this._timeScale;

    // Handle delay
    if (elapsed < this._delay) return;

    const animElapsed = elapsed - this._delay;
    this._elapsedTime = animElapsed; // tracked for resume() position restore
    const dur = this._duration;

    let scrubTime;
    let isDone = false;

    if (dur === Infinity) {
      scrubTime = animElapsed;
      if (!this._started) {
        this._started = true;
        this._fireCallback('onStart');
      }
    } else {
      let rawProgress = dur === 0 ? 1 : Math.min(animElapsed / dur, 1);

      // Determine cycle
      let cycle = 0;
      let cycleProgress = rawProgress;

      const pastFirstCycle = dur > 0 ? animElapsed > dur : (this._repeatDelay > 0 && animElapsed > 0);
      if (pastFirstCycle && this._repeat !== 0) {
        const fullCycleDur = dur + this._repeatDelay;
        cycle = Math.floor(animElapsed / fullCycleDur);
        
        // If we land exactly on the end of the total playback, clamp cycle
        const maxCycles = this._repeat === -1 ? Infinity : this._repeat;
        if (cycle > maxCycles) {
          cycle = maxCycles;
        }

        const localElapsed = animElapsed - cycle * fullCycleDur;
        cycleProgress = dur === 0 ? 1 : Math.max(0, Math.min(localElapsed / dur, 1));
      }

      if (!this._started) {
        this._started = true;
        this._fireCallback('onStart');
      }

      const maxCycles = this._repeat === -1 ? Infinity : this._repeat;
      if (cycle > this._repeatCount && this._repeatCount <= maxCycles) {
        this._repeatCount = cycle;
        this._fireCallback('onRepeat');
      }

      // Yoyo
      const isYoyoBack = this._yoyo && (cycle % 2 === 1);
      const progress = isYoyoBack ? 1 - cycleProgress : cycleProgress;

      // Apply timeline-level easing
      const eased = this._ease(progress);

      // Reversed playback counts down from dur to 0 as elapsed time increases
      scrubTime = this._reversed ? dur - eased * dur : eased * dur;
      isDone = cycleProgress >= 1 && (this._repeat === 0 || (this._repeat !== -1 && this._repeatCount >= maxCycles));
    }

    // Scrub all children
    this._scrub(scrubTime);
    this._time = scrubTime;

    this._fireCallback('onUpdate');

    // Completion check
    if (isDone) {
      this._scrub(this._reversed ? 0 : dur);
      this._state = PlayState.COMPLETED;
      this._stopTicker();
      if (this._reversed) {
        this._fireCallback('onReverseComplete');
      } else {
        this._fireCallback('onComplete');
      }
    }
  }

  /** Scrub timeline to an absolute time position (seconds) */
  _scrub(time) {
    const isForward = time >= (this._time || 0);
    const len = this._children.length;

    for (let i = 0; i < len; i++) {
      const idx = isForward ? i : len - 1 - i;
      const { child, startTime } = this._children[idx];

      if (child._isCallback) {
        if (isForward) {
          if (!child._called && time >= startTime) {
            child._called = true;
            child._fn();
          }
        } else {
          if (child._called && time <= startTime) {
            child._called = false;
          }
        }
        continue;
      }

      const childElapsed = time - startTime;
      const childTotalDur = child.totalDuration;
      const cElapsed = child._elapsedTime ?? 0;

      if (childElapsed <= 0) {
        // Not started yet - prevent redundant renders if already at 0
        if (cElapsed !== 0) {
          if (child instanceof Timeline) {
            child._scrub(0);
          } else if (child._initted) {
            child._render?.(0);
          }
        }
      } else if (childTotalDur !== Infinity && childElapsed >= childTotalDur - EPSILON) {
        // Completed - prevent redundant renders if already at end
        if (cElapsed !== childTotalDur) {
          if (child instanceof Timeline) {
            child._scrub(childTotalDur);
          } else {
            child._render?.(childTotalDur);
          }
        }
      } else {
        // In progress
        if (child instanceof Timeline) {
          child._scrub(childElapsed);
        } else {
          child._render?.(childElapsed);
        }
      }
    }
  }

  // Overrides
/**
 * 
 */
  play(from=null) {
    super.play(from);
    this._startTicker();
    return this;
  }

  pause(atTime=null) {
    super.pause(atTime);
    return this;
  }

  resume() {
    super.resume();
    if (!this._tickerRemove) {
      this._startTicker();
    }
    return this;
  }

  reverse(from=null) {
    super.reverse(from);
    this._reversed = true;
    if (!this._tickerRemove) this._startTicker();
    return this;
  }

  seek(timeOrLabel) {
    const t = typeof timeOrLabel === 'string'
      ? (this._labels[timeOrLabel] ?? 0)
      : timeOrLabel;
    const clampedT = Math.max(0, Math.min(t, this._duration));
    this._scrub(clampedT);
    this._time = clampedT;
    this._elapsedTime = clampedT; // keep in sync for resume

    this._fireCallback('onUpdate');

    // Adjust _startTime so the ticker picks up from the new position on the next frame
    if (this._tickerRemove) {
      if (this._startTime !== null) {
        const now = ticker.time;
        this._startTime = now - (clampedT + this._delay) * 1000 / this._timeScale;
      }
    }
    return this;
  }

  kill() {
    this._stopTicker();
    for (const { child } of this._children) {
      child.kill?.();
    }
    this.clear();
    super.kill();
    return this;
  }

  /** Get sorted array of all children with their start times */
  getChildren(nested = false) {
    const children = this._children.map(({ child, startTime }) => ({ child, startTime }));
    if (nested) {
      return children.flatMap(({ child, startTime }) =>
        child instanceof Timeline
          ? [{ child, startTime }, ...child.getChildren(true)]
          : [{ child, startTime }]
      );
    }
    return children;
  }

  /** Get total duration including repeats */
  get totalDuration() {
    if (this._repeat === -1) return Infinity;
    return this._duration * (this._repeat + 1) + this._repeatDelay * this._repeat;
  }

  /**
   * Returns a flat array of all targets being animated by children of this timeline.
   * @returns {Array} Array of target objects/elements
   */
  get targets() {
    const allTargets = [];
    for (const { child } of this._children) {
      if (child && child.targets) {
        allTargets.push(...child.targets);
      }
    }
    return Array.from(new Set(allTargets));
  }
}

export default Timeline;