/**
 * Tensa Tween - single animation unit.
 * Factory methods: animate(), animateFrom(), sequence(), apply()
 */

import { Playable, PlayState } from './Playable.js';
import { parseEase } from './Easing.js';
import { resolveTargets } from './TargetResolver.js';
import { prepareProperty, applyProperty, getCurrentValue, inferWillChange, applyWillChange, releaseWillChange } from './CSSPlugin.js';
import { resolveStagger } from './Stagger.js';
import ticker from './Ticker.js';
import { tweenManager, tweenInitHooks } from './TweenManager.js';
import { reportError } from './Config.js';

// Reserved keys that are NOT animated properties
const RESERVED_KEYS = new Set([
  'duration', 'delay', 'ease', 'paused', 'repeat', 'yoyo', 'repeatDelay',
  'stagger', 'onStart', 'onUpdate', 'onComplete', 'onRepeat', 'onReverseComplete',
  'onStartParams', 'onUpdateParams', 'onCompleteParams',
  'id', 'data', 'callbackScope', 'immediateRender', 'overwrite', 'lazy',
  'startAt', 'keyframes', 'reversed', 'willChange', 'scrollSync',
]);

export class Tween extends Playable {
  /**
   * @param {string|Element|Array} targets
   * @param {Object} fromVars - starting property values (null for 'animate' tweens)
   * @param {Object} toVars - ending property values + config
   * @param {string} type - 'animate' | 'animateFrom' | 'sequence' | 'apply'
   */
  constructor(targets, fromVars, toVars, type = 'animate') {
    super();
    this._type = type;
    this._rawTargets = targets;
    this._fromVars = fromVars;
    this._toVars = toVars;

    // Extract config from toVars (or fromVars for 'animateFrom')
    const config = type === 'animateFrom' ? fromVars : toVars;

    this._duration  = type === 'apply' ? 0 : (config.duration ?? tweenManager.defaults.duration ?? 0.5);
    this._delay     = config.delay ?? 0;
    this._ease      = parseEase(config.ease ?? tweenManager.defaults.ease ?? 'cubic.out');
    this._repeat    = config.repeat ?? tweenManager.defaults.repeat ?? 0;
    this._yoyo      = config.yoyo ?? tweenManager.defaults.yoyo ?? false;
    this._repeatDelay = config.repeatDelay ?? 0;
    this._paused    = config.paused ?? false;
    this._id        = config.id ?? null;
    this._overwrite = config.overwrite ?? 'auto';
    this._immediateRender = config.immediateRender ?? (type === 'animateFrom' || type === 'apply' || (type === 'sequence' && !!config.paused));
    this._stagger   = config.stagger ?? null;
    this._willChangeOpt = config.willChange ?? false;
    this._willChangeApplied = false;
    this._resolvedWillChange = null;

    // Callbacks
    this.onStart            = config.onStart ?? null;
    this.onUpdate           = config.onUpdate ?? null;
    this.onComplete         = config.onComplete ?? null;
    this.onRepeat           = config.onRepeat ?? null;
    this.onReverseComplete  = config.onReverseComplete ?? null;

    // Per-property ease map
    this._propEases = {};

    // Resolved targets (flat array)
    this._targets = [];
    this._descriptors = []; // per-target, per-prop interpolation descriptors

    // Internal
    this._startTime = null; // absolute ticker time when playback started
    this._elapsedTime = 0;  // time spent animating (excluding delay)
    this._repeatCount = 0;
    this._tickerRemove = null;

    // Resolve targets/duration (read-only, no side effects on other tweens) before hooks run,
    // so a hook sees the real target list and a usable _totalTweenDuration instead of empty/undefined.
    this._targets = resolveTargets(this._rawTargets);
    if (this._targets.length === 0) {
      reportError(`[Tensa] Tween: no targets resolved for "${this._rawTargets}". Check that the selector matches elements in the DOM.`);
    }
    this._staggerDelays = this._stagger
      ? resolveStagger(this._stagger, this._targets.length)
      : this._targets.map(() => 0);
    const maxStagger = this._staggerDelays.length
      ? Math.max(...this._staggerDelays) : 0;
    this._totalTweenDuration = this._duration + maxStagger;

    // Run lifecycle hooks (like ScrollSync) - a hook may call .kill() here to cancel
    // before registration/overwrite/paint/ticker (all still to come) take effect.
    for (const hook of tweenInitHooks) {
      hook(this, config);
    }

    // Commit: register, immediate render, start ticker
    this._init();
  }

