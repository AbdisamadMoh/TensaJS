import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveTargets } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { GRAVITY, parseCurrentValue } from './utils.js';

/**
 * Pendulum / Swing Physics
 * Simulates an object hanging and swinging from a pivot point.
 * Note: Requires CSS `transform-origin` to be set appropriately (e.g., `50% 0`).
 * 
 * @param {string|Element} target The element to swing
 * @param {Object} config
 */
export function applyPendulum(target, config = {}) {
  const targets = resolveTargets(target);
  if (targets.length === 0) return { kill: () => {} };
  const el = targets[0];

  const gravity = config.gravity ?? GRAVITY;
  const length = config.length ?? (el.clientHeight || 200); // pixels
  const friction = config.friction ?? 0.98; // Air resistance per frame

  // Allow horizontal gravity ('x') or a specific gravity angle (in degrees)
  // 'y' means resting at 0 deg, 'x' means resting at 90 deg.
  const direction = config.direction ?? 'y';
  let restDeg = 0;
  if (config.gravityAngle !== undefined) {
    restDeg = config.gravityAngle;
  } else if (direction === 'x') {
    restDeg = 90;
  }
  const gravityAngle = restDeg * (Math.PI / 180);

  // Starting state
  // If not explicitly provided, we attempt to parse the current CSS rotation
  let initialDeg = config.initialAngle ?? parseCurrentValue(el, 'rotation') ?? 0;
  
  // Convert degrees to radians for math
  let theta = initialDeg * (Math.PI / 180);
  let omega = config.initialVelocity ?? 0; // Angular velocity

  let tickerRemover;

  const step = (time, delta) => {
    const dt = Math.min(delta / 1000, 0.05);

    // Angular acceleration: alpha = -(g/L) * sin(theta - gravityAngle)
    const alpha = -(gravity / length) * Math.sin(theta - gravityAngle);

    // Integrate
    omega += alpha * dt;
    
    // Apply air friction (frame-rate independent approximation)
    omega *= Math.pow(friction, dt * 60);

    theta += omega * dt;

    // Convert back to degrees
    let deg = theta * (180 / Math.PI);

    // Settle check
    if (Math.abs(theta - gravityAngle) < 0.01 && Math.abs(omega) < 0.01) {
      deg = restDeg;
      theta = gravityAngle;
      omega = 0;
      
      if (tickerRemover) {
        tickerRemover();
        tickerRemover = null;
        config.onComplete?.({ rotation: deg });
      }
    }

    // Write through shared transform cache
    targets.forEach(t => {
      const state = getTransformState(t);
      state.rotation = deg;
      t.style.transform = buildTransformString(state);
    });

    config.onUpdate?.({ rotation: deg, angularVelocity: omega });
  };

  // If we are already at rest at our target angle, don't start the ticker
  if (Math.abs(theta - gravityAngle) < 0.01 && Math.abs(omega) < 0.01) {
    config.onComplete?.({ rotation: restDeg });
    return { kill: () => {} };
  }

  tickerRemover = ticker.add(step);
  return { kill: () => { if (tickerRemover) tickerRemover(); } };
}
