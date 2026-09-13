/**
 * Tensa Interactable Plugin
 * 
 * Drag-and-drop with inertia/momentum, bounds, snap, axis locking, and touch support.
 * Events: onPress, onDragStart, onDrag, onDragEnd, onRelease, onSnap
 */

import { Tween } from '../core/Tween.js';
import { tweenManager } from '../core/TweenManager.js';
import { getTransformState, buildTransformString } from '../core/CSSPlugin.js';
import { reportError } from '../core/Config.js';
import { resizeManager } from '../core/ResizeManager.js';
import { isElementLike, getOwnerDocument, getOwnerWindow, isShadowRootLike } from '../core/TargetResolver.js';

const instances = new Set();

export class Interactable {
  /**
   * @param {string|Element} target
   * @param {Object} [config]
   * @param {string} [config.type='x,y'] - 'x' | 'y' | 'x,y' | 'rotation'
   * @param {Object|Element|string} [config.bounds] - {left, top, right, bottom} | Element | selector
   * @param {Function|Array|number} [config.snap] - snap targets, function, or pixel grid
   * @param {boolean|number} [config.inertia=false] - momentum after release
   * @param {number} [config.edgeResistance=0.85] - 0-1 resistance at bounds
   * @param {Function} [config.onPress]
   * @param {Function} [config.onDragStart]
   * @param {Function} [config.onDrag]
   * @param {Function} [config.onDragEnd]
   * @param {Function} [config.onRelease]
   */
  constructor(target, config = {}) {
    this.target = typeof target === 'string'
      ? document.querySelector(target) : target;

    if (!this.target) {
      reportError(`[Tensa] Interactable: target not found: ${target}`);
      return;
    }

    this._win = getOwnerWindow(this.target);
    this._doc = getOwnerDocument(this.target);

    this.config = {
      type:            config.type ?? 'x,y',
      bounds:          config.bounds ?? null,
      snap:            config.snap ?? null,
      inertia:         config.inertia ?? false,
      friction:        config.friction ?? 0.92,
      bounce:          config.bounce ?? 0,
      edgeResistance:  config.edgeResistance ?? 0.85,
      liveSnap:        config.liveSnap ?? false,
      cursor:          config.cursor ?? 'grab',
      activeCursor:    config.activeCursor ?? 'grabbing',
      minimumMovement: config.minimumMovement ?? 2,
      delay:           config.delay ?? 0,
      delayOnTouchOnly: config.delayOnTouchOnly ?? true,
      autoScroll:      config.autoScroll ?? false,
      scrollThreshold: config.scrollThreshold ?? 40,
      scrollSpeed:     config.scrollSpeed ?? 15,
      scrollTarget:    config.scrollTarget ?? null,
      scrollContainer: config.scrollContainer ?? null,
      onScrollSync:    config.onScrollSync ?? null,
    };

    const types = this.config.type.split(',').map(s => s.trim());
    this._lockX = !types.includes('x') && !types.includes('x,y');
    this._lockY = !types.includes('y') && !types.includes('x,y');
    this._rotationMode = types.includes('rotation');

    // Callbacks
    this.onPress     = config.onPress     ?? null;
    this.onDragStart = config.onDragStart ?? null;
    this.onDrag      = config.onDrag      ?? null;
    this.onDragEnd   = config.onDragEnd   ?? null;
    this.onRelease   = config.onRelease   ?? null;
    this.onSnap      = config.onSnap      ?? null;

    // State
    const ts = getTransformState(this.target);
    this.x = ts.x || 0;
    this.y = ts.y || 0;
    this.rotation = ts.rotation || 0;
    
    this._isDragging = false;
    this._isPressed  = false;
    this._startX = 0;
    this._startY = 0;
    this._startPointerX = 0;
    this._startPointerY = 0;
    this._velX = 0;
    this._velY = 0;
    this._lastX = 0;
    this._lastY = 0;
    this._lastTime = 0;
    this._bounds = null;
    this._scrollContainer = null;
    this._autoScrollRAF = null;
    this._latestPointerEvent = null;

    this._onResize = () => {
      if (this.config.bounds) {
        this.applyBounds();
      }
    };

    this._setupTarget();
    this._bindEvents();
    this._resolveBounds();

    instances.add(this);
    resizeManager.add(this._onResize);
  }

