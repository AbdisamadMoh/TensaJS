import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveTargets, getOwnerWindow } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { parseCurrentValue } from './utils.js';

/**
 * Normalizes a 2D vector and scales it to a max magnitude.
 */
function limitVector(vx, vy, maxMagnitude) {
  const mag = Math.sqrt(vx * vx + vy * vy);
  if (mag > maxMagnitude && mag > 0) {
    return { x: (vx / mag) * maxMagnitude, y: (vy / mag) * maxMagnitude };
  }
  return { x: vx, y: vy };
}

function normalizeVector(vx, vy) {
  const mag = Math.sqrt(vx * vx + vy * vy);
  if (mag > 0) return { x: vx / mag, y: vy / mag };
  return { x: 0, y: 0 };
}

/**
 * Flocking / Swarm Physics (Boids)
 * Elements organically flock together and chase a target.
 * 
 * @param {string|Element|Array} target The elements in the swarm
 * @param {Object} config
 */
export function applySwarm(target, config = {}) {
  const targets = resolveTargets(target);
  if (targets.length === 0) return { kill: () => {} };

  const perceptionRadius = config.perceptionRadius ?? 150;
  const maxSpeed = config.maxSpeed ?? 400;
  const maxForce = config.maxForce ?? 15;
  
  const wSeparation = config.separation ?? 1.5;
  const wAlignment = config.alignment ?? 1.0;
  const wCohesion = config.cohesion ?? 1.0;
  const wAttraction = config.attraction ?? 1.2;

  const autoRotate = config.autoRotate !== false;

  const container = targets.length > 0 ? targets[0].parentElement : null;

  // Initialize state
  const states = targets.map(el => {
    const x = parseCurrentValue(el, 'x') ?? 0;
    const y = parseCurrentValue(el, 'y') ?? 0;
    // Start with a small random velocity so they don't stack perfectly
    const vx = (Math.random() - 0.5) * 100;
    const vy = (Math.random() - 0.5) * 100;
    return { el, layoutX: 0, layoutY: 0, x, y, vx, vy };
  });

  let isPointer = config.target === 'pointer' || !config.target;
  let clientX = -9999;
  let clientY = -9999;

  let targetEl = null;
  let targetLayoutX = 0;
  let targetLayoutY = 0;

  if (!isPointer && config.target) {
    targetEl = resolveTargets(config.target)[0];
  }

  const calculateLayout = () => {
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    
    // Temporarily remove transforms to read resting DOM grid positions
    states.forEach(s => { s.el.style.transform = 'none'; });
    
    let prevTargetTransform = '';
    if (targetEl) {
      prevTargetTransform = targetEl.style.transform;
      targetEl.style.transform = 'none';
    }
    
    states.forEach(s => {
      const rect = s.el.getBoundingClientRect();
      s.layoutX = (rect.left + rect.width / 2) - containerRect.left;
      s.layoutY = (rect.top + rect.height / 2) - containerRect.top;
    });

    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      targetLayoutX = (rect.left + rect.width / 2) - containerRect.left;
      targetLayoutY = (rect.top + rect.height / 2) - containerRect.top;
    }

    // Restore transforms
    // Phase 1: Read all transforms to prevent layout thrashing (batch reads)
    states.forEach(s => getTransformState(s.el));
    
    // Phase 2: Write all transforms (batch writes)
    states.forEach(s => {
      const transformState = getTransformState(s.el);
      s.el.style.transform = buildTransformString(transformState);
    });

    if (targetEl) {
      targetEl.style.transform = prevTargetTransform;
    }
  };

  calculateLayout();
  const win = getOwnerWindow(targets[0]);
  win.addEventListener('resize', calculateLayout);

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

  const onScroll = () => {
    if (isPointer && clientX !== -9999) startLoop();
  };

  const step = (time, delta) => {
    const dt = Math.min(delta / 1000, 0.05);
    
    let targetX = -9999;
    let targetY = -9999;

    if (targetEl) {
      const rx = parseCurrentValue(targetEl, 'x') ?? 0;
      const ry = parseCurrentValue(targetEl, 'y') ?? 0;
      targetX = targetLayoutX + rx;
      targetY = targetLayoutY + ry;
    } else if (isPointer && clientX !== -9999 && container) {
      const rect = container.getBoundingClientRect();
      targetX = clientX - rect.left;
      targetY = clientY - rect.top;
    }

    // First pass: compute physical centers
    states.forEach(s => {
      s.px = s.layoutX + s.x;
      s.py = s.layoutY + s.y;
    });

    let allSettled = true;

    // Second pass: Boids algorithm
    for (let i = 0; i < states.length; i++) {
      const s = states[i];

      let sepX = 0, sepY = 0;
      let alignX = 0, alignY = 0;
      let cohX = 0, cohY = 0;
      let neighborCount = 0;

      for (let j = 0; j < states.length; j++) {
        if (i === j) continue;
        const other = states[j];
        const dx = s.px - other.px;
        const dy = s.py - other.py;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0 && dist < perceptionRadius) {
          // Separation: Steer away from neighbors
          const safeDist = dist === 0 ? 0.01 : dist;
          sepX += (dx / safeDist) / safeDist; // Closer = much stronger push
          sepY += (dy / safeDist) / safeDist;

          // Alignment: Average velocity
          alignX += other.vx;
          alignY += other.vy;

          // Cohesion: Average position
          cohX += other.px;
          cohY += other.py;

          neighborCount++;
        }
      }

      let accX = 0;
      let accY = 0;

      if (neighborCount > 0) {
        // Finalize separation
        let sepNorm = normalizeVector(sepX, sepY);
        accX += sepNorm.x * maxForce * wSeparation;
        accY += sepNorm.y * maxForce * wSeparation;

        // Finalize alignment (steer towards average velocity)
        alignX /= neighborCount;
        alignY /= neighborCount;
        let alignNorm = normalizeVector(alignX, alignY);
        accX += alignNorm.x * maxForce * wAlignment;
        accY += alignNorm.y * maxForce * wAlignment;

        // Finalize cohesion (steer towards center of mass)
        cohX /= neighborCount;
        cohY /= neighborCount;
        let cohSteerX = cohX - s.px;
        let cohSteerY = cohY - s.py;
        let cohNorm = normalizeVector(cohSteerX, cohSteerY);
        accX += cohNorm.x * maxForce * wCohesion;
        accY += cohNorm.y * maxForce * wCohesion;
      }

      // Attraction to target
      if (targetX !== -9999) {
        const dx = targetX - s.px;
        const dy = targetY - s.py;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);
        
        // If we are super close to the target, ease off the gas to settle
        const approachScale = Math.min(distToTarget / 50, 1.0); 
        
        let attNorm = normalizeVector(dx, dy);
        accX += attNorm.x * maxForce * wAttraction * approachScale;
        accY += attNorm.y * maxForce * wAttraction * approachScale;
      }

      // Add a tiny bit of friction so they eventually settle if target is stationary
      s.vx *= 0.98;
      s.vy *= 0.98;

      // Apply acceleration to velocity
      s.vx += accX;
      s.vy += accY;

      // Limit max speed
      const v = limitVector(s.vx, s.vy, maxSpeed);
      s.vx = v.x;
      s.vy = v.y;

      // Update position
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (Math.abs(s.vx) > 0.5 || Math.abs(s.vy) > 0.5) {
        allSettled = false;
      }

      const transformState = getTransformState(s.el);
      transformState.x = s.x;
      transformState.y = s.y;
      
      if (autoRotate && (Math.abs(s.vx) > 1 || Math.abs(s.vy) > 1)) {
        // Math.atan2 returns radians. Convert to degrees.
        // Add 90 degrees if your SVG/element points "up" by default.
        // We will assume 0 degrees = facing right.
        const angle = Math.atan2(s.vy, s.vx) * (180 / Math.PI);
        transformState.rotation = angle;
      }
      
      s.el.style.transform = buildTransformString(transformState);
    }

    config.onUpdate?.({ states });

    // Swarms buzz continuously, but if they reach the target and friction slows them perfectly, they can settle.
    if (allSettled && !targetEl) {
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
