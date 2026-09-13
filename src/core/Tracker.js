/**
 * Tensa Tracker - High-frequency update helper
 * 
 * Creates a reusable single-argument setter function optimized for
 * rapid repeated calls (mouse-follow, scroll-linked, etc.)
 * 
 * Usage:
 *   const setX = Tensa.createTracker('#cursor', 'x', { duration: 0.3, ease: 'cubic.out' });
 *   document.addEventListener('mousemove', e => setX(e.clientX));
 */

import { Tween } from './Tween.js';
import { resolveTargets } from './TargetResolver.js';

/**
 * Create a fast setter for one or more properties.
 * 
 * @param {string|Element|Array} target
 * @param {string|string[]} prop - CSS property or array of properties
 * @param {Object} [config] - { duration, ease, overwrite }
 * @returns {Function} - setter: (...values) => void, also has .tween property
 */
export function createTracker(target, prop, config = {}) {
  const els = resolveTargets(target);
  const {
    duration = 0.3,
    ease = 'cubic.out',
    overwrite = 'auto',
  } = config;

  let currentTween = null;
  const isArray = Array.isArray(prop);

  function setter(...values) {
    const vars = {
      duration,
      ease,
      overwrite,
    };

    if (isArray) {
      for (let i = 0; i < prop.length; i++) {
        if (values[i] !== undefined) {
          vars[prop[i]] = values[i];
        }
      }
    } else {
      vars[prop] = values[0];
    }

    if (currentTween) {
      currentTween.retarget(vars);
    } else {
      currentTween = Tween.animate(els, vars);
      setter.tween = currentTween;
    }
    return currentTween;
  }

  setter.tween = null;
  return setter;
  
}

export default createTracker;