  // Initialization

  _init() {
    // Register with manager
    tweenManager.register(this);

    this._initted = false;

    // Immediate render (from tweens render initial state right away)
    if (this._immediateRender) {
      this._buildDescriptors();
      this._initted = true;
      if (this._type === 'apply' && this._willChangeOpt) {
        this._applyWillChangeStatic();
      }
      this._render(0);
    }

    // Auto-play unless paused
    if (!this._paused) {
      this._startTicker();
    }
  }

  _applyWillChange() {
    if (!this._willChangeOpt || this._willChangeApplied || this._duration === 0) return;
    if (!this._resolvedWillChange) {
      this._resolvedWillChange = typeof this._willChangeOpt === 'string'
        ? this._willChangeOpt
        : inferWillChange(this._type === 'animateFrom' ? this._fromVars : this._toVars);
    }
    if (this._resolvedWillChange && this._targets) {
      for (const target of this._targets) {
        applyWillChange(target, this._resolvedWillChange);
      }
      this._willChangeApplied = true;
    }
  }

  _releaseWillChange() {
    if (!this._willChangeApplied) return;
    if (this._resolvedWillChange && this._targets) {
      for (const target of this._targets) {
        releaseWillChange(target, this._resolvedWillChange);
      }
    }
    this._willChangeApplied = false;
  }

  _applyWillChangeStatic() {
    const val = typeof this._willChangeOpt === 'string'
      ? this._willChangeOpt
      : inferWillChange(this._toVars);
    if (val && this._targets) {
      for (const target of this._targets) {
        if (target && target.style) {
          target.style.willChange = val;
        }
      }
    }
  }

  _buildDescriptors() {
    const type = this._type;
    const toVars = this._toVars || {};
    const fromVars = this._fromVars || {};

    this._descriptors = this._targets.map((target, idx) => {
      const props = {};
      const source = type === 'animateFrom' ? fromVars : toVars;

      for (const [prop, rawVal] of Object.entries(source)) {
        if (RESERVED_KEYS.has(prop)) continue;

        // Resolve function values
        const resolvedVal = typeof rawVal === 'function'
          ? rawVal(target, idx, this._targets)
          : rawVal;

        // Determine from/to based on tween type
        let fromVal, toVal;
        switch (type) {
          case 'animate':
            fromVal = null; // will be read from computed style
            toVal = resolvedVal;
            break;
          case 'animateFrom':
            // fromVal = user value, toVal = current live value
            fromVal = resolvedVal;
            toVal = getCurrentValue(target, prop);  // read live destination
            break;
          case 'sequence':
            fromVal = typeof (fromVars[prop]) === 'function'
              ? fromVars[prop](target, idx, this._targets)
              : fromVars[prop];
            toVal = resolvedVal;
            break;
          case 'apply':
            fromVal = resolvedVal;
            toVal = resolvedVal;
            break;
        }

        // startAt support
        if (toVars.startAt && toVars.startAt[prop] !== undefined) {
          fromVal = typeof toVars.startAt[prop] === 'function'
            ? toVars.startAt[prop](target, idx, this._targets)
            : toVars.startAt[prop];
        }

        // Per-property ease
        if (toVars.ease && typeof toVars.ease === 'object' && toVars.ease[prop]) {
          this._propEases[prop] = parseEase(toVars.ease[prop]);
        }

        props[prop] = prepareProperty(target, prop, fromVal, toVal);
      }

      return props;
    });
  }

