import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveTargets, getOwnerWindow } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { parseCurrentValue, resolveContainer } from './utils.js';

/**
 * Orbital / Planetary Dynamics
 * 
 * Operates in two modes:
 * 1. Kinematic Mode: If 'radius' is provided, elements rigidly rotate around the target using trigonometry.
 * 2. Physics Mode: By default, elements are pulled towards the target using an inverse-square Newtonian gravity model (1/r^2).
 * 
 * @param {string|Element|NodeList|Array} target The orbiting elements
 * @param {Object} config
 * @param {string|Element|Object} [config.center='pointer'] The anchor point
 * @param {number} [config.radius] Activates kinematic mode. Fixed orbital distance.
 * @param {number} [config.radiusX] Kinematic elliptical horizontal radius.
 * @param {number} [config.radiusY] Kinematic elliptical vertical radius.
 * @param {number} [config.speed=1] Kinematic angular velocity (radians/sec).
 * @param {number} [config.angle] Kinematic starting angle (radians). Defaults to evenly distributed.
 * @param {number} [config.gravity=500000] Physics mode gravitational constant.
 * @param {number} [config.friction=1.0] Physics mode velocity multiplier (decay).
 * @param {boolean} [config.autoOrbit=true] Physics mode: injects initial tangential velocity for stable circular orbit.
 * @param {boolean} [config.autoRotate=true] Automatically rotates elements to face their heading.
 * @param {number} [config.trackingLerp] Smooths how quickly the anchor point (pointer or target element) catches up each frame, from 0 (frozen) to 1 (instant, the default).
 * @returns {{kill: Function}}
 */
