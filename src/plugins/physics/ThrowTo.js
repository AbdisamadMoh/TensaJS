import { applyProperty, prepareProperty } from '../../core/CSSPlugin.js';
import { resolveTargets } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { parseCurrentValue, resolveContainer, resolveBoundsForEl } from './utils.js';

/**
 * Simulate momentum, friction, and acceleration.
 * 
 * @param {string|Element} target
 * @param {Object} props - map of prop → { velocity, acceleration, friction, min, max, end }
 * @param {Object} [config]
 *   config.bounds: CSS selector or Element - auto-computes x/y wall limits (resize-safe).
 *   Per-prop min/max still works as a manual override.
 */
export function throwTo(target, props, config = {}) {
  const targets = resolveTargets(target);
  const container = resolveContainer(config.bounds, targets[0]);
  const state = {};

  for (const [prop, opts] of Object.entries(props)) {
    state[prop] = {
      velocity: opts.velocity ?? 0,
      acceleration: opts.acceleration ?? 0,
      friction: opts.friction ?? 0.85,
      min:      opts.min ?? -Infinity,
      max:      opts.max ?? Infinity,
      end:      opts.end ?? null,
      current:  opts.current ?? parseCurrentValue(targets[0], prop),
    };
  }

  let tickerRemover;

  const step = (time, delta) => {
    const dt = Math.min(delta / 1000, 0.05);

    // Recompute container bounds every tick (resize-safe)
    let boundsLimits = null;
    if (container && targets[0]) {
      boundsLimits = resolveBoundsForEl(targets[0], container);
    }

    let allSettled = true;

    for (const [prop, s] of Object.entries(state)) {
      if (Math.abs(s.velocity) < 0.1 && Math.abs(s.acceleration) < 0.1) {
        s.velocity = 0;
        if (s.end !== null) {
          s.current = s.end;
          targets.forEach(el => {
            const desc = prepareProperty(el, prop, s.current, s.current);
            applyProperty(el, desc, 1);
          });
        }
        continue;
      }
      allSettled = false;

      s.velocity += s.acceleration * dt;
      s.current += s.velocity * dt;
      s.velocity *= Math.pow(s.friction, dt * 60);

      // Apply bounds from container if available (overrides per-prop min/max)
      let min = s.min, max = s.max;
      if (boundsLimits) {
        if (prop === 'x') { min = boundsLimits.minX; max = boundsLimits.maxX; }
        if (prop === 'y') { min = boundsLimits.minY; max = boundsLimits.maxY; }
      }

      if (s.current < min) {
        if (config.onWallBounce && Math.abs(s.velocity) > 10) {
          config.onWallBounce(prop === 'x' ? 'left' : 'top', Math.abs(s.velocity));
        }
        s.current = min;
        s.velocity = Math.abs(s.velocity) * 0.3;
      }
      if (s.current > max) {
        if (config.onWallBounce && Math.abs(s.velocity) > 10) {
          config.onWallBounce(prop === 'x' ? 'right' : 'bottom', Math.abs(s.velocity));
        }
        s.current = max;
        s.velocity = -Math.abs(s.velocity) * 0.3;
      }

      targets.forEach(el => {
        const desc = prepareProperty(el, prop, s.current, s.current);
        applyProperty(el, desc, 1);
      });
    }

    config.onUpdate?.({ state, targets });

    if (allSettled && tickerRemover) {
      tickerRemover();
      config.onComplete?.({ state, targets });
    }
  };

  tickerRemover = ticker.add(step);

  return {
    kill() { if (tickerRemover) tickerRemover(); },
    get state() { return state; },
  };
}