  /**
   * Dynamically updates the destination values of a running tween.
   * Modifies the current interpolated values to be the new `fromVal`,
   * sets the new `toVal`, and restarts the tween.
   * @param {Object} newVars  New destination values and config overrides.
   * @param {boolean} [resetDuration=true]  Whether to restart the tween's elapsed time to 0.
   * @returns {Tween} this
   */
  retarget(newVars, resetDuration = true) {
    if (!this._initted) {
      this._buildDescriptors();
      this._initted = true;
    }

    if (newVars.duration !== undefined) {
      this._duration = newVars.duration;
      this._totalTweenDuration = this._duration + (this._stagger ? this._stagger.max : 0);
    }
    if (newVars.ease !== undefined) {
      this._ease = parseEase(newVars.ease);
    }
    
    Object.assign(this._toVars, newVars);

    this._targets.forEach((target, i) => {
      const props = this._descriptors[i];
      for (const [prop, rawVal] of Object.entries(newVars)) {
        if (RESERVED_KEYS.has(prop)) continue;

        const currentVal = getCurrentValue(target, prop);
        const resolvedVal = typeof rawVal === 'function' ? rawVal(target, i, this._targets) : rawVal;

        props[prop] = prepareProperty(target, prop, currentVal, resolvedVal);
      }
    });

    if (resetDuration) {
      this._time = 0;
      this._elapsedTime = 0;
      this._state = PlayState.PLAYING;
      if (this._tickerRemove) {
        this._startTime = ticker.time - (this._delay * 1000 / this._timeScale);
      } else {
        this._startTicker();
      }
    }
    
    return this;
  }

  // Getters
  /**
   * @description Returns the total duration of the tween, including repeats.
   * @returns {number} The total duration of the tween, including repeats.
   */
  get totalDuration() {
    if (this._repeat === -1) return Infinity;
    const dur = this._totalTweenDuration === 0 ? 0 : this._totalTweenDuration;
    return dur * (this._repeat + 1) + this._repeatDelay * this._repeat;
  }

  /**
   * @description Returns whether the tween is currently yoyo-ing.
   * @returns {boolean} True if the tween is yoyo-ing.
   */
  get isYoyoBack()      { return this._isYoyoBack     ?? false; }

  /**
   * @description Returns the tween's type ('animate', 'animateFrom', 'apply', 'sequence', or a plugin-provided type).
   * @returns {string} The tween type.
   */
  get type() { return this._type; }

  /**
   * @description Returns the resolved overwrite mode for this tween.
   * @returns {string|boolean} The overwrite mode.
   */
  get overwrite() { return this._overwrite; }

  /**
   * @description Returns the stagger config passed to this tween, if any.
   * @returns {Object|null} The stagger config.
   */
  get stagger() { return this._stagger; }

  /**
   * @description Returns the visual progress of the tween.
   * @returns {number} The visual progress of the tween.
   */
  get visualProgress()  { return this._visualProgress  ?? 0; }

  /**
   * @description Returns the progress of the tween.
   * @returns {number} The progress of the tween.
   */
  get progress() {
    return this._totalTweenDuration === 0 ? 1 : this._time / this._totalTweenDuration;
  }

  /**
   * @description Sets the progress of the tween.
   * @param {number} v  The progress to set.
   */
  set progress(v) {
    this.seek(v * this._totalTweenDuration);
  }

  // Ticker Integration

  /**
   * @private
   * @description Starts the ticker.
   */
  _startTicker() {
    if (this._tickerRemove) return;
    this._startTime = null;
    this._tickerRemove = ticker.add((time, delta) => this._tickUpdate(time, delta));
    this._state = PlayState.PLAYING;
  }

  /**
   * @private
   * @description Stops the ticker.
   */
  _stopTicker() {
    if (this._tickerRemove) {
      this._tickerRemove();
      this._tickerRemove = null;
    }
  }

  _onPlay() {
    this._startTicker();
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
    if (elapsed < this._delay) return;

    const animElapsed = elapsed - this._delay;
    this._render(animElapsed);
  }

