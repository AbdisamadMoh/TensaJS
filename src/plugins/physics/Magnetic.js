import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveTargets } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';

/**
 * Magnetic Pull (Attract & Repel) Physics
 * Continuously springs an element towards the pointer when hovered,
 * and springs back to its origin when the pointer leaves.
 * 
 * @param {string|Element} target The element to move
 * @param {Object} config
 */
export function applyMagnetic(target, config = {}) {
  const elements = resolveTargets(target);
  if (elements.length === 0) return { kill: () => {} };
  const el = elements[0];

  // The area that detects the mouse. Defaults to the element itself.
  const trigger = config.trigger ? resolveTargets(config.trigger)[0] : el;
  
  // Settings
  const power = config.power ?? 0.4;   // 0.4 means it moves 40% of the distance to the mouse
  const radius = config.radius ?? 0;   // 0 means it reacts anywhere inside the trigger
  const stiffness = config.stiffness ?? 150;
  const damping = config.damping ?? 15;
  const mass = config.mass ?? 1;

  // Physics state
  const initialState = getTransformState(el);
  const originX = initialState.x || 0;
  const originY = initialState.y || 0;

  let targetX = originX;
  let targetY = originY;
  let x = originX;
  let y = originY;
  let vx = 0;
  let vy = 0;

  let isHovered = false;
  let isRunning = false;
  let tickerRemover = null;
  
  // Track whether the pointer is physically inside the interaction radius
  let isInsideRadius = false;

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

  const step = (time, delta) => {
    const dt = Math.min(delta / 1000, 0.05);

    // Spring forces (Hooke's Law: F = -kx - cv)
    const forceX = -stiffness * (x - targetX) - damping * vx;
    const forceY = -stiffness * (y - targetY) - damping * vy;

    const ax = forceX / mass;
    const ay = forceY / mass;

    vx += ax * dt;
    vy += ay * dt;

    x += vx * dt;
    y += vy * dt;

    // Apply transform via shared cache to allow composability
    const state = getTransformState(el);
    state.x = x;
    state.y = y;
    el.style.transform = buildTransformString(state);

    config.onUpdate?.({ x, y });

    // Settle check (when mouse leaves and element returns to origin)
    if (!isHovered && Math.abs(x - originX) < 0.1 && Math.abs(y - originY) < 0.1 && Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) {
      x = originX;
      y = originY;
      vx = 0;
      vy = 0;
      
      const finalState = getTransformState(el);
      finalState.x = originX;
      finalState.y = originY;
      el.style.transform = buildTransformString(finalState);
      
      stopLoop();
    }
  };

  const onPointerMove = (e) => {
    const rect = trigger.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const distX = e.clientX - centerX;
    const distY = e.clientY - centerY;
    
    const distance = Math.sqrt(distX * distX + distY * distY);

    if (radius > 0 && distance > radius) {
      targetX = originX;
      targetY = originY;
      isHovered = false;
      
      if (isInsideRadius) {
        isInsideRadius = false;
        config.onLeave?.();
      }
      
      startLoop(); // Ensure it springs back
    } else {
      targetX = originX + distX * power;
      targetY = originY + distY * power;
      isHovered = true;
      
      if (!isInsideRadius) {
        isInsideRadius = true;
        config.onEnter?.();
      }
      
      startLoop();
    }
  };

  const onPointerLeave = () => {
    targetX = originX;
    targetY = originY;
    isHovered = false;
    
    if (isInsideRadius) {
      isInsideRadius = false;
      config.onLeave?.();
    }
    
    startLoop(); // Ensure it springs back to origin
  };

  trigger.addEventListener('pointermove', onPointerMove);
  trigger.addEventListener('pointerleave', onPointerLeave);

  return {
    kill: () => {
      stopLoop();
      trigger.removeEventListener('pointermove', onPointerMove);
      trigger.removeEventListener('pointerleave', onPointerLeave);
    }
  };
}