  _setupTarget() {
    const el = this.target;
    el.style.cursor = this.config.cursor;
    el.style.userSelect = 'none';
    
    // Intelligently assign touch-action to allow native scrolling on the non-dragged axis!
    if (this.config.delay === 0) {
      if (this._lockY && !this._lockX) {
        el.style.touchAction = 'pan-y'; // Horizontal drag -> allow vertical scroll
      } else if (this._lockX && !this._lockY) {
        el.style.touchAction = 'pan-x'; // Vertical drag -> allow horizontal scroll
      } else {
        el.style.touchAction = 'none';  // Free drag -> no native scrolling
      }
    } else {
      // Prevent long-press context menus on mobile so they don't cancel the drag
      el.style.webkitTouchCallout = 'none';
      // For delayed drags, we allow native scroll initially
    }
    if (!el.style.position || el.style.position === 'static') {
      el.style.position = 'relative';
    }
  }

  _bindEvents() {
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp   = this._onPointerUp.bind(this);
    this._onTouchMove   = this._onTouchMove.bind(this);

    this.target.addEventListener('pointerdown', this._onPointerDown);
    this.target.addEventListener('contextmenu', e => {
      // Prevent long-press context menu on mobile from stealing the pointer
      if (this.config.delay > 0) e.preventDefault();
    });
    // MUST bind touchmove statically on the target. If bound dynamically during pointerdown, 
    // iOS Safari ignores e.preventDefault() because it already marked the gesture as passive!
    this.target.addEventListener('touchmove', this._onTouchMove, { passive: false });
  }

  _onPointerDown(e) {
    if (this._isPressed) return;
    
    // Check if we should delay the start (for touch scrolling)
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const shouldDelay = this.config.delay > 0 && (!this.config.delayOnTouchOnly || isTouch);

    this._startPointerX = e.clientX;
    this._startPointerY = e.clientY;

    if (shouldDelay) {
      this._delayTimeout = setTimeout(() => {
        this._delayTimeout = null;
        this._startDrag(e);
      }, this.config.delay);
    } else {
      e.preventDefault();
      this._startDrag(e);
    }

    this._win.addEventListener('pointermove', this._onPointerMove);
    this._win.addEventListener('pointerup',   this._onPointerUp);
    this._win.addEventListener('pointercancel', this._onPointerUp);
  }

  _startDrag(e) {
    this._isPressed = true;
    this._isDragging = false;
    this._latestPointerEvent = e;
    
    if (this.config.autoScroll) {
      if (this.config.scrollContainer) {
        this._scrollContainer = typeof this.config.scrollContainer === 'string' 
          ? this._doc.querySelector(this.config.scrollContainer) 
          : this.config.scrollContainer;
      } else {
        this._scrollContainer = getScrollParent(this.config.scrollTarget || this.target);
      }
      this._startAutoScrollLoop();
    }

    // Sync with actual element transform (e.g. if Physics engine moved it)
    const ts = getTransformState(this.target);
    this.x = ts.x || 0;
    this.y = ts.y || 0;
    this.rotation = ts.rotation || 0;

    this._startX = this.x;
    this._startY = this.y;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    this._velX = 0;
    this._velY = 0;
    this._lastTime = performance.now();

    if (this._rotationMode) {
      const rect = this.target.getBoundingClientRect();
      this._centerX = rect.left + rect.width / 2;
      this._centerY = rect.top + rect.height / 2;
      this._lastAngle = Math.atan2(e.clientY - this._centerY, e.clientX - this._centerX) * (180 / Math.PI);
      this._velRotation = 0;
    }

    this.target.style.cursor = this.config.activeCursor;
    try {
      this.target.setPointerCapture(e.pointerId);
    } catch (err) {}

    this._fireCallback('onPress', e);
  }