  _render(animElapsed) {
    const totalDur = this._totalTweenDuration === 0 ? 0 : this._totalTweenDuration;

    const maxCycles = this._repeat === -1 ? Infinity : this._repeat;
    const totalPlaybackDuration = maxCycles === Infinity 
      ? Infinity 
      : totalDur + maxCycles * (totalDur + this._repeatDelay);
    
    let isDone = false;
    let clampedElapsed = animElapsed;
    
    if (totalDur === 0) {
      clampedElapsed = 0;
      isDone = true;
    } else if (animElapsed >= totalPlaybackDuration) {
      clampedElapsed = totalPlaybackDuration;
      isDone = true;
    }

    let cycle = 0;
    let cycleTime = 1;

    if (totalDur > 0) {
      if (clampedElapsed === Infinity) {
        cycle = 0;
        cycleTime = 1;
      } else {
        cycle = Math.floor(clampedElapsed / (totalDur + this._repeatDelay));
        
        // If we land exactly on the end of the total playback, clamp cycle to maxCycles
        if (cycle > maxCycles || (isDone && cycle > 0 && clampedElapsed % (totalDur + this._repeatDelay) === 0)) {
          cycle = maxCycles;
        }
        
        const localElapsed = clampedElapsed - cycle * (totalDur + this._repeatDelay);
        cycleTime = Math.max(0, Math.min(localElapsed / totalDur, 1));
      }
    }

    this._elapsedTime = clampedElapsed;
    this._time = cycleTime * totalDur;

    if (!this._started) {
      this._started = true;
      this._fireCallback('onStart');
    }

    if (this._willChangeOpt && !this._willChangeApplied && !isDone) {
      this._applyWillChange();
    }

    if (cycle > this._repeatCount && this._repeatCount <= maxCycles && cycle <= maxCycles) {
      // Fire onRepeat for each cycle boundary crossed
      const repeatsToFire = cycle - this._repeatCount;
      for (let i = 0; i < repeatsToFire; i++) {
        if (this._repeatCount < maxCycles) {
          this._repeatCount++;
          this._fireCallback('onRepeat');
        }
      }
    }

    const isYoyoBack = this._yoyo && (cycle % 2 === 1);
    this._isYoyoBack    = isYoyoBack;
    const progress      = isYoyoBack ? 1 - cycleTime : cycleTime;
    this._visualProgress = progress;

    const effectiveTime = this._reversed
      ? totalDur * (1 - progress)
      : totalDur * progress;

    this._renderCore(effectiveTime);
    this._fireCallback('onUpdate');

    if (isDone && this._state !== PlayState.COMPLETED) {
      const finalTime = this._reversed ? 0 : totalDur;
      // Guarantee final render settles exactly on the bounds
      if (!isYoyoBack && cycleTime >= 1) this._renderCore(this._reversed ? 0 : totalDur);
      else if (isYoyoBack && cycleTime >= 1) this._renderCore(this._reversed ? totalDur : 0);
      else this._renderCore(effectiveTime); // For totalDur === 0

      this._state = PlayState.COMPLETED;
      this._stopTicker();
      this._releaseWillChange();
      // A naturally-completed tween must leave the registry too, not just an explicitly
      // killed one - otherwise every apply()/animate() call that's ever allowed to finish
      // on its own (the common case) stays registered forever, growing tweenManager's
      // target map without bound and leaving stale descriptors for future auto-overwrite
      // passes to iterate. Targets/descriptors are kept intact (unlike kill()) so the
      // tween can still be seeked after completing.
      tweenManager.unregister(this);
      if (this._reversed) {
        this._fireCallback('onReverseComplete');
      } else {
        this._fireCallback('onComplete');
      }
    }
  }

  // Rendering

  _renderCore(time, _unused) {
    if (!this._initted) {
      this._buildDescriptors();
      this._initted = true;
    }

    const dur = this._duration || 0;
    const rawProgress = dur === 0 ? 1 : Math.max(0, Math.min(time / dur, 1));

    this._targets.forEach((target, idx) => {
      const staggerDelay = this._staggerDelays[idx] || 0;

      let targetProgress;
      let targetRawProgress;
      
      if (this._stagger) {
        const staggerElapsed = time - staggerDelay;
        if (staggerElapsed < 0) {
          targetProgress = 0;
          targetRawProgress = 0;
        } else {
          targetRawProgress = dur === 0 ? 1 : Math.min(staggerElapsed / dur, 1);
          targetProgress = this._ease(targetRawProgress);
        }
      } else {
        targetRawProgress = rawProgress;
        targetProgress = rawProgress === 0 ? 0
          : rawProgress === 1 ? 1
          : this._ease(rawProgress);
        // Apply per-property eases below
      }

      const descriptors = this._descriptors[idx];
      if (!descriptors) return;

      for (const [prop, descriptor] of Object.entries(descriptors)) {
        const propEase = this._propEases[prop];
        const t = propEase ? propEase(targetRawProgress) : targetProgress;
        applyProperty(target, descriptor, t);
      }
    });

    // Keep _time in sync
    this._time = time;
  }

