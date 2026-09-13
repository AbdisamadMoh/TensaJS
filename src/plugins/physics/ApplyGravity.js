import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveTargets, getOwnerWindow } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { GRAVITY, parseCurrentValue, resolveContainer, resolveBoundsForEl } from './utils.js';

/**
 * Apply gravity simulation.
 * @param {string|Element} target
 * @param {Object} config - { gravity, direction, gravityAngle, bounce, floor, ceiling, bounds, initialVelocityY, initialVelocityX, onBounce, onUpdate, onComplete }
 *   direction: 'y' (default, pulls downward) | 'x' (pulls rightward)
 *   gravityAngle: degrees - 90 = down, 0 = right, 180 = left, 270 = up. Overrides direction.
 *   bounds: a CSS selector or Element - auto-computes all 4 walls (resize-safe).
 *   floor / ceiling: raw transform-space fallback numbers for the primary gravity axis (used when bounds is absent).
 */
export function applyGravity(target, config = {}) {
  const targets   = resolveTargets(target);
  const gravity   = config.gravity ?? GRAVITY;
  const bounce    = config.bounce  ?? 0.6;
  const container = resolveContainer(config.bounds, targets[0]);

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

  // Raw fallbacks (used only when bounds is absent), computed once along the primary axis
  const win = getOwnerWindow(targets[0]);
  const fallbackFloor   = config.floor   ?? (isHorizontal ? win.innerWidth  - 50 : win.innerHeight - 50);
  const fallbackCeiling = config.ceiling ?? undefined;

  let x  = parseCurrentValue(targets[0], 'x') ?? 0;
  let y  = parseCurrentValue(targets[0], 'y') ?? 0;
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
    } else {
      if (isHorizontal) maxX = fallbackFloor;
      else maxY = fallbackFloor;
      if (fallbackCeiling !== undefined) {
        if (isHorizontal) minX = fallbackCeiling;
        else minY = fallbackCeiling;
      }
    }

    vx += gx * dt;
    vy += gy * dt;
    x  += vx * dt;
    y  += vy * dt;

    let hitSide = null;
    let impactV = 0;

    if (x >= maxX) {
      x = maxX; vx = -vx * bounce;
      if (Math.abs(vx) < 20) vx = 0;
      hitSide = 'floor'; impactV = Math.abs(vx);
    } else if (x <= minX) {
      x = minX; vx = -vx * bounce;
      hitSide = 'ceiling'; impactV = Math.abs(vx);
    }

    if (y >= maxY) {
      y = maxY; vy = -vy * bounce;
      if (Math.abs(vy) < 20) vy = 0;
      hitSide = hitSide ?? 'floor'; impactV = Math.max(impactV, Math.abs(vy));
    } else if (y <= minY) {
      y = minY; vy = -vy * bounce;
      hitSide = hitSide ?? 'ceiling'; impactV = Math.max(impactV, Math.abs(vy));
    }

    if (config.onBounce && hitSide && impactV > 10) config.onBounce(hitSide, impactV);

    targets.forEach(el => {
      const state = getTransformState(el);
      state.x = x;
      state.y = y;
      el.style.transform = buildTransformString(state);
    });

    config.onUpdate?.({ x, y, vx, vy });

    const isAtRest           = Math.abs(vx) < 1 && Math.abs(vy) < 1;
    const isRestingOnFloor   = gravity >= 0 && (isHorizontal ? x >= maxX - 1 : y >= maxY - 1);
    const isRestingOnCeiling = gravity <  0 && (isHorizontal ? x <= minX + 1 : y <= minY + 1);

    if (isAtRest && (isRestingOnFloor || isRestingOnCeiling) && tickerRemover) {
      vx = 0; vy = 0;
      tickerRemover();
      config.onComplete?.({ x, y });
    }
  };

  tickerRemover = ticker.add(step);
  return { kill: () => { if (tickerRemover) tickerRemover(); } };
}