  _onPointerMove(e) {
    this._latestPointerEvent = e;
    
    if (this._delayTimeout) {
      // If they move too much before the delay finishes, cancel the delay (they are scrolling)
      const dx = e.clientX - this._startPointerX;
      const dy = e.clientY - this._startPointerY;
      // Allow slightly more jitter tolerance on touch screens during the delay phase
      const tolerance = (e.pointerType === 'touch' || e.pointerType === 'pen') ? 10 : this.config.minimumMovement;
      
      if (Math.hypot(dx, dy) > tolerance) {
        clearTimeout(this._delayTimeout);
        this._delayTimeout = null;
        this._cleanupEvents();
      }
      return;
    }

    if (!this._isPressed) return;

    const dx = e.clientX - this._startPointerX;
    const dy = e.clientY - this._startPointerY;

    if (!this._isDragging) {
      if (Math.hypot(dx, dy) < this.config.minimumMovement) return;

      // Directional Intent Detection:
      // If the user swipes in the locked direction, they are trying to scroll!
      // Yield control and let the browser take over.
      const isHorizontal = Math.abs(dx) > Math.abs(dy);
      if (this._lockY && !this._lockX && !isHorizontal) {
        this._isPressed = false;
        this._cleanupEvents();
        return;
      }
      if (this._lockX && !this._lockY && isHorizontal) {
        this._isPressed = false;
        this._cleanupEvents();
        return;
      }

      this._isDragging = true;
      this._fireCallback('onDragStart', e);
    }

    // Track velocity with a rolling average to prevent high-polling-rate mice 
    // from causing erratic 0-velocity drops if they pause for 1 millisecond.
    const now = performance.now();
    const dt  = now - this._lastTime || 16;
    const instantVelX = (e.clientX - this._lastX) / dt * 1000;
    const instantVelY = (e.clientY - this._lastY) / dt * 1000;
    
    // Blend 60% of current velocity with 40% of previous velocity
    this._velX = this._velX === 0 ? instantVelX : (this._velX * 0.4 + instantVelX * 0.6);
    this._velY = this._velY === 0 ? instantVelY : (this._velY * 0.4 + instantVelY * 0.6);
    
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    this._lastTime = now;

    let newX = this._lockX ? this.x : this._startX + dx;
    let newY = this._lockY ? this.y : this._startY + dy;

    if (this._rotationMode) {
      const angle = Math.atan2(e.clientY - this._centerY, e.clientX - this._centerX) * (180 / Math.PI);
      let deltaAngle = angle - this._lastAngle;
      if (deltaAngle > 180) deltaAngle -= 360;
      else if (deltaAngle < -180) deltaAngle += 360;
      
      this.rotation += deltaAngle;
      this._lastAngle = angle;
      this._velRotation = deltaAngle / dt * 1000;
    }

    // Apply bounds with edge resistance
    if (this._bounds) {
      const { minX, maxX, minY, maxY } = this._bounds;
      newX = this._applyResistance(newX, minX, maxX);
      newY = this._applyResistance(newY, minY, maxY);
    }

    // Live snap
    if (this.config.liveSnap && this.config.snap) {
      const snapped = this._snapValue(newX, newY);
      
      if (this._lastSnapTargetX !== snapped.x || this._lastSnapTargetY !== snapped.y) {
        this._lastSnapTargetX = snapped.x;
        this._lastSnapTargetY = snapped.y;

        const snapDuration = typeof this.config.liveSnap === 'object' ? (this.config.liveSnap.duration ?? 0.15) : 0.15;
        const snapEase = typeof this.config.liveSnap === 'object' ? (this.config.liveSnap.ease ?? 'cubic.out') : 'cubic.out';

        if (this._liveSnapTween) this._liveSnapTween.kill();
        this._liveSnapTween = Tween.animate(this.target, {
          x: snapped.x, y: snapped.y,
          duration: snapDuration,
          ease: snapEase,
          onUpdate: () => {
            const ts = getTransformState(this.target);
            this.x = ts.x;
            this.y = ts.y;
          }
        });
      }
    } else {
      this.x = newX;
      this.y = newY;
      this._applyTransform();
    }

    this._fireCallback('onDrag', e);
  }

