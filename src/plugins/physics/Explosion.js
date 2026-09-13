import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveContainer, resolveBoundsForEl } from './utils.js';
import { resolveTargets } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { tweenManager } from '../../core/TweenManager.js';

/**
 * Apply explosion / radial impulse physics.
 * @param {string|Element|Array} target - Elements to explode.
 * @param {Object} config - { force, forceVariation, decay, gravity, direction, gravityAngle, floor, restitution, spin, radius, originX, originY, bounds, onUpdate }
 *   direction: 'y' (default, pulls downward) | 'x' (pulls rightward)
 *   gravityAngle: degrees - 90 = down, 0 = right, 180 = left, 270 = up. Overrides direction.
 */
export function applyExplosion(target, config = {}) {
  const targets = resolveTargets(target);
  if (targets.length === 0) return;

  const force = config.force ?? 1000;
  const decay = config.decay ?? 0.95;
  const gravity = config.gravity ?? 0;
  const floor = config.floor ?? Infinity;
  const restitution = config.restitution ?? 0.5;
  const spin = config.spin ?? 360;
  const radius = config.radius ?? Infinity;
  const boundsEl = resolveContainer(config.bounds, targets[0]);

  const direction = config.direction ?? 'y';
  let gAngle = 90; // degrees; 90 = straight down, 0 = right
  if (config.gravityAngle !== undefined) {
    gAngle = config.gravityAngle;
  } else if (direction === 'x') {
    gAngle = 0;
  }
  const gravRad = gAngle * (Math.PI / 180);
  const gx = gravity * Math.cos(gravRad);
  const gy = gravity * Math.sin(gravRad);

  // Stop current tweens so they don't fight physics
  tweenManager.stop(targets);

  // If no origin provided, compute center of all bounding boxes
  let originX = config.originX;
  let originY = config.originY;

  if (originX === undefined || originY === undefined) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    targets.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.left < minX) minX = rect.left;
      if (rect.right > maxX) maxX = rect.right;
      if (rect.top < minY) minY = rect.top;
      if (rect.bottom > maxY) maxY = rect.bottom;
    });
    originX = originX ?? (minX + maxX) / 2;
    originY = originY ?? (minY + maxY) / 2;
  }

  // Calculate initial trajectories
  const particles = targets.map(el => {
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = centerX - originX;
    const dy = centerY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let vx = 0;
    let vy = 0;
    let va = 0; // Angular velocity

    if (dist <= radius) {
      let dirX, dirY;
      if (dist === 0) {
        const angle = Math.random() * Math.PI * 2;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      } else {
        dirX = dx / dist;
        dirY = dy / dist;
      }

      // Distance falloff (if radius is provided, closer = harder push)
      const intensity = radius === Infinity ? 1 : 1 - (dist / radius);
      
      // Randomize force slightly if they want
      const particleForce = force * (1 - (Math.random() * (config.forceVariation ?? 0.2)));

      vx = dirX * particleForce * intensity;
      vy = dirY * particleForce * intensity;
      va = (Math.random() - 0.5) * spin * 2 * intensity;
    }

    const state = getTransformState(el);

    return {
      el,
      state,
      x: state.x ?? 0,
      y: state.y ?? 0,
      rotation: state.rotation ?? 0,
      vx,
      vy,
      va,
      active: dist <= radius // Only track if it got an impulse
    };
  });

  let tickerRemover;
  let lastTime = performance.now();

  const step = (time, delta) => {
    const dt = Math.min(delta / 1000, 0.05); // Cap dt
    lastTime = time;

    let activeCount = 0;

    particles.forEach(p => {
      if (!p.active) return;

      // Gravity (directional)
      if (gravity > 0) {
        p.vx += gx * dt;
        p.vy += gy * dt;
      }

      // Air friction / decay
      p.vx *= decay;
      p.vy *= decay;
      if (gravity > 0) {
        // Extra damping on the axis perpendicular to the primary gravity direction
        if (Math.abs(gy) >= Math.abs(gx)) {
          p.vx *= decay; // downward-ish gravity: extra horizontal friction
        } else {
          p.vy *= decay; // sideways gravity: extra vertical friction
        }
      }
      p.va *= decay;

      // Velocity integration
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.va * dt;

      // Bounds
      let bMinX = -Infinity, bMaxX = Infinity, bMinY = -Infinity, bMaxY = floor;

      if (boundsEl) {
        const blimits = resolveBoundsForEl(p.el, boundsEl);
        bMinX = blimits.minX;
        bMaxX = blimits.maxX;
        bMinY = blimits.minY;
        bMaxY = Math.min(bMaxY, blimits.maxY);
      }

      // X-axis collision
      if (p.x <= bMinX) {
        p.x = bMinX;
        p.vx = -p.vx * restitution;
        p.va *= 0.8;
      } else if (p.x >= bMaxX) {
        p.x = bMaxX;
        p.vx = -p.vx * restitution;
        p.va *= 0.8;
      }

      // Y-axis collision
      if (p.y <= bMinY) {
        p.y = bMinY;
        p.vy = -p.vy * restitution;
        p.va *= 0.8;
      } else if (p.y >= bMaxY) {
        p.y = bMaxY;
        p.vy = -p.vy * restitution;
        p.vx *= 0.8; // ground friction
        p.va *= 0.8;
      }

      // Update transform
      p.state.x = p.x;
      p.state.y = p.y;
      p.state.rotation = p.rotation;
      p.el.style.transform = buildTransformString(p.state);

      // Sleep threshold
      const speed = Math.abs(p.vx) + Math.abs(p.vy);
      if (speed < 5 && Math.abs(p.va) < 5 && (gravity === 0 || p.y >= bMaxY - 1 || p.y <= bMinY + 1 || p.x <= bMinX + 1 || p.x >= bMaxX - 1)) {
        p.active = false;
      } else {
        activeCount++;
      }
    });

    config.onUpdate?.(particles);

    if (activeCount === 0 && tickerRemover) {
      tickerRemover();
    }
  };

  tickerRemover = ticker.add(step);

  return {
    kill: () => {
      if (tickerRemover) {
        tickerRemover();
        tickerRemover = null;
      }
    }
  };
}
