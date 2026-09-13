import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveTargets } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { GRAVITY, parseCurrentValue, resolveContainer, resolveBoundsForEl } from './utils.js';

/**
 * Simulates a block sliding down an inclined plane.
 * @param {string|Element} target
 * @param {Object} config - { gravity, angle, friction, floorY, bounds, direction, gravityAngle, initialVelocity, onFloorHit, onUpdate, onComplete }
 *   bounds: CSS selector or Element - auto-computes floor from it (resize-safe).
 *   floorY: raw fallback number.
 *   direction: 'y' (default, down) | 'x' (right) | '-x' (left) | '-y' (up). Overridden by gravityAngle.
 */
export function applySlide(target, config = {}) {
  const targets = resolveTargets(target);
  const gravity  = config.gravity ?? GRAVITY;
  const angle    = config.angle ?? 45;
  const friction = config.friction ?? 1;
  const container = resolveContainer(config.bounds, targets[0]);

  // Allow custom gravity direction. 'y' = 90 deg (down), 'x' = 0 deg (right)
  const direction = config.direction ?? 'y';
  let gAngle = 90;
  if (config.gravityAngle !== undefined) {
    gAngle = config.gravityAngle;
  } else if (direction === 'x') {
    gAngle = 0;
  } else if (direction === '-x') {
    gAngle = 180;
  } else if (direction === '-y') {
    gAngle = 270;
  }
  const gravityRad = gAngle * (Math.PI / 180);
  const rad = angle * (Math.PI / 180);

  // Compute acceleration along the slope using dot product of gravity and slope vectors
  const gx = gravity * Math.cos(gravityRad);
  const gy = gravity * Math.sin(gravityRad);
  const sx = Math.cos(rad);
  const sy = Math.sin(rad);
  const slopeAcceleration = gx * sx + gy * sy;

  let v = config.initialVelocity ?? 0;
  let x = parseCurrentValue(targets[0], 'x') ?? 0;
  let y = parseCurrentValue(targets[0], 'y') ?? 0;

  let tickerRemover;

  const step = (time, delta) => {
    const dt = Math.min(delta / 1000, 0.05);

    // Recompute floor from container every tick (resize-safe)
    let floorY = config.floorY;
    if (container) {
      const b = resolveBoundsForEl(targets[0], container);
      floorY = b.maxY;
    }

    v = (v * friction) + (slopeAcceleration * dt);
    
    const vx = v * Math.cos(rad);
    const vy = v * Math.sin(rad);

    x += vx * dt;
    y += vy * dt;

    if (floorY !== undefined && y >= floorY) {
      if (config.onFloorHit && v > 10) config.onFloorHit({ v, vx, vy });
      if (vy !== 0) {
        const dtOver = (y - floorY) / vy;
        x -= vx * dtOver;
      }
      y = floorY;
      if (tickerRemover) {
        tickerRemover();
        config.onComplete?.({ x, y, v, vx, vy });
      }
      v = 0;
    }

    targets.forEach(el => {
      const state = getTransformState(el);
      state.x = x;
      state.y = y;
      el.style.transform = buildTransformString(state);
    });

    config.onUpdate?.({ x, y, v });
  };

  tickerRemover = ticker.add(step);
  return { kill: () => { if (tickerRemover) tickerRemover(); } };
}
