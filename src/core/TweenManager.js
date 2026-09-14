
class TweenManager {
  constructor() {
    this._tweens = new Set();
    this._targetMap = new WeakMap(); // target → Set<Tween>

    this.defaults = {
      duration:  0.5,
      ease:     'cubic.out',
      repeat:    0,
      yoyo:      false,
    };
  }

  /** Register a tween in the global registry */
  register11(tween) {
    this._tweens.add(tween);
    if (tween._targets) {
      for (const target of tween._targets) {
        if (typeof target === 'object' && target !== null) {
          if (!this._targetMap.has(target)) {
            this._targetMap.set(target, new Set());
          }
          this._targetMap.get(target).add(tween);
        }
      }
    }

    // Handle overwrite: 'auto' kills conflicting props on same target
    if (tween._overwrite === 'auto') {
      this._autoOverwrite(tween);
    } else if (tween._overwrite === true) {
      // Kill ALL tweens on the same targets
      if (tween._targets) {
        for (const target of tween._targets) {
          this.stop(target);
        }
      }
    }
  }
/** Register a tween in the global registry */
  register(tween) {
    this._tweens.add(tween);
    if (tween._targets) {
      for (const target of tween._targets) {
        if (typeof target === 'object' && target !== null) {
          if (!this._targetMap.has(target)) {
            this._targetMap.set(target, new Set());
          }
          this._targetMap.get(target).add(tween);
        }
      }
    }

    // Handle overwrite: 'auto' kills conflicting props on same target
    if (tween._overwrite === 'auto') {
      this._autoOverwrite(tween);
    } else if (tween._overwrite === true) {
      // Kill ALL OTHER tweens on the same targets
      if (tween._targets) {
        for (const target of tween._targets) {
          const existingTweens = this._targetMap.get(target);
          if (existingTweens) {
            // Iterate over a copy since kill() mutates the set
            for (const existingTween of Array.from(existingTweens)) {
              // PREVENT SUICIDE: Only kill if it's not the new tween
              if (existingTween !== tween) {
                existingTween.kill();
              }
            }
          }
        }
      }
    }
  }
  /** Unregister a tween */
  unregister(tween) {
    this._tweens.delete(tween);
    if (tween._targets) {
      for (const target of tween._targets) {
        const set = this._targetMap.get(target);
        if (set) set.delete(tween);
      }
    }
  }

  /**
   * Kill all tweens animating a specific target.
   * Optionally, only kill specific properties.
   * @param {*} target
   * @param {string|string[]} [props] - specific property or array of property names
   */
  stop(target, props) {
    const targets = Array.isArray(target) ? target : [target];

    for (const t of targets) {
      const tweens = this._targetMap.get(t);
      if (!tweens) continue;

      // Iterate over a copy since kill() mutates the sets
      for (const tween of Array.from(tweens)) {
        if (!props) {
          if (typeof tween.kill === 'function') {
            tween.kill();
          } else {
            tween._stopTicker?.();
            tweens.delete(tween);
            this._tweens.delete(tween);
          }
        } else {
          // Kill specific properties
          const propList = typeof props === 'string' ? [props] : props;
          const idx = tween._targets?.indexOf(t);
          if (idx !== undefined && idx >= 0 && tween._descriptors[idx]) {
            for (const prop of propList) {
              delete tween._descriptors[idx][prop];
            }
          }
        }
      }
    }
  }

  /**
   * Get all active tweens for a given target.
   */
  getAnimations(target) {
    const set = this._targetMap.get(target);
    return set ? Array.from(set).filter(t => !t.isCompleted) : [];
  }

  /**
   * Stop ALL active tweens globally.
   */
  stopAll() {
    for (const tween of Array.from(this._tweens)) {
      if (typeof tween.kill === 'function') {
        tween.kill();
      } else {
        tween._stopTicker?.();
      }
    }
    this._tweens.clear();
  }

  /**
   * Auto-overwrite mode: remove conflicting properties from older tweens
   * that animate the same targets and same props as the new tween.
   */
  _autoOverwrite11(newTween) {
    if (!newTween._targets || !newTween._descriptors) return;

    newTween._targets.forEach((target, idx) => {
      const existing = this._targetMap.get(target);
      if (!existing) return;

      const newProps = new Set(Object.keys(newTween._descriptors[idx] || {}));

      for (const tween of existing) {
        if (tween === newTween) continue;
        const tIdx = tween._targets?.indexOf(target);
        if (tIdx < 0 || !tween._descriptors[tIdx]) continue;

        for (const prop of newProps) {
          if (tween._descriptors[tIdx][prop]) {
            delete tween._descriptors[tIdx][prop];
          }
        }
      }
    });
  }
_autoOverwrite(newTween) {
    if (!newTween._targets) return;

    // Determine the properties this new tween intends to animate
    // by looking at _toVars (or _fromVars for 'animateFrom')
    const sourceVars = newTween._type === 'animateFrom' ? newTween._fromVars : newTween._toVars;
    const reservedKeys = new Set([
      'duration', 'delay', 'ease', 'paused', 'repeat', 'yoyo', 'repeatDelay',
      'stagger', 'onStart', 'onUpdate', 'onComplete', 'onRepeat', 'onReverseComplete',
      'onStartParams', 'onUpdateParams', 'onCompleteParams',
      'id', 'data', 'callbackScope', 'immediateRender', 'overwrite', 'lazy',
      'startAt', 'keyframes', 'reversed', 'willChange',
    ]);

    const newProps = new Set(
      Object.keys(sourceVars || {}).filter(key => !reservedKeys.has(key))
    );

    if (newProps.size === 0) return;

    newTween._targets.forEach((target, idx) => {
      const existing = this._targetMap.get(target);
      if (!existing) return;

      for (const tween of existing) {
        if (tween === newTween) continue;
        const tIdx = tween._targets?.indexOf(target);
        if (tIdx < 0 || !tween._descriptors[tIdx]) continue;

        for (const prop of newProps) {
          if (tween._descriptors[tIdx][prop]) {
            delete tween._descriptors[tIdx][prop];
          }
        }
      }
    });
  }
  /** Update global defaults */
  setDefaults(defaults) {
    Object.assign(this.defaults, defaults);
  }

  /** Get snapshot of all active tweens */
  getAll() {
    return Array.from(this._tweens);
  }
}

// Singleton
export const tweenManager = new TweenManager();
export default tweenManager;

// Tween Lifecycle Hooks
export const tweenInitHooks = [];
export function registerTweenHook(hookFn) {
  if (!tweenInitHooks.includes(hookFn)) tweenInitHooks.push(hookFn);
}