/**
 * Tensa ScrollSync Plugin
 * 
 * Scroll-driven animation with:
 * - trigger, start, end (viewport offsets)
 * - scrub (link progress to scroll position, true or smoothing factor)
 * - pin element during scroll
 * - snap to progress points
 * - markers for debugging
 * - toggleClass on enter/leave
 * - Callbacks: onEnter, onLeave, onEnterBack, onLeaveBack, onUpdate, onToggle
 * - refresh() / kill() / getAll() API
 * - resize observer for layout recalculation
 */

import { Tween } from '../core/Tween.js';
import { Timeline } from '../core/Timeline.js';
import ticker from '../core/Ticker.js';
import { reportError } from '../core/Config.js';
import { resizeManager } from '../core/ResizeManager.js';
import { resolveTarget, isWindowLike, getOwnerWindow, getOwnerDocument } from '../core/TargetResolver.js';
import { registerTweenHook } from '../core/TweenManager.js';

const instances = new Set();
let rafId = null;

function addScrollListener() {
  // Recalc on resize using centralized manager (registered once globally)
  if (instances.size > 1) return; // already registered
  resizeManager.add(() => {
    instances.forEach(st => st.refresh());
  });
}



export class ScrollSync {
  /**
   * @param {Object} config
   * @param {string|Element} config.trigger - element that triggers the animation
   * @param {string|number} [config.start='top bottom'] - "triggerPos viewportPos"
   * @param {string|number} [config.end='bottom top'] - "triggerPos viewportPos"
   * @param {Tween|Timeline} [config.animation] - animation to control
   * @param {boolean|number} [config.scrub] - link to scroll (true or smoothing seconds)
   * @param {boolean|Array} [config.snap] - snap to progress points
   * @param {boolean|string} [config.pin] - pin element during animation
   * @param {boolean} [config.markers] - show debug markers
   * @param {string} [config.toggleClass] - class to toggle on trigger element
   * @param {Function} [config.onEnter]
   * @param {Function} [config.onLeave]
   * @param {Function} [config.onEnterBack]
   * @param {Function} [config.onLeaveBack]
   * @param {Function} [config.onUpdate]
   * @param {Function} [config.onToggle]
   */
  constructor(config) {
    this.config = config;
    this._progress = 0;
    this._scrubProgress = 0;
    this._isActive = false;
    this._pinSpacer = null;
    this._markers = [];
    this._killed = false;
    this._lastScrollY = -1;

    // Cached layout measurements
    this._boundsDocTop = 0;
    this._boundsRight  = 0;
    this._vh = 0;

    // Resolve trigger element
   this.trigger = resolveTarget(config.trigger);

    if (!this.trigger) {
      reportError(`[Tensa] ScrollSync: trigger element not found: ${config.trigger}`);
      return;
    }

    this._win = getOwnerWindow(this.trigger);
    this._doc = getOwnerDocument(this.trigger);

    // Resolve bounds element (defaults to the trigger's own window, so a
    // trigger living inside an <iframe> scroll-syncs against its own realm)
    const resolvedBounds = config.bounds ? resolveTarget(config.bounds) : null;
    this.bounds = resolvedBounds || this._win;

    // Observe custom bounds resize using the centralized manager
    resizeManager.observe(this.bounds);

    // Parse start/end strings
    this._startStr = config.start || 'top bottom';
    this._endStr   = config.end   || 'bottom top';

    this._animation = config.animation || null;
    this._scrub     = config.scrub ?? false;
    this._snap      = config.snap ?? false;
    this._pin       = config.pin  ?? false;
    this._toggleClass = config.toggleClass ?? null;

    this._once      = config.once ?? false;

    // Callbacks
    this.onEnter     = config.onEnter     ?? null;
    this.onLeave     = config.onLeave     ?? null;
    this.onEnterBack = config.onEnterBack ?? null;
    this.onLeaveBack = config.onLeaveBack ?? null;
    this.onUpdate    = config.onUpdate    ?? null;
    this.onToggle    = config.onToggle    ?? null;

    // If scrub is used, pause the animation so we control progress
    // if (this._scrub && this._animation) {
    //   this._animation.pause();
    //   this._animation.progress = 0;
    // }
   // If scrub is used, pause the animation so we control progress
    if (this._scrub && this._animation) {
      this._animation.pause();
      this._animation.progress = 0;
    }

    // ==========================================
    // UPGRADE: THE INITIALIZATION SEQUENCE
    // ==========================================
    
    // 1. Create DOM Nodes FIRST (so they exist before we do math)
    if (this._pin) this._setupPin();
    if (config.markers) this._createMarkers();

    // 2. NOW calculate the layout math based on the updated DOM
    this.refresh();
    
    // 3. Register instance and standard listeners
    instances.add(this);
    addScrollListener();

    this._scrollHandler = () => {
      const sy = this.getScroll();
      this._lastScrollY = sy;
      this._onScroll(sy);
    };
    const scrollTarget = this.bounds;
    scrollTarget.addEventListener('scroll', this._scrollHandler, { passive: true });

    this._globalScrollHandler = (e) => {
      if (e.target !== scrollTarget && this._markers.length) {
        this._updateMarkers();
      }
    };
    this._win.addEventListener('scroll', this._globalScrollHandler, { capture: true, passive: true });

    // 4. Apply the initial scroll state immediately
    this._lastScrollY = this.getScroll();
    this._onScroll(this._lastScrollY);

    // 5. Async Safety Catch: Browsers restore scroll positions and apply 
    // final CSS layouts a fraction of a second after JS executes.
    // This forces one final flawless recalculation right as the page renders.
    requestAnimationFrame(() => {
      if (this._killed) return;
      this.refresh();
      this._onScroll(this.getScroll());
    });
  
  }

