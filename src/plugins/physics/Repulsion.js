import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveTargets, getOwnerWindow } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { parseCurrentValue, resolveContainer, resolveBoundsForEl } from './utils.js';

/**
 * Repulsion / Force Field (Anti-Gravity)
 * Elements scatter away from a repeller, but spring back to their resting origin.
 * 
 * @param {string|Element|Array} target The elements to be repelled
 * @param {Object} config
 */
export function applyRepulsion(target, config = {}) {
  const targets = resolveTargets(target);
  if (targets.length === 0) return { kill: () => {} };

  const stiffness = config.stiffness ?? 80;
  const damping = config.damping ?? 12;
  const mass = config.mass ?? 1;
  const radius = config.radius ?? 150;
  const strength = config.force ?? config.strength ?? 1000;
  const bounce = config.bounce ?? 0.5;
  const velocityFactor = config.velocityFactor ?? 0;
  const curl = config.curl ?? 0;

  const container = targets.length > 0 ? targets[0].parentElement : null;
  const boundsContainer = resolveContainer(config.bounds, targets[0]);

  // Initialize state
  const states = targets.map(el => {
    const x = parseCurrentValue(el, 'x') ?? 0;
    const y = parseCurrentValue(el, 'y') ?? 0;
    return { el, originX: x, originY: y, layoutX: 0, layoutY: 0, x, y, vx: 0, vy: 0 };
  });

  const sourceOption = config.source ?? config.repeller;
  let isPointer = sourceOption === 'pointer' || !sourceOption;
  let pointerX = -9999;
  let pointerY = -9999;

  let repellers = [];

  if (!isPointer && sourceOption) {
    repellers = resolveTargets(sourceOption).map(el => ({ 
      el, 
      layoutX: 0, 
      layoutY: 0,
      lastRepX: -9999,
      lastRepY: -9999,
      vx: 0,
      vy: 0
    }));
  }

  const calculateLayout = () => {
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    
    // We must temporarily remove the transforms to read their true resting DOM grid positions
    states.forEach(s => { s.el.style.transform = 'none'; });
    
    repellers.forEach(r => {
      r.prevTransform = r.el.style.transform;
      r.el.style.transform = 'none';
    });
    
    states.forEach(s => {
      const rect = s.el.getBoundingClientRect();
      s.layoutX = (rect.left + rect.width / 2) - containerRect.left;
      s.layoutY = (rect.top + rect.height / 2) - containerRect.top;
    });

    repellers.forEach(r => {
      const rect = r.el.getBoundingClientRect();
      r.layoutX = (rect.left + rect.width / 2) - containerRect.left;
      r.layoutY = (rect.top + rect.height / 2) - containerRect.top;
    });

    // Restore transforms
    // Phase 1: Read all transforms to prevent layout thrashing (batch reads)
    states.forEach(s => getTransformState(s.el));
    
    // Phase 2: Write all transforms (batch writes)
    states.forEach(s => {
      const transformState = getTransformState(s.el);
      s.el.style.transform = buildTransformString(transformState);
    });

    repellers.forEach(r => {
      r.el.style.transform = r.prevTransform;
      delete r.prevTransform;
    });
  };

  // Initial calculation
  calculateLayout();

  const win = getOwnerWindow(targets[0]);

  // Recalculate on window resize in case the grid wraps or shifts
  win.addEventListener('resize', calculateLayout);

  let clientX = -9999;
  let clientY = -9999;

  let isRunning = false;
  let tickerRemover = null;

  const startLoop = () => {
    if (isRunning) return;
    isRunning = true;
    tickerRemover = ticker.add(step);
  };

  const stopLoop = () => {
    if (!isRunning) return;
    if (tickerRemover) tickerRemover();
    tickerRemover = null;
    isRunning = false;
  };
  
  // Wakes up the loop if the user scrolls the page underneath a stationary mouse
  const onScroll = () => {
    if (isPointer && clientX !== -9999) startLoop();
  };

  const step = (time, delta) => {
    const dt = Math.min(delta / 1000, 0.05);
    let allSettled = true;

    let activeSources = [];

    if (repellers.length > 0) {
      repellers.forEach(r => {
        const rx = parseCurrentValue(r.el, 'x') ?? 0;
        const ry = parseCurrentValue(r.el, 'y') ?? 0;
        const repX = r.layoutX + rx;
        const repY = r.layoutY + ry;
        
        if (r.lastRepX !== -9999) {
          r.vx = (repX - r.lastRepX) / dt;
          r.vy = (repY - r.lastRepY) / dt;
        }
        r.lastRepX = repX;
        r.lastRepY = repY;
        
        activeSources.push({ x: repX, y: repY, vx: r.vx, vy: r.vy });
      });
    } else if (isPointer && clientX !== -9999 && container) {
      // Live read to perfectly support nested scrolling containers and window scrolling
      const rect = container.getBoundingClientRect();
      const repX = clientX - rect.left;
      const repY = clientY - rect.top;
      activeSources.push({ x: repX, y: repY, vx: 0, vy: 0 }); // Mouse velocity not tracked here yet
    }

    let boundsLimits = null;
    if (boundsContainer && targets[0]) {
      boundsLimits = resolveBoundsForEl(targets[0], boundsContainer);
    }

    for (let i = 0; i < states.length; i++) {
      const s = states[i];

      // 1. Calculate repulsion force from all active sources
      let repelForceX = 0;
      let repelForceY = 0;

      // The physical center of the element right now is its static layout position + its dynamic transform offset
      const currentPhysicalX = s.layoutX + s.x;
      const currentPhysicalY = s.layoutY + s.y;

      for (const source of activeSources) {
        const dx = currentPhysicalX - source.x;
        const dy = currentPhysicalY - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < radius) {
          let safeDist = dist;
          let safeDx = dx;
          let safeDy = dy;
          
          // Prevent division by zero equilibrium if source is dead-center
          if (dist === 0) {
            safeDist = 0.01;
            safeDx = (Math.random() - 0.5) * 0.01;
            safeDy = (Math.random() - 0.5) * 0.01;
          }

          const dirX = safeDx / safeDist;
          const dirY = safeDy / safeDist;

          let pushForce = strength * (1 - (safeDist / radius));

          // Add dynamic force based on the source's velocity towards the element
          if (velocityFactor > 0) {
            const velocityTowardsElement = (source.vx * dirX) + (source.vy * dirY);
            if (velocityTowardsElement > 0) {
              pushForce += velocityTowardsElement * velocityFactor;
            }
          }
          
          repelForceX += pushForce * dirX;
          repelForceY += pushForce * dirY;

          // Apply tangential "curl" force
          if (curl !== 0) {
            repelForceX += pushForce * curl * -dirY;
            repelForceY += pushForce * curl * dirX;
          }

          allSettled = false; // Never settle if inside any repulsion radius
        }
      }

      // 2. Calculate anchor spring force pulling back to origin
      const springX = -stiffness * (s.x - s.originX) - damping * s.vx;
      const springY = -stiffness * (s.y - s.originY) - damping * s.vy;

      // 3. Integrate forces
      const totalForceX = repelForceX + springX;
      const totalForceY = repelForceY + springY;

      s.vx += (totalForceX / mass) * dt;
      s.vy += (totalForceY / mass) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // Wall collisions
      if (boundsLimits) {
        if (s.x < boundsLimits.minX) {
          s.x = boundsLimits.minX;
          s.vx = Math.abs(s.vx) * bounce;
        } else if (s.x > boundsLimits.maxX) {
          s.x = boundsLimits.maxX;
          s.vx = -Math.abs(s.vx) * bounce;
        }

        if (s.y < boundsLimits.minY) {
          s.y = boundsLimits.minY;
          s.vy = Math.abs(s.vy) * bounce;
        } else if (s.y > boundsLimits.maxY) {
          s.y = boundsLimits.maxY;
          s.vy = -Math.abs(s.vy) * bounce;
        }
      }

      // Check if settled (only if outside repulsion radius)
      if (Math.abs(s.vx) > 0.1 || Math.abs(s.vy) > 0.1 || Math.abs(s.x - s.originX) > 0.1 || Math.abs(s.y - s.originY) > 0.1) {
        allSettled = false;
      }

      // Apply transform via shared cache
      const transformState = getTransformState(s.el);
      transformState.x = s.x;
      transformState.y = s.y;
      s.el.style.transform = buildTransformString(transformState);
    }

    config.onUpdate?.({ states });

    // We can auto-settle if we are NOT tracking elements constantly, AND all elements have returned perfectly to their origins.
    if (allSettled && repellers.length === 0) {
      stopLoop();
      config.onComplete?.({ states });
    }
  };

  const onPointerMove = (e) => {
    clientX = e.clientX;
    clientY = e.clientY;
    startLoop();
  };

  const onPointerLeave = () => {
    clientX = -9999;
    clientY = -9999;
  };

  if (isPointer) {
    if (states.length > 0 && container) {
      container.addEventListener('pointermove', onPointerMove);
      container.addEventListener('pointerleave', onPointerLeave);
      win.addEventListener('scroll', onScroll, { passive: true, capture: true });
      
      config._cleanup = () => {
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerleave', onPointerLeave);
        win.removeEventListener('scroll', onScroll, { capture: true });
        win.removeEventListener('resize', calculateLayout);
      };
    }
  } else {
    startLoop();
    config._cleanup = () => {
      win.removeEventListener('resize', calculateLayout);
    };
  }

  return {
    kill: () => {
      stopLoop();
      if (config._cleanup) config._cleanup();
    }
  };
}
