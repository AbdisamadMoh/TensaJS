import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveTargets } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { GRAVITY, parseCurrentValue, resolveContainer, resolveBoundsForEl } from './utils.js';

/**
 * Viscous Fluid Drag Physics
 * Simulates movement through physical fluids (water, syrup) where
 * resistance grows quadratically with speed, creating a "Terminal Velocity".
 * 
 * @param {string|Element} target
 * @param {Object} config - { gravity, direction, gravityAngle, drag, mass, bounce, bounds, floor, initialVelocityX, initialVelocityY, onWallBounce, onUpdate, onComplete }
 *   direction: 'y' (default, pulls downward) | 'x' (pulls rightward)
 *   gravityAngle: degrees - 90 = down, 0 = right, 180 = left, 270 = up. Overrides direction.
 *   bounds: CSS selector or Element - auto-computes all 4 walls (resize-safe).
 *   floor: raw fallback number for the far boundary.
 */
export function applyFluidDrag(target, config = {}) {
  const targets = resolveTargets(target);
  if (targets.length === 0) return { kill: () => {} };

  const gravity = config.gravity ?? GRAVITY;
  const direction = config.direction ?? 'y';
  let gAngle = 90; // degrees; 90 = down, 0 = right
  if (config.gravityAngle !== undefined) {
    gAngle = config.gravityAngle;
  } else if (direction === 'x') {
    gAngle = 0;
  }
  const gravRad = gAngle * (Math.PI / 180);
  const gx = gravity * Math.cos(gravRad);
  const gy = gravity * Math.sin(gravRad);
  const isHorizontal = Math.abs(gx) >= Math.abs(gy);
  const drag = config.drag ?? 0.002;
  const mass = config.mass ?? 1;
  const bounce = config.bounce ?? 0.5;
  const container = resolveContainer(config.bounds, targets[0]);

  let x = parseCurrentValue(targets[0], 'x') ?? 0;
  let y = parseCurrentValue(targets[0], 'y') ?? 0;
  
  let vx = config.initialVelocityX ?? 0;
  let vy = config.initialVelocityY ?? 0;

  let tickerRemover;

  const step = (time, delta) => {
    const dt = Math.min(delta / 1000, 0.05);

    // Recompute bounds from container every tick (resize-safe)
    let minX = -Infinity, maxX = Infinity, minY = -Infinity, maxY = Infinity;
    if (container) {
      const b = resolveBoundsForEl(targets[0], container);
      minX = b.minX; maxX = b.maxX;
      minY = b.minY; maxY = b.maxY;
    } else if (config.floor !== undefined) {
      if (isHorizontal) maxX = config.floor;
      else maxY = config.floor;
    }

    // Explicit Euler integration is highly sensitive to time-step variations,
    // especially with quadratic drag forces. We use fixed sub-stepping 
    // to stabilize the numerical integration and ensure deterministic distances.
    const SUBSTEPS = 4;
    const subDt = dt / SUBSTEPS;

    let hitWall = null;
    let hitWallVel = 0;

    for (let i = 0; i < SUBSTEPS; i++) {
      // Calculate current scalar speed
      const speed = Math.sqrt(vx * vx + vy * vy);

      // Quadratic Drag Force: F = -C * v^2
      const dragForceX = -drag * speed * vx;
      const dragForceY = -drag * speed * vy;

      const ax = gx + (dragForceX / mass);
      const ay = gy + (dragForceY / mass);

      vx += ax * subDt;
      vy += ay * subDt;

      x += vx * subDt;
      y += vy * subDt;

      // Wall collisions
      if (x < minX) {
        if (!hitWall && Math.abs(vx) > 10) { hitWall = 'left'; hitWallVel = Math.abs(vx); }
        x = minX; vx = -vx * bounce;
      } else if (x > maxX) {
        if (!hitWall && Math.abs(vx) > 10) { hitWall = 'right'; hitWallVel = Math.abs(vx); }
        x = maxX; 
        vx = -vx * bounce;
        if (isHorizontal) {
          vy *= 0.8; // floor friction on Y
          if (Math.abs(vx) < 20) { vx = 0; }
        }
      }

      if (y < minY) {
        if (!hitWall && Math.abs(vy) > 10) { hitWall = 'top'; hitWallVel = Math.abs(vy); }
        y = minY; vy = -vy * bounce;
      } else if (y > maxY) {
        if (!hitWall && Math.abs(vy) > 10) { hitWall = 'bottom'; hitWallVel = Math.abs(vy); }
        y = maxY;
        vy = -vy * bounce;
        if (!isHorizontal) {
          vx *= 0.8; // floor friction on X
          if (Math.abs(vy) < 20) { vy = 0; }
        }
      }
    }

    if (hitWall && config.onWallBounce) {
      config.onWallBounce(hitWall, hitWallVel);
    }

    // Write through shared transform cache
    targets.forEach(el => {
      const state = getTransformState(el);
      state.x = x;
      state.y = y;
      el.style.transform = buildTransformString(state);
    });

    config.onUpdate?.({ x, y, vx, vy });

    // Settle check
    const isAtRest = Math.abs(vx) < 1 && Math.abs(vy) < 1;
    const isRestingOnFloor = gravity > 0 && (isHorizontal ? x >= maxX - 1 : y >= maxY - 1);
    const isRestingOnCeiling = gravity < 0 && (isHorizontal ? x <= minX + 1 : y <= minY + 1);

    if (isAtRest && (gravity === 0 || isRestingOnFloor || isRestingOnCeiling)) {
      vx = 0;
      vy = 0;
      if (tickerRemover) {
        tickerRemover();
        config.onComplete?.({ x, y });
      }
    }
  };

  tickerRemover = ticker.add(step);

  return {
    kill: () => { if (tickerRemover) tickerRemover(); }
  };
}