  _cleanupEvents() {
    this._win.removeEventListener('pointermove', this._onPointerMove);
    this._win.removeEventListener('pointerup',   this._onPointerUp);
    this._win.removeEventListener('pointercancel', this._onPointerUp);
  }

  _onTouchMove(e) {
    // Only aggressively prevent default if we have confirmed the gesture is a drag,
    // OR if the user held past the delay threshold and we are pressed.
    // This allows the browser to smoothly take over native scrolling during the initial threshold.
    if (this._isDragging || (this._isPressed && this.config.delay > 0)) {
      if (e.cancelable) e.preventDefault();
    }
  }

  _onPointerUp(e) {
    if (this._delayTimeout) {
      clearTimeout(this._delayTimeout);
      this._delayTimeout = null;
      this._cleanupEvents();
      return;
    }

    if (!this._isPressed) return;
    this._stopAutoScrollLoop();
    this._isPressed = false;
    this.target.style.cursor = this.config.cursor;

    this._cleanupEvents();

    if (this._liveSnapTween) {
      this._liveSnapTween.kill();
      this._liveSnapTween = null;
    }

    this._fireCallback('onRelease', e);

    if (this._isDragging) {
      this._isDragging = false;

      const vX = this._velX || 0;
      const vY = this._velY || 0;
      const vR = this._velRotation || 0;

      const isHighVelocity = this.config.inertia && (Math.abs(vX) > 50 || Math.abs(vY) > 50 || Math.abs(vR) > 50);

      let isOutOfBounds = false;
      if (this._bounds) {
        const clamped = this._clampToBounds(this.x, this.y);
        if (Math.abs(clamped.x - this.x) > 0.5 || Math.abs(clamped.y - this.y) > 0.5) {
          isOutOfBounds = true;
        }
      }

      if (isHighVelocity) {
        // Let the physics engine handle the throw and any resulting bounces
        this._runInertia();
      } else if (isOutOfBounds) {
        // Low velocity but out of bounds: gently snap back
        this._landAndSnap();
      } else {
        // Low velocity inside bounds: just snap to grid (if configured)
        this._landAndSnap();
      }

      this._fireCallback('onDragEnd', e);
    }
  }

  _applyResistance(value, min, max) {
    if (value < min) return min + (value - min) * (1 - this.config.edgeResistance);
    if (value > max) return max + (value - max) * (1 - this.config.edgeResistance);
    return value;
  }

  _clampToBounds(x, y) {
    if (!this._bounds) return { x, y };
    const { minX, maxX, minY, maxY } = this._bounds;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }

  _runInertia() {
    // _velX and _velY are in px/s.
    let vx = this._lockX ? 0 : this._velX;
    let vy = this._lockY ? 0 : this._velY;
    let vr = this._lockRotation ? 0 : (this._velRotation || 0);
    
    const friction = this.config.friction;
    const bounce = this.config.bounce;
    let { x, y } = this;
    let lastTime = performance.now();

    const step = (time) => {
      // Normalize dt to 60fps (1.0 = 16.66ms). Cap at 2.0 to prevent huge jumps on lag spikes.
      const rawDt = time - lastTime;
      const dt = Math.min(rawDt / 16.666, 2.0);
      lastTime = time;

      // Apply friction scaling based on dt (friction^dt)
      const frictionMultiplier = Math.pow(friction, dt);
      vx *= frictionMultiplier;
      vy *= frictionMultiplier;
      vr *= frictionMultiplier;

      // Add velocity * dt (convert from px/s to px/frame essentially)
      x += (vx * 0.01666) * dt;
      y += (vy * 0.01666) * dt;
      this.rotation += (vr * 0.01666) * dt;

      if (this._bounds) {
        const { minX, maxX, minY, maxY } = this._bounds;
        let hitEdge = false;
        
        if (x < minX && vx < 0) { x = minX; vx *= -bounce; hitEdge = true; }
        else if (x > maxX && vx > 0) { x = maxX; vx *= -bounce; hitEdge = true; }
        
        if (y < minY && vy < 0) { y = minY; vy *= -bounce; hitEdge = true; }
        else if (y > maxY && vy > 0) { y = maxY; vy *= -bounce; hitEdge = true; }
        
        if (hitEdge && bounce === 0) {
           if (x <= minX || x >= maxX) vx = 0;
           if (y <= minY || y >= maxY) vy = 0;
        }
      }

      this.x = x;
      this.y = y;
      this._applyTransform();

      // Stop condition: speed in px/s drops below 10
      if (Math.abs(vx) > 10 || Math.abs(vy) > 10 || Math.abs(vr) > 10) {
        requestAnimationFrame(step);
      } else {
        this._landAndSnap();
      }
    };

    requestAnimationFrame(step);
  }