  getScroll() {
    if (!this.bounds) return 0;
    return isWindowLike(this.bounds) ? (this.bounds.scrollY || this.bounds.pageYOffset) : this.bounds.scrollTop;
  }

  refresh() {
    if (!this.trigger) return;
    
    // Cache layout variables so we don't trigger reflows in the scroll loop
    this._vh = isWindowLike(this.bounds) ? this.bounds.innerHeight : this.bounds.clientHeight;

    const boundsTop = isWindowLike(this.bounds) ? 0 : this.bounds.getBoundingClientRect().top;
    const rect = this.trigger.getBoundingClientRect();
    
    // Position of the trigger relative to the CURRENT viewport of the bounds
    const triggerViewportTop = rect.top - boundsTop;
    const triggerViewportBottom = rect.bottom - boundsTop;

    const scrollTop = this.getScroll();

    // trigger's absolute position within the bounds scroll space
    this._triggerTop    = triggerViewportTop + scrollTop;
    this._triggerBottom = triggerViewportBottom + scrollTop;
    this._triggerHeight = rect.height;

    // Parse start: "triggerEdge viewportEdge"
    const [triggerStartEdge, viewportStartEdge] = this._parseEdgePair(this._startStr);
    const [triggerEndEdge,   viewportEndEdge]   = this._parseEdgePair(this._endStr,true);

    this._startPx = this._triggerTop + this._edgeOffset(triggerStartEdge, this._triggerHeight)
                  - this._edgeOffset(viewportStartEdge, this._vh);
    this._endPx   = this._triggerTop + this._edgeOffset(triggerEndEdge, this._triggerHeight)
                  - this._edgeOffset(viewportEndEdge, this._vh);
    // --- ADD THIS NEW PIN BLOCK ---
    if (this._pinEl && this._pinSpacer) {
      // 1. How long should it stay pinned? (Distance between start and end markers)
      // We subtract the trigger height so the spacer perfectly pads the scroll distance
      const scrollDistance = Math.max(0, this._endPx - this._startPx);
      this._pinSpacer.style.height = `${scrollDistance}px`;

      // 2. Where should it stick on the screen? (Match the scroller-start viewport marker)
      const vpStartOff = this._edgeOffset(viewportStartEdge, this._vh);
      this._pinEl.style.top = `${vpStartOff}px`;
    }

    this._updateMarkers();
  }

_parseEdgePair(str, isEndStr = false) {
    if (typeof str === 'number') return [str, 0];
    
    // UPGRADE: Strip accidental spaces around math operators before splitting!
    // Turns "center += 50px" into "center+=50px" so it doesn't break later.
    let s = String(str).trim().replace(/\s*\+=\s*/g, '+=').replace(/\s*-=\s*/g, '-=');

    // 1. Support pure relative distances (e.g., end: "+=2000px")
    if (isEndStr && (s.startsWith('+=') || s.startsWith('-='))) {
      const startParts = this._parseEdgePair(this._startStr);
      return [`${startParts[0]}${s}`, startParts[1]];
    }

    // 2. Standard resolution
    const parts = s.split(/\s+/);
    return [parts[0] || 'top', parts[1] || parts[0] || 'bottom'];
  }

