import { resolveTargets } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { parseCurrentValue } from './utils.js';

/**
 * Track the velocity of a property on an element.
 */
export function trackVelocity(target, propsList = ['x', 'y']) {
  const el = resolveTargets(target)[0];
  if (!el) return null;
  const props = (typeof propsList === 'string' ? propsList.split(',') : propsList).map(p => p.trim());
  
  const lastValues = {};
  const velocities = {};
  
  props.forEach(p => {
    lastValues[p] = parseCurrentValue(el, p);
    velocities[p] = 0;
  });

  const step = (time, delta) => {
    const dt = delta / 1000;
    if (dt > 0) {
      props.forEach(p => {
        const val = parseCurrentValue(el, p);
        const v = (val - lastValues[p]) / dt;
        velocities[p] = velocities[p] * 0.5 + v * 0.5; // smoothing
        lastValues[p] = val;
      });
    }
  };

  const tickerRemover = ticker.add(step);
  
  return {
    get(prop) { return velocities[prop] || 0; },
    kill() { tickerRemover(); }
  };
}