  _landAndSnap() {
    let finalX = this.x;
    let finalY = this.y;

    // 1. Clamp to bounds (if dragged outside via edgeResistance)
    if (this._bounds) {
      const clamped = this._clampToBounds(finalX, finalY);
      finalX = clamped.x;
      finalY = clamped.y;
    }

    // 2. Apply snap if configured
    if (this.config.snap) {
      const snapped = this._snapValue(finalX, finalY);
      finalX = snapped.x;
      finalY = snapped.y;
    }

    // If already exactly at the final resting place, no animation needed
    if (finalX === this.x && finalY === this.y) {
      this._fireCallback('onSnap');
      return;
    }

    // Animate to the clamped/snapped position
    Tween.animate(this.target, {
      x: finalX, y: finalY,
      duration: 0.3,
      ease: 'cubic.out',
      onComplete: () => {
        this.x = finalX;
        this.y = finalY;
        this._fireCallback('onSnap');
      },
    });
  }

  _snapValue(x, y) {
    const snap = this.config.snap;
    if (typeof snap === 'number') {
      return {
        x: Math.round(x / snap) * snap,
        y: Math.round(y / snap) * snap,
      };
    }
    if (typeof snap === 'function') {
      return snap({ x, y }) || { x, y };
    }
    if (Array.isArray(snap)) {
      // Find nearest snap point
      let best = snap[0], bestDist = Infinity;
      for (const point of snap) {
        const px = typeof point === 'number' ? point : point.x || 0;
        const py = typeof point === 'number' ? 0 : point.y || 0;
        const dist = Math.hypot(x - px, y - py);
        if (dist < bestDist) { bestDist = dist; best = point; }
      }
      if (typeof best === 'number') return { x: best, y: 0 };
      return { x: best.x || 0, y: best.y || 0 };
    }
    return { x, y };
  }

  _applyTransform() {
    const ts = getTransformState(this.target);
    ts.x = this.x;
    ts.y = this.y;
    ts.rotation = this.rotation;
    this.target.style.transform = buildTransformString(ts);
  }

  _resolveBounds() {
    const bounds = this.config.bounds;
    if (!bounds) return;

    if (typeof bounds === 'string' || isElementLike(bounds)) {
      const el = typeof bounds === 'string' ? this._doc.querySelector(bounds) : bounds;
      if (!el) return;

      // Sync internal x/y state from the actual CSS transform so that bounds
      // are correct even when a physics engine (e.g. Dynamics.applyGravity)
      // has moved the element since the last drag interaction.
      const ts = getTransformState(this.target);
      this.x = ts.x || 0;
      this.y = ts.y || 0;

      const elRect     = el.getBoundingClientRect();
      const targetRect = this.target.getBoundingClientRect();
      this._bounds = {
        minX: elRect.left - targetRect.left + this.x,
        maxX: elRect.right  - targetRect.right + this.x,
        minY: elRect.top  - targetRect.top + this.y,
        maxY: elRect.bottom - targetRect.bottom + this.y,
      };
    } else if (typeof bounds === 'object') {
      this._bounds = {
        minX: bounds.minX ?? bounds.left  ?? -Infinity,
        maxX: bounds.maxX ?? bounds.right ?? Infinity,
        minY: bounds.minY ?? bounds.top   ?? -Infinity,
        maxY: bounds.maxY ?? bounds.bottom ?? Infinity,
      };
    }
  }

  _fireCallback(name, ...args) {
    if (typeof this[name] === 'function') this[name](this, ...args);
  }