  _edgeOffset(edge, size) {
    if (typeof edge === 'number') return edge;
const s = String(edge).trim().replace(/\s*\+=\s*/g, '+=').replace(/\s*-=\s*/g, '-=').toLowerCase();

    // UPGRADE: Instantly kill empty strings to prevent ghost logging!
    if (!s) return 0;

    // 1. Handle compound math (e.g., 'center+=50px' or 'bottom-=10%')
    if (s.includes('+=')) {
      const parts = s.split('+=');
      return this._edgeOffset(parts[0], size) + this._edgeOffset(parts[1], size);
    }
    if (s.includes('-=')) {
      const parts = s.split('-=');
      return this._edgeOffset(parts[0], size) - this._edgeOffset(parts[1], size);
    }

    // 2. Standard resolution
    if (s === 'top' || s === 'left') return 0;
    if (s === 'center') return size / 2;
    if (s === 'bottom' || s === 'right') return size;
    if (s.endsWith('%')) return (parseFloat(s) / 100) * size;
    
    return parseFloat(s) || 0;
  }

  
_onScroll(sy) {
    if (this._killed) return;

    const raw = (sy - this._startPx) / Math.max(1, this._endPx - this._startPx);
    const progress = Math.max(0, Math.min(1, raw));

    const wasActive = this._isActive;
    this._isActive = progress > 0 && progress < 1;

    // --- UPGRADED ENTER / LEAVE DETECTION ---
    if (progress > 0 && this._progress === 0) {
      this._fireCallback('onEnter');
      
      // If we aren't scrubbing, automatically play the animation
      if (!this._scrub && this._animation) {
        this._animation.play();
      }

      if (this._once && !this._scrub) {
        this.kill();
        return;
      }
    }
    
    if (progress < 1 && this._progress === 1) {
      this._fireCallback('onEnterBack');
    }
    
    if (progress === 0 && this._progress > 0) {
      this._fireCallback('onLeaveBack');
      
      // If we aren't scrubbing, automatically reverse when scrolling back up
      if (!this._scrub && this._animation) {
        this._animation.reverse(); 
      }
    }
    
    if (progress === 1 && this._progress < 1) {
      this._fireCallback('onLeave');
    }
    // ----------------------------------------

    this._progress = progress;

    // Toggle class
    if (this._toggleClass && this.trigger) {
      if (this._isActive) this.trigger.classList.add(this._toggleClass);
      else this.trigger.classList.remove(this._toggleClass);
    }

    // Fire onToggle when active state changes
    if (wasActive !== this._isActive) {
      this._fireCallback('onToggle', { isActive: this._isActive, progress });
    }

    // Apply to animation
    if (this._animation) {
      if (this._scrub) {
        // Smooth scrub - interpolate scrub progress
        if (typeof this._scrub === 'number' && this._scrub > 0) {
          // Use RAF for smooth interpolation
          this._targetProgress = progress;
          if (!this._scrubRaf) this._runScrubSmooth();
        } else {
          this._animation.progress = progress;
        }
      }
    }

    this._fireCallback('onUpdate', { progress, isActive: this._isActive });

    // Update marker positions
    this._updateMarkers();
  }
  _runScrubSmooth() {
    if (this._killed) return;
    const dt = 1 / 60;
    const rate = Math.min(1, dt / (this._scrub > 0 ? this._scrub : dt));
    this._scrubProgress += (this._targetProgress - this._scrubProgress) * rate;

    if (this._animation) {
      this._animation.progress = Math.max(0, Math.min(1, this._scrubProgress));
    }

    if (Math.abs(this._targetProgress - this._scrubProgress) > 0.001) {
      this._scrubRaf = requestAnimationFrame(() => this._runScrubSmooth());
    } else {
      this._scrubRaf = null;
    }
  }

