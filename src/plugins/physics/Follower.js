import { getTransformState, buildTransformString } from '../../core/CSSPlugin.js';
import { resolveTargets, getOwnerWindow } from '../../core/TargetResolver.js';
import ticker from '../../core/Ticker.js';
import { parseCurrentValue } from './utils.js';

/**
 * Rubber-Band Chaining (Follower Physics)
 * Links multiple elements together with springs so they trail behind a leader.
 * 
 * @param {string|Element|Array} target The element(s) that will follow
 * @param {Object} config
 */
export function applyFollower(target, config = {}) {
  const targets = resolveTargets(target);
  if (targets.length === 0) return { kill: () => {} };

  const stiffness = config.stiffness ?? 120;
  const damping = config.damping ?? 14;
  const mass = config.mass ?? 1;

  // Initialize state for each follower
  const states = targets.map(el => ({
    el,
    x: parseCurrentValue(el, 'x') ?? 0,
    y: parseCurrentValue(el, 'y') ?? 0,
    layoutX: el.offsetLeft + (el.offsetWidth / 2),
    layoutY: el.offsetTop + (el.offsetHeight / 2),
    vx: 0,
    vy: 0
  }));

  let isPointer = config.leader === 'pointer';
  let pointerX = 0;
  let pointerY = 0;

  // Optional DOM element leader
  let leaderEl = null;
  let leaderLayoutX = 0;
  let leaderLayoutY = 0;
  if (!isPointer && config.leader) {
    leaderEl = resolveTargets(config.leader)[0];
    if (leaderEl) {
      leaderLayoutX = leaderEl.offsetLeft + (leaderEl.offsetWidth / 2);
      leaderLayoutY = leaderEl.offsetTop + (leaderEl.offsetHeight / 2);
    }
  }

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

  const step = (time, delta) => {
    const dt = Math.min(delta / 1000, 0.05);
    let allSettled = true;

    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      let absTargetX, absTargetY;

      if (i === 0) {
        // The first element follows the defined leader
        if (isPointer) {
          absTargetX = pointerX;
          absTargetY = pointerY;
        } else if (leaderEl) {
          // It follows a specific DOM element's absolute position
          absTargetX = leaderLayoutX + (parseCurrentValue(leaderEl, 'x') ?? 0);
          absTargetY = leaderLayoutY + (parseCurrentValue(leaderEl, 'y') ?? 0);
        } else {
          // Static head
          s.x = parseCurrentValue(s.el, 'x') ?? 0;
          s.y = parseCurrentValue(s.el, 'y') ?? 0;
          continue; 
        }
      } else {
        // Elements i >= 1 follow the absolute position of the element immediately in front of them
        absTargetX = states[i - 1].layoutX + states[i - 1].x;
        absTargetY = states[i - 1].layoutY + states[i - 1].y;
      }

      // Spring math using absolute screen coordinates
      const currentAbsX = s.layoutX + s.x;
      const currentAbsY = s.layoutY + s.y;

      const forceX = -stiffness * (currentAbsX - absTargetX) - damping * s.vx;
      const forceY = -stiffness * (currentAbsY - absTargetY) - damping * s.vy;

      s.vx += (forceX / mass) * dt;
      s.vy += (forceY / mass) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (Math.abs(s.vx) > 0.1 || Math.abs(s.vy) > 0.1 || Math.abs(currentAbsX - absTargetX) > 0.1 || Math.abs(currentAbsY - absTargetY) > 0.1) {
        allSettled = false;
      }

      // Apply transform via shared cache
      const transformState = getTransformState(s.el);
      transformState.x = s.x;
      transformState.y = s.y;
      s.el.style.transform = buildTransformString(transformState);
    }

    config.onUpdate?.({ states });

    // We only auto-settle if we are NOT tracking the pointer (since the pointer can move at any time)
    // and if we are NOT tracking an external leader element.
    // If we have an external leader, we must run infinitely because we don't know when the leader stops.
    // However, if we just have a static chain (no leader), we can settle.
    if (allSettled && !isPointer && !leaderEl) {
      stopLoop();
      config.onComplete?.({ states });
    }
  };

  let clientX = -9999;
  let clientY = -9999;

  const updatePointerCoords = () => {
    if (clientX === -9999) return;
    const rect = states[0].el.parentElement.getBoundingClientRect();
    pointerX = clientX - rect.left;
    pointerY = clientY - rect.top;
  };

  const onPointerMove = (e) => {
    clientX = e.clientX;
    clientY = e.clientY;
    updatePointerCoords();
    startLoop();
  };

  const onScroll = () => {
    updatePointerCoords();
    startLoop();
  };

  if (isPointer) {
    const listenTarget = config.bounds ? resolveTargets(config.bounds)[0] : getOwnerWindow(targets[0]);
    if (listenTarget) {
      const win = getOwnerWindow(targets[0]);
      listenTarget.addEventListener('pointermove', onPointerMove);
      win.addEventListener('scroll', onScroll, { passive: true, capture: true });
      startLoop();
      config._cleanup = () => {
        listenTarget.removeEventListener('pointermove', onPointerMove);
        win.removeEventListener('scroll', onScroll, { capture: true });
      };
    }
  } else {
    // If tracking a DOM element or static chain, run the loop
    startLoop();
  }

  return {
    kill: () => {
      stopLoop();
      if (config._cleanup) config._cleanup();
    }
  };
}