  get isDragging() { return this._isDragging; }
  get isPressed()  { return this._isPressed; }
  get velocityX()  { return this._velX; }
  get velocityY()  { return this._velY; }

  /** Update bounds (e.g., after window resize) */
  applyBounds() {
    this._resolveBounds();
    return this;
  }

  /** Kill and clean up */
  kill() {
    this._cleanupEvents();
    this._stopAutoScrollLoop();
    this.target.removeEventListener('pointerdown', this._onPointerDown);
    this.target.style.cursor = '';
    this.target.style.userSelect = '';
    this.target.style.touchAction = '';
    if (this._liveSnapTween) this._liveSnapTween.kill();
    tweenManager.stop(this.target);
    instances.delete(this);
    resizeManager.remove(this._onResize);
  }

  _startAutoScrollLoop() {
    if (this._autoScrollRAF) cancelAnimationFrame(this._autoScrollRAF);
    this._autoScrollRAF = requestAnimationFrame(() => this._autoScrollTick());
  }
  
  _stopAutoScrollLoop() {
    if (this._autoScrollRAF) {
      cancelAnimationFrame(this._autoScrollRAF);
      this._autoScrollRAF = null;
    }
  }

  _autoScrollTick() {
    if (!this._isDragging || !this._scrollContainer || !this._latestPointerEvent) {
      if (this._isPressed) this._startAutoScrollLoop();
      return;
    }

    const e = this._latestPointerEvent;
    const isWin = this._scrollContainer === this._doc.scrollingElement || this._scrollContainer === this._doc.documentElement;
    const rect = isWin ? {
      left: 0, top: 0, 
      right: this._win.innerWidth, bottom: this._win.innerHeight,
      width: this._win.innerWidth, height: this._win.innerHeight
    } : this._scrollContainer.getBoundingClientRect();

    let scrollX = 0;
    let scrollY = 0;
    const threshold = this.config.scrollThreshold;
    const speed = this.config.scrollSpeed;

    if (e.clientY < rect.top + threshold) {
      scrollY = -speed * (1 - (e.clientY - rect.top) / threshold);
    } else if (e.clientY > rect.bottom - threshold) {
      scrollY = speed * (1 - (rect.bottom - e.clientY) / threshold);
    }

    if (e.clientX < rect.left + threshold) {
      scrollX = -speed * (1 - (e.clientX - rect.left) / threshold);
    } else if (e.clientX > rect.right - threshold) {
      scrollX = speed * (1 - (rect.right - e.clientX) / threshold);
    }

    if (scrollY !== 0 || scrollX !== 0) {
      // Don't scroll past boundaries
      if (!isWin) {
        if (this._scrollContainer.scrollTop === 0 && scrollY < 0) scrollY = 0;
        if (this._scrollContainer.scrollLeft === 0 && scrollX < 0) scrollX = 0;
      }
      
      if (scrollY !== 0 || scrollX !== 0) {
        if (isWin) {
          this._win.scrollBy(scrollX, scrollY);
        } else {
          this._scrollContainer.scrollTop += scrollY;
          this._scrollContainer.scrollLeft += scrollX;
        }
        
        if (this.config.onScrollSync) {
          this.config.onScrollSync(e, scrollX, scrollY);
        }
      }
    }

    this._startAutoScrollLoop();
  }

  static create(target, config) {
    return new Interactable(target, config);
  }

  static getAll() {
    return Array.from(instances);
  }
}

export default Interactable;
function getScrollParent(node) {
  const doc = getOwnerDocument(node);
  if (!node || node === doc.body || node === doc.documentElement) {
    return doc.scrollingElement || doc.documentElement;
  }
  // Crossing out of a shadow tree: a ShadowRoot isn't an Element, hop to its host instead.
  if (isShadowRootLike(node)) {
    return getScrollParent(node.host);
  }
  const cs = getOwnerWindow(node).getComputedStyle(node);
  const isScrollable = (cs.overflowY !== 'visible' && cs.overflowY !== 'hidden') || (cs.overflowX !== 'visible' && cs.overflowX !== 'hidden');
  
  if (isScrollable) {
    return node;
  }
  return getScrollParent(node.parentNode);
}
