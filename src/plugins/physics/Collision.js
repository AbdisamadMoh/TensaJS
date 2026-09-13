import { applyProperty, prepareProperty } from '../../core/CSSPlugin.js';
import { resolveTargets, isElementLike, getOwnerWindow } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { parseCurrentValue, resolveBoundsForEl, resolveContainer } from './utils.js';

/**
 * 2D Elastic Collision (Billiards)
 * 
 * Simulates perfectly elastic (or inelastic) collisions between multiple circular elements.
 * 
 * @param {string|Element|Array} targets 
 * @param {Object} config - { friction=0.98, restitution=1.0, bounds={left, right, top, bottom}, onCollide, onWallBounce, onUpdate }
 */
export function applyCollision(targets, config = {}) {
  const elements = resolveTargets(targets);
  
  const friction = config.friction ?? 0.99;
  const restitution = config.restitution ?? 1.0;
  let bounds = null;
  const onCollide = config.onCollide ?? null;
  const onWallBounce = config.onWallBounce ?? null;
  
  // Initialize state
  const state = elements.map(el => {
    const rect = el.getBoundingClientRect();
    return {
      el,
      x: parseCurrentValue(el, 'x'),
      y: parseCurrentValue(el, 'y'),
      vx: 0,
      vy: 0,
      width: rect.width,
      height: rect.height,
      radius: rect.width / 2, 
      mass: 1,
      // Store their static layout center so we can calculate true visual distance later
      baseX: el.offsetLeft + rect.width / 2,
      baseY: el.offsetTop + rect.height / 2
    };
  });

  // Just store the container element/object - bounds are computed live each tick.
  bounds = resolveContainer(config.bounds, elements[0]);
  const win = getOwnerWindow(elements[0]);
  
  // Keep track of layout changes (window resize, scroll, orientation change)
  // so that balls positioned with percentages (%) don't detach from their physics hitboxes.
  const updateBases = () => {
    state.forEach(s => {
      const rect = s.el.getBoundingClientRect();
      s.baseX = s.el.offsetLeft + rect.width / 2;
      s.baseY = s.el.offsetTop + rect.height / 2;
      s.width = rect.width;
      s.height = rect.height;
      s.radius = rect.width / 2;
    });
  };

  const resizeObserver = new ResizeObserver(() => updateBases());
  if (isElementLike(bounds)) {
    resizeObserver.observe(bounds);
  } else if (elements.length > 0 && elements[0].parentElement) {
    resizeObserver.observe(elements[0].parentElement);
  }
  
  // Scroll capture phase listener to update positions immediately if the page scrolls
  win.addEventListener('scroll', updateBases, { capture: true, passive: true });
  win.addEventListener('resize', updateBases, { passive: true });

  let tickerRemover = null;

  // Wake: add engine to the RAF loop
  const wake = () => {
    if (!tickerRemover) tickerRemover = ticker.add(step);
  };

  // Sleep: remove from RAF loop to stop burning CPU and prevent float drift
  const sleep = () => {
    if (tickerRemover) { tickerRemover(); tickerRemover = null; }
  };
  
  const step = (time, delta) => {
    // Pure time-based integration (seconds)
    const actualDt = Math.min(delta / 1000, 0.05); 
    
    // 1. Update dragged elements once per frame
    state.forEach(s => {
      if (s.isDragged) {
        // Sync the physics state with the manual drag position!
        s.x = parseCurrentValue(s.el, 'x');
        s.y = parseCurrentValue(s.el, 'y');
        
        // Derive drag velocity from actual pixel movement this frame.
        if (s.prevX !== undefined && actualDt > 0) {
          s.dragVx = (s.x - s.prevX) / actualDt;
          s.dragVy = (s.y - s.prevY) / actualDt;
        } else {
          s.dragVx = 0;
          s.dragVy = 0;
        }
        // Always record position for next tick's drag velocity
        s.prevX = s.x;
        s.prevY = s.y;
      }
    });
    
    // Sub-stepping to prevent tunneling at high throw velocities
    const SUBSTEPS = 3;
    const dt = actualDt / SUBSTEPS;
    
    for (let stepIdx = 0; stepIdx < SUBSTEPS; stepIdx++) {
      
      // 2. Integration
      state.forEach(s => {
        if (!s.isDragged) {
          const damping = Math.pow(friction, dt * 60);
          s.vx *= damping;
          s.vy *= damping;
          
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          
          if (Math.abs(s.vx) < 5) s.vx = 0; 
          if (Math.abs(s.vy) < 5) s.vy = 0;
        }
      });
      
      // 3. Check wall collisions
      if (bounds) {
        state.forEach(s => {
          if (s.isDragged) return;
  
          // Walk offsetParent chain to get the element's current layout offset
          const blimits = resolveBoundsForEl(s.el, bounds);
          const txMin = blimits.minX;
          const txMax = blimits.maxX;
          const tyMin = blimits.minY;
          const tyMax = blimits.maxY;
          
          if (s.x < txMin) {
            s.x = txMin;
            s.vx = -s.vx * restitution;
            if (onWallBounce && Math.abs(s.vx) > 10) onWallBounce(s.el, 'left', Math.abs(s.vx));
          } else if (s.x > txMax) {
            s.x = txMax;
            s.vx = -s.vx * restitution;
            if (onWallBounce && Math.abs(s.vx) > 10) onWallBounce(s.el, 'right', Math.abs(s.vx));
          }
          
          if (s.y < tyMin) {
            s.y = tyMin;
            s.vy = -s.vy * restitution;
            if (onWallBounce && Math.abs(s.vy) > 10) onWallBounce(s.el, 'top', Math.abs(s.vy));
          } else if (s.y > tyMax) {
            s.y = tyMax;
            s.vy = -s.vy * restitution;
            if (onWallBounce && Math.abs(s.vy) > 10) onWallBounce(s.el, 'bottom', Math.abs(s.vy));
          }
        });
      }
      
      // 4. Resolve circle-circle elastic collisions
      for (let i = 0; i < state.length; i++) {
        for (let j = i + 1; j < state.length; j++) {
           const p1 = state[i];
           const p2 = state[j];
           
           // Calculate true visual distance using base layout positions + current transform
           const cx1 = p1.baseX + p1.x;
           const cy1 = p1.baseY + p1.y;
           const cx2 = p2.baseX + p2.x;
           const cy2 = p2.baseY + p2.y;
           
           const dx = cx2 - cx1;
           const dy = cy2 - cy1;
           const distSq = dx*dx + dy*dy;
           const minDist = p1.radius + p2.radius;
           
           if (distSq < minDist * minDist && distSq > 0) {
             const dist = Math.sqrt(distSq);
             const overlap = minDist - dist;
             
             const nx = dx / dist;
             const ny = dy / dist;
             
             // Inverse mass (if dragged, mass is infinite so invMass is 0)
             const m1 = p1.isDragged ? 0 : 1;
             const m2 = p2.isDragged ? 0 : 1;
             const sumM = m1 + m2;
             
             if (sumM === 0) continue; // both are dragged, do nothing
             
             // Positional correction (prevent sinking) scaled by 0.8 to prevent jitter
             const correction = (overlap * 0.8) / sumM;
             if (!p1.isDragged) {
               p1.x -= nx * correction * m1;
               p1.y -= ny * correction * m1;
             }
             if (!p2.isDragged) {
               p2.x += nx * correction * m2;
               p2.y += ny * correction * m2;
             }
             
             // Calculate relative velocity.
             const v1x = p1.isDragged ? (p1.dragVx ?? 0) : p1.vx;
             const v1y = p1.isDragged ? (p1.dragVy ?? 0) : p1.vy;
             
             const v2x = p2.isDragged ? (p2.dragVx ?? 0) : p2.vx;
             const v2y = p2.isDragged ? (p2.dragVy ?? 0) : p2.vy;
             
             const dvx = v1x - v2x;
             const dvy = v1y - v2y;
             const velAlongNormal = dvx * nx + dvy * ny;
             
             // Do not resolve if velocities are already separating them
             if (velAlongNormal < 0) continue; 
             
             // Impulse scalar based on inverse mass
             const impulse = -(1 + restitution) * velAlongNormal / sumM;
             
             if (!p1.isDragged) {
               p1.vx += impulse * nx * m1;
               p1.vy += impulse * ny * m1;
             }
             if (!p2.isDragged) {
               p2.vx -= impulse * nx * m2;
               p2.vy -= impulse * ny * m2;
             }
  
             if (onCollide && Math.abs(velAlongNormal) > 10) {
               onCollide(p1.el, p2.el, Math.abs(velAlongNormal));
             }
           }
        }
      }
    } // End of sub-steps
    
    // 4. Render back to the DOM via Tensa Transform Cache
    state.forEach(s => {
       const descX = prepareProperty(s.el, 'x', s.x, s.x);
       const descY = prepareProperty(s.el, 'y', s.y, s.y);
       applyProperty(s.el, descX, 1);
       applyProperty(s.el, descY, 1);
    });

    config.onUpdate?.(state);

    // 5. Auto-sleep: if all non-dragged balls are at rest, remove from ticker.
    //    This prevents CPU burn and floating-point drift when nothing is moving.
    const isAnyDragged = state.some(s => s.isDragged);
    const allResting = state.every(s => Math.abs(s.vx) < 0.5 && Math.abs(s.vy) < 0.5);
    const allSettled = !isAnyDragged && allResting;
    if (allSettled) sleep();
  };
  
  wake(); // Start immediately to resolve initial positions
  
  return {
    kill() { 
      if (tickerRemover) tickerRemover(); 
      if (resizeObserver) resizeObserver.disconnect();
      win.removeEventListener('scroll', updateBases, { capture: true, passive: true });
      win.removeEventListener('resize', updateBases, { passive: true });
    },
    get state() { return state; },
    
    setDragged(el, isDragged) {
      const s = state.find(item => item.el === el);
      if (s) {
         s.isDragged = isDragged;
         if (isDragged) {
           s.vx = 0; s.vy = 0;
           wake(); // Stay awake while user is dragging
         } else {
           // Release: inherit tracked drag velocity, then wake so physics can take over
           s.vx = s.dragVx || 0;
           s.vy = s.dragVy || 0;
           if (Math.abs(s.vx) > 0.5 || Math.abs(s.vy) > 0.5) wake();
         }
      }
    },
    
    injectVelocity(el, vx, vy) {
      const s = state.find(item => item.el === el);
      if (s && !s.isDragged) {
         s.vx += vx;
         s.vy += vy;
         wake(); // Always wake when velocity is injected
      }
    }
  };
}
