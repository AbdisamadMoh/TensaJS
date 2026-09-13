import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveTargets, isElementLike, getOwnerWindow } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { parseCurrentValue } from './utils.js';

/**
 * Tether / Bungee Cord Physics
 * Elements float freely until they exceed a certain distance from the target, 
 * at which point an elastic spring snaps them back.
 * 
 * @param {string|Element|Array} target The elements attached to the tether
 * @param {Object} config
 */
export function applyTether(target, config = {}) {
  const targets = resolveTargets(target);
  if (targets.length === 0) return { kill: () => {} };

  const length = config.length ?? 150;
  const stiffness = config.stiffness ?? 150;
  const damping = config.damping ?? 10;
  const mass = config.mass ?? 1;
  const gravity = config.gravity ?? 0;
  const direction = config.direction ?? 'y';
  
  let gAngle = 90;
  if (config.gravityAngle !== undefined) {
    gAngle = config.gravityAngle;
  } else {
    if (direction === 'x') gAngle = 0;
    else if (direction === '-x') gAngle = 180;
    else if (direction === '-y') gAngle = 270;
  }
  const gravityRad = gAngle * (Math.PI / 180);
  const gravityForceX = gravity * Math.cos(gravityRad);
  const gravityForceY = gravity * Math.sin(gravityRad);

  const airFriction = config.airFriction ?? 0.98;

  const container = targets.length > 0 ? targets[0].parentElement : null;

  // Initialize state
  const states = targets.map(el => {
    const x = parseCurrentValue(el, 'x') ?? 0;
    const y = parseCurrentValue(el, 'y') ?? 0;
    return { el, layoutX: 0, layoutY: 0, x, y, vx: 0, vy: 0 };
  });

  let isPointer = config.target === 'pointer' || !config.target;
  let clientX = -9999;
  let clientY = -9999;

  let targetEl = null;
  let staticTarget = null;
  let targetLayoutX = 0;
  let targetLayoutY = 0;

  if (!isPointer && config.target) {
    const targets = resolveTargets(config.target);
    if (targets.length > 0) {
      if (isElementLike(targets[0])) {
        targetEl = targets[0];
      } else if (typeof targets[0] === 'object' && targets[0] !== null) {
        staticTarget = targets[0];
      }
    }
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
    } else if (staticTarget) {
      targetLayoutX = staticTarget.x || 0;
      targetLayoutY = staticTarget.y || 0;
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
    } else if (staticTarget) {
      targetX = staticTarget.x !== undefined ? staticTarget.x : targetLayoutX;
      targetY = staticTarget.y !== undefined ? staticTarget.y : targetLayoutY;
    } else if (isPointer && container) {
      if (clientX !== -9999) {
        const rect = container.getBoundingClientRect();
        targetX = clientX - rect.left;
        targetY = clientY - rect.top;
      } else {
        targetX = container.offsetWidth / 2;
        targetY = 0;
      }
    }

    let allSettled = true;

    for (let i = 0; i < states.length; i++) {
      const s = states[i];

      // Physical center of the element right now
      s.px = s.layoutX + s.x;
      s.py = s.layoutY + s.y;

      let forceX = gravityForceX * mass;
      let forceY = gravityForceY * mass;

      if (targetX !== -9999) {
        const dx = targetX - s.px;
        const dy = targetY - s.py;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // If distance exceeds tether length, bungee cord snaps tight!
        if (dist > length) {
          const stretch = dist - length;
          const pull = stiffness * stretch;
          
          forceX += pull * (dx / dist);
          forceY += pull * (dy / dist);
          allSettled = false;
        }
      }

      // Add damping against current velocity (internal friction of the cord)
      forceX -= damping * s.vx;
      forceY -= damping * s.vy;

      // Integrate
      s.vx += (forceX / mass) * dt;
      s.vy += (forceY / mass) * dt;
      
      // Air friction (gradually slows down free-floating elements)
      s.vx *= airFriction;
      s.vy *= airFriction;

      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // Check if settled (if no gravity, and no target movement, it will eventually stop)
      if (Math.abs(s.vx) > 0.5 || Math.abs(s.vy) > 0.5) {
        allSettled = false;
      }
      // If gravity is applied, it will hang indefinitely. We consider it "unsettled" 
      // if it hasn't reached an equilibrium.
      // But for simplicity, we just check velocity. A hanging mass eventually reaches vx=0, vy=0.

      // Apply transform via shared cache
      const transformState = getTransformState(s.el);
      transformState.x = s.x;
      transformState.y = s.y;
      s.el.style.transform = buildTransformString(transformState);
    }

    if (config.onUpdate) {
      // Pass the live calculated targetX/targetY so users can draw a line to it!
      config.onUpdate({ states, targetX, targetY });
    }

    if (allSettled && !targetEl && targetX === -9999) {
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
    const listenTarget = config.bounds ? resolveTargets(config.bounds)[0] : win;
    if (states.length > 0 && listenTarget) {
      listenTarget.addEventListener('pointermove', onPointerMove);
      listenTarget.addEventListener('pointerleave', onPointerLeave);
      win.addEventListener('scroll', onScroll, { passive: true, capture: true });
      
      config._cleanup = () => {
        listenTarget.removeEventListener('pointermove', onPointerMove);
        listenTarget.removeEventListener('pointerleave', onPointerLeave);
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