  // Overrides from Playable
  /**
   * @description Plays the tween.
   * @param {number} [from]  The time to play from.
   * @returns {Tween} this
   */
  play(from) {
    super.play(from);
    this._startTicker();
    return this;
  }
  
  /**
   * @description Pauses the tween.
   * @param {number} [atTime]  The time to pause at.
   * @returns {Tween} this
   */
  pause(atTime) {
    super.pause(atTime);
    return this;
  }
  /**
   * @description Resumes the tween.
   * @returns {Tween} this
   */
  resume() {
    super.resume();
    if (!this._tickerRemove) {
      this._startTicker(); 
    }
    return this;
  }

  /**
   * @description Reverses the tween.
   * @param {number} [from]  The time to reverse from.
   * @returns {Tween} this
   */
  reverse(from) {
    super.reverse(from);
    // Flip start time so reversed progress works
    this._reversed = true;
    if (!this._tickerRemove) this._startTicker();
    return this;
  }

  /**
   * @description Seeks to a specific time in the tween.
   * @param {number|string} timeOrLabel  The time or label to seek to.
   * @returns {Tween} this
   */
  seek(timeOrLabel) {
    const t = typeof timeOrLabel === 'string'
      ? (this._labels[timeOrLabel] ?? 0)
      : timeOrLabel;
    const clampedT = Math.max(0, Math.min(t, this._totalTweenDuration || 0));
    this._render(clampedT); // updates _elapsedTime and _time
    // Adjust _startTime so the ticker picks up from the new position on the next frame
    if (this._tickerRemove) {
      if (this._startTime !== null) {
        const now = ticker.time;
        this._startTime = now - (clampedT + this._delay) * 1000 / this._timeScale;
      }
    }
    return this;
  }

  /**
   * @description Kills the tween.
   * @returns {Tween} this
   */
  kill() {
    this._stopTicker();
    this._releaseWillChange();
    tweenManager.unregister(this);
    
    // free DOM references
    this._targets = [];
    this._descriptors = [];
    this._propEases = {};
    
    super.kill();
    return this;
  }

  invalidate() {
    this._started = false;
    this._resolvedWillChange = null;
    this._buildDescriptors();
    return this;
  }

  // Static Factory Methods
  /**
   * Creates a new tween.
   * @param {Array<Element|Object> | Element | Object | NodeList | HTMLCollection | String} targets  The targets to animate.
   * @param {Object} vars  The variables to animate.
   * @returns {Tween} The new tween.
   */
  static animate(targets, vars) {
    return new Tween(targets, null, vars, 'animate');
  }

  /**
   * Creates a new tween that animates from a starting point.
   * @param {Array<Element|Object> | Element | Object | NodeList | HTMLCollection | String} targets  The targets to animate.
   * @param {Object} vars  The variables to animate.
   * @returns {Tween} The new tween.
   */
  static animateFrom(targets, vars) {
    return new Tween(targets, vars, vars, 'animateFrom');
  }

  /**
   * Creates a new tween that animates from a starting point to an ending point, where each tween is played in sequence.
   * @param {Array<Element|Object> | Element | Object | NodeList | HTMLCollection | String} targets  The targets to animate.
   * @param {Object} fromVars  The variables to animate from.
   * @param {Object} toVars  The variables to animate to.
   * @returns {Tween} The new tween.
   */
  static sequence(targets, fromVars, toVars) {
    return new Tween(targets, fromVars, toVars, 'sequence');
  }

  /**
   * Creates a new tween that immediately applies the animation values.
   * @param {Array<Element|Object> | Element | Object | NodeList | HTMLCollection | String} targets  The targets to animate.
   * @param {Object} vars  The variables to animate.
   * @returns {Tween} The new tween.
   */
  static apply(targets, vars) {
    return new Tween(targets, vars, vars, 'apply');
  }

  /**
   * Returns an array of the targets that this tween is animating.
   * @returns {Array<Element|Object>} Array of target objects/elements
   */
  get targets() {
    return this._targets ? this._targets.slice() : [];
  }

  /**
   * Returns the original, unresolved targets argument as passed to the constructor.
   * @returns {string|Element|Array|Object} The raw targets value.
   */
  get rawTargets() {
    return this._rawTargets;
  }
}

export default Tween;