  _setupPin() {
   const el = this._pin === true ? this.trigger : resolveTarget(this._pin);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const spacer = this._doc.createElement('div');
    spacer.style.cssText = `height:${rect.height}px;width:${rect.width}px;display:block;`;
    el.parentNode.insertBefore(spacer, el.nextSibling);

    el.style.position = 'sticky';
    //el.style.top = '0';
    this._pinSpacer = spacer;
    this._pinEl = el;
  }

_createMarkers() {
    const isWindow = isWindowLike(this.bounds);

    // UPGRADE 1: Calculate the exact Z-Index dynamically
    const getZ = (el) => {
      if (!el || isWindowLike(el)) return 0;
      const z = this._win.getComputedStyle(el).zIndex;
      return z === 'auto' ? 0 : parseInt(z, 10) || 0;
    };
    // Find the highest z-index between the bounds and trigger, and add 1
    const markerZIndex = Math.max(getZ(this.bounds), getZ(this.trigger), 0) + 1;

   const mkr = (label, color, isViewport) => {
      const el = this._doc.createElement('div');
      el.style.cssText = `
        pointer-events: none;
        z-index: ${markerZIndex};
        height: 0;
        width: 0;
      `;

      // 1. The Minimalist Line
      const line = this._doc.createElement('div');
      line.style.cssText = `
        position: absolute;
        right: 0;
        top: 0;
        width: 25px; /* Shorter, less intrusive line */
        height: 1px;
        background: ${color};
        opacity: 0.7; /* Subdued so it blends better */
      `;

      // 2. The Minimalist Text
      // Push trigger markers just past the short line
      const rightOffset = isViewport ? 0 : 35; 
      const text = this._doc.createElement('div');
      text.style.cssText = `
        position: absolute;
        right: ${rightOffset}px;
        text-align: right;
        top: -10px; /* Perfectly centers the text vertically on the line */
        color: ${color};
        font: 500 9px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.15em; /* Wide tracking looks very clean */
        white-space: nowrap;
        /* A hard 1px outline using text-shadow so it is readable on ANY background */
        text-shadow: 
          -1px -1px 0 #111,  
           1px -1px 0 #111,
          -1px  1px 0 #111,
           1px  1px 0 #111;
      `;
      text.textContent = label;

      el.appendChild(line);
      el.appendChild(text);

      // Positioning logic remains untouched
      if (isViewport) {
        el.style.position = 'fixed';
        this._doc.body.appendChild(el);
      } else {
        el.style.position = 'absolute';
        if (isWindow) {
          this._doc.body.appendChild(el);
        } else {
          if (this._win.getComputedStyle(this.bounds).position === 'static') {
            this.bounds.style.position = 'relative';
          }
          this.bounds.appendChild(el);
        }
      }

      this._markers.push(el);
      return el;
    };

    // Viewport markers
    this._mScrollerStart = mkr('scroller-start', '#10b981', true);
    this._mScrollerEnd   = mkr('scroller-end',   '#ef4444', true);
    
    // Trigger markers
    this._mTriggerStart = mkr('start', '#10b981', false);
    this._mTriggerEnd   = mkr('end',   '#ef4444', false);

    this._updateMarkers();
  }