export function applyOrbit(target, config = {}) {
  const targets = resolveTargets(target);
  if (targets.length === 0) return { kill: () => {} };

  // Gravity constant (G * M). Default is quite large because it drops off exponentially.
  const gravity = config.gravity ?? 500000; 
  const friction = config.friction ?? 1.0;
  // Softening parameter to prevent singularity slingshots (division by near-zero)
  const softening = config.softening ?? 30;
  const autoOrbit = config.autoOrbit !== false;
  const autoRotate = config.autoRotate !== false;
  const trackingLerp = config.trackingLerp;
  let smoothX = null, smoothY = null;
  
  // If radius is defined, we use kinematic orbit (trigonometry) instead of Newtonian physics
  const isKinematic = config.radius !== undefined || config.radiusX !== undefined || config.mode === 'kinematic';

  const container = targets.length > 0 ? targets[0].parentElement : null;
  const win = getOwnerWindow(targets[0]);

  let maxHalfW = 0;
  let maxHalfH = 0;

  // Initialize state
  const states = targets.map((el, i) => {
    maxHalfW = Math.max(maxHalfW, el.offsetWidth / 2);
    maxHalfH = Math.max(maxHalfH, el.offsetHeight / 2);
    const x = parseCurrentValue(el, 'x') ?? 0;
    const y = parseCurrentValue(el, 'y') ?? 0;
    // For kinematic, spread elements evenly if angle isn't provided
    const angle = config.angle !== undefined ? config.angle : (i * (Math.PI * 2) / targets.length);
    return { el, layoutX: 0, layoutY: 0, x, y, vx: 0, vy: 0, angle };
  });

  let isPointer = config.center === 'pointer' || !config.center;
  let clientX = -9999;
  let clientY = -9999;

  let targetEl = null;
  let targetLayoutX = 0;
  let targetLayoutY = 0;

  if (!isPointer && config.center) {
    targetEl = resolveTargets(config.center)[0];
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
  win.addEventListener('resize', calculateLayout);

  let isRunning = false;
  let tickerRemover = null;
  let hasInjectedOrbit = false;

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

      if (config.bounds) {
        const bCont = resolveContainer(config.bounds, targets[0]);
        if (bCont) {
          if (bCont.minX !== undefined || bCont.maxX !== undefined || bCont.minY !== undefined || bCont.maxY !== undefined) {
            targetX = Math.max(bCont.minX ?? -Infinity, Math.min(targetX, bCont.maxX ?? Infinity));
            targetY = Math.max(bCont.minY ?? -Infinity, Math.min(targetY, bCont.maxY ?? Infinity));
          } else if (bCont === win) {
            const paddingX = (isKinematic ? (config.radiusX ?? config.radius ?? 100) : 0) + maxHalfW;
            const paddingY = (isKinematic ? (config.radiusY ?? config.radius ?? 100) : 0) + maxHalfH;
            const localMinX = -rect.left + paddingX;
            const localMinY = -rect.top + paddingY;
            const localMaxX = (-rect.left + win.innerWidth) - paddingX;
            const localMaxY = (-rect.top + win.innerHeight) - paddingY;
            targetX = Math.max(localMinX, Math.min(targetX, localMaxX));
            targetY = Math.max(localMinY, Math.min(targetY, localMaxY));
          } else if (bCont.getBoundingClientRect) {
            const bRect = bCont.getBoundingClientRect();
            const paddingX = (isKinematic ? (config.radiusX ?? config.radius ?? 100) : 0) + maxHalfW;
            const paddingY = (isKinematic ? (config.radiusY ?? config.radius ?? 100) : 0) + maxHalfH;
            const localMinX = (bRect.left - rect.left) + paddingX;
            const localMinY = (bRect.top - rect.top) + paddingY;
            const localMaxX = (bRect.left - rect.left + bRect.width) - paddingX;
            const localMaxY = (bRect.top - rect.top + bRect.height) - paddingY;
            targetX = Math.max(localMinX, Math.min(targetX, localMaxX));
            targetY = Math.max(localMinY, Math.min(targetY, localMaxY));
          }
        }
      }
    }

    // Smooth the anchor point toward its raw tracked position instead of snapping instantly
    if (targetX !== -9999 && trackingLerp !== undefined) {
      if (smoothX === null) { smoothX = targetX; smoothY = targetY; }
      smoothX += (targetX - smoothX) * trackingLerp;
      smoothY += (targetY - smoothY) * trackingLerp;
      targetX = smoothX;
      targetY = smoothY;
    }

    if (targetX !== -9999 && !hasInjectedOrbit && autoOrbit && !isKinematic) {
      // Inject tangential velocity on the very first frame we have a valid target!
      states.forEach(s => {
        s.px = s.layoutX + s.x;
        s.py = s.layoutY + s.y;
        const dx = s.px - targetX;
        const dy = s.py - targetY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 5) {
          // Stable circular orbit math accounting for softening
          // Centripetal acceleration a = v^2 / r
          // Gravity acceleration a = G / (r^2 + soften^2)
          // v = sqrt(a * r)
          const acceleration = gravity / ((dist * dist) + (softening * softening));
          const vOrbit = Math.sqrt(acceleration * dist);
          
          // Calculate perpendicular vector for tangential motion
          const tangentX = -dy / dist;
          const tangentY = dx / dist;
          
          s.vx = tangentX * vOrbit;
          s.vy = tangentY * vOrbit;
        }
      });
      hasInjectedOrbit = true;
    }

    if (isKinematic) {
      const radiusX = config.radiusX ?? config.radius ?? 100;
      const radiusY = config.radiusY ?? config.radius ?? 100;
      const speed = config.speed ?? 1;

      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        if (targetX !== -9999) {
          s.angle += speed * dt;
          
          const px = targetX + Math.cos(s.angle) * radiusX;
          const py = targetY + Math.sin(s.angle) * radiusY;

          s.x = px - s.layoutX;
          s.y = py - s.layoutY;
          
          const transformState = getTransformState(s.el);
          transformState.x = s.x;
          transformState.y = s.y;
          
          if (autoRotate) {
             // +90 degrees so the "top" of the element faces the direction of travel
             transformState.rotation = (s.angle * 180 / Math.PI) + 90;
          }
          
          s.el.style.transform = buildTransformString(transformState);
        }
      }
    } else {
      // Newtonian Physics Mode
      for (let i = 0; i < states.length; i++) {
        const s = states[i];

        s.px = s.layoutX + s.x;
        s.py = s.layoutY + s.y;

        if (targetX !== -9999) {
          const dx = s.px - targetX;
          const dy = s.py - targetY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Prevent singularities (infinite gravity if perfectly overlapping)
          if (dist > 5) {
            // Newtonian Gravity with softening to prevent slingshots
            // Acceleration = G * m2 / (r^2 + softening^2)
            const acceleration = gravity / ((dist * dist) + (softening * softening));
            
            // Vector pointing TOWARDS the center
            const accX = -acceleration * (dx / dist);
            const accY = -acceleration * (dy / dist);
            
            s.vx += accX * dt;
            s.vy += accY * dt;
          }
        }

        s.vx *= friction;
        s.vy *= friction;

        s.x += s.vx * dt;
        s.y += s.vy * dt;

        const transformState = getTransformState(s.el);
        transformState.x = s.x;
        transformState.y = s.y;

        if (autoRotate && (Math.abs(s.vx) > 1 || Math.abs(s.vy) > 1)) {
          const angle = Math.atan2(s.vy, s.vx) * (180 / Math.PI);
          transformState.rotation = angle;
        }

        s.el.style.transform = buildTransformString(transformState);
      }
    }

    config.onUpdate?.({ states, targetX, targetY });
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
      win.addEventListener('pointermove', onPointerMove);
      win.addEventListener('scroll', onScroll, { passive: true, capture: true });
      
      config._cleanup = () => {
        win.removeEventListener('pointermove', onPointerMove);
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
