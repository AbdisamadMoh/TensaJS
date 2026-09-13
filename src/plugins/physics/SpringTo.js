import { applyProperty, prepareProperty } from '../../core/CSSPlugin.js';
import { resolveTargets } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { parseCurrentValue } from './utils.js';

/**
 * Hooke's law spring simulation.
 * 
 * @param {string|Element} target
 * @param {Object} props - map of prop → endValue OR { end, velocity }
 * @param {Object} [config] - { stiffness=200, damping=15, mass=1 }
 */
export function springTo(target, props, config = {}) {
  const targets = resolveTargets(target);
  const state = {};
  
  for (const [prop, opts] of Object.entries(props)) {
    const isNum = typeof opts === 'number';
    state[prop] = {
      velocity: isNum ? 0 : (opts.velocity ?? 0),
      end:      isNum ? opts : (opts.end ?? 0),
      current:  parseCurrentValue(targets[0], prop),
    };
  }

  const stiffness = config.stiffness ?? 200;
  const damping   = config.damping ?? 15;
  const mass      = config.mass ?? 1;

  let tickerRemover;

  const step = (time, delta) => {
    const dt = Math.min(delta / 1000, 0.05);

    let allSettled = true;

    for (const [prop, s] of Object.entries(state)) {
      const displacement = s.current - s.end;
      const springForce  = -stiffness * displacement;
      const dampingForce = -damping * s.velocity;
      const force        = springForce + dampingForce;
      const acceleration = force / mass;

      s.velocity += acceleration * dt;
      s.current  += s.velocity * dt;

      if (Math.abs(s.velocity) > 0.1 || Math.abs(displacement) > 0.1) {
        allSettled = false;
      } else {
        s.current = s.end;
        s.velocity = 0;
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