  _updateMarkers() {
    if (!this._markers.length) return;
    
    const isWindow = isWindowLike(this.bounds);
    
    // Y-Axis Positioning
    const boundsRect = isWindow ? null : this.bounds.getBoundingClientRect();
    const boundsTop = isWindow ? 0 : boundsRect.top;
    const boundsLeft = isWindow ? 0 : boundsRect.left;
    
    // X-Axis Positioning (Width excluding scrollbars)
    const clientW = isWindow ? this._doc.documentElement.clientWidth : this.bounds.clientWidth;
    
    // For FIXED markers: Screen left + Width = Exact visible right edge of the screen
    const fixedRight = boundsLeft + clientW;

    // UPGRADE 3: For ABSOLUTE markers: Scroll offset + Width = Exact right edge inside the scrolled content
    const scrollX = isWindow ? (this.bounds.scrollX || this.bounds.pageXOffset) : this.bounds.scrollLeft;
    const absoluteRight = scrollX + clientW;

    const [triggerStartEdge, viewportStartEdge] = this._parseEdgePair(this._startStr,false);
    const [triggerEndEdge,   viewportEndEdge]   = this._parseEdgePair(this._endStr, true);

    const vpStartOff = this._edgeOffset(viewportStartEdge, this._vh);
    const vpEndOff   = this._edgeOffset(viewportEndEdge, this._vh);
    const trigStartOff = this._edgeOffset(triggerStartEdge, this._triggerHeight);
    const trigEndOff   = this._edgeOffset(triggerEndEdge, this._triggerHeight);

    // Fixed markers (Viewport) stick natively to the screen X/Y
    if (this._mScrollerStart) {
      this._mScrollerStart.style.top = `${boundsTop + vpStartOff}px`;
      this._mScrollerStart.style.left = `${fixedRight}px`;
    }
    if (this._mScrollerEnd) {
      this._mScrollerEnd.style.top = `${boundsTop + vpEndOff}px`;
      this._mScrollerEnd.style.left = `${fixedRight}px`;
    }

    // Absolute markers (Trigger) lock to their original Y, but dynamically track horizontal scroll on X!
    if (this._mTriggerStart) {
      this._mTriggerStart.style.top = `${this._triggerTop + trigStartOff}px`;
      this._mTriggerStart.style.left = `${absoluteRight}px`;
    }
    if (this._mTriggerEnd) {
      this._mTriggerEnd.style.top = `${this._triggerTop + trigEndOff}px`;
      this._mTriggerEnd.style.left = `${absoluteRight}px`;
    }
  }

  _fireCallback(name, ...args) {
    if (typeof this[name] === 'function') this[name](this, ...args);
  }

  get progress()  { return this._progress; }
  get isActive()  { return this._isActive; }
  get animation() { return this._animation; }

  set animation(v) {
    this._animation = v;
    if (this._scrub && v) { v.pause(); v.progress = 0; }
  }

  kill() {
    this._killed = true;
    instances.delete(this);
    resizeManager.unobserve(this.bounds);

    // Remove the per-instance scroll listener
    if (this._scrollHandler) {
      const scrollTarget = this.bounds;
      scrollTarget.removeEventListener('scroll', this._scrollHandler);
      this._scrollHandler = null;
    }

    //this._markers.forEach(m => m.el?.remove());
    this._markers.forEach(m => m.remove());
    this._markers.length = 0;
    if (this._pinSpacer) {
      this._pinSpacer.remove();
      if (this._pinEl) {
        this._pinEl.style.position = '';
        this._pinEl.style.top = '';
      }
    }
    if (this._scrubRaf) cancelAnimationFrame(this._scrubRaf);
  }

  static create(config) {
    return new ScrollSync(config);
  }

  static getAll() {
    return Array.from(instances);
  }

  static stopAll() {
    instances.forEach(st => st.kill());
  }

  static refresh() {
    instances.forEach(st => st.refresh());
  }
}

export const scrollSyncHook = (playable, config) => {
  if (config.scrollSync) {
    const stConfig = typeof config.scrollSync === 'object' 
      ? config.scrollSync 
      : { trigger: config.scrollSync };
      
    ScrollSync.create({
      animation: playable,
      ...stConfig
    });
  }
};

registerTweenHook(scrollSyncHook);

export default ScrollSync;
