/**
 * Tensa PathTransition Plugin
 * 
 * Animates elements along an SVG <path> or array of {x, y} coordinates.
 * 
 * Features:
 * - align: align element's center to path
 * - alignOrigin: [0.5, 0.5] transform-origin for alignment
 * - autoRotate: rotate element to follow path tangent
 * - start/end: partial path traversal (0-1)
 * - offsetX/offsetY: position offset
 */

import { Tween } from '../core/Tween.js';
import { parseEase } from '../core/Easing.js';
import { getTransformState, buildTransformString, registerPropertyPlugin } from '../core/CSSPlugin.js';
import { reportError } from '../core/Config.js';

/**
 * Sample an SVG path at a normalized t ∈ [0,1] position.
 * @param {SVGPathElement} pathEl
 * @param {number} t - 0 to 1
 * @returns {{ x: number, y: number, angle: number }}
 */
function samplePath(pathEl, t) {
  const len = pathEl.getTotalLength();
  const pt  = pathEl.getPointAtLength(t * len);

  // Get tangent for auto-rotation. Looking only forward collapses to a zero-length
  // vector right at t=1 (t+EPSILON clamps back to 1, same point as pt), which made
  // atan2(0, 0) return 0deg - snapping the rotation back to its unrotated default
  // exactly at the end of the path. Look backward instead once close to the end.
  const EPSILON = 0.0001;
  const lookBack = t >= 1 - EPSILON;
  const t2 = lookBack ? Math.max(t - EPSILON, 0) : Math.min(t + EPSILON, 1);
  const pt2 = pathEl.getPointAtLength(t2 * len);
  const angle = lookBack
    ? Math.atan2(pt.y - pt2.y, pt.x - pt2.x) * (180 / Math.PI)
    : Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * (180 / Math.PI);

  return { x: pt.x, y: pt.y, angle };
}

/**
 * Sample a polyline array at normalized t.
 * @param {Array<{x,y}>} points
 * @param {number} t
 */
function samplePoints(points, t) {
  if (points.length < 2) return { x: 0, y: 0, angle: 0 };

  // Compute total path length
  let total = 0;
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
    segments.push({ len, from: points[i-1], to: points[i] });
    total += len;
  }

  const target = t * total;
  let traveled = 0;

  for (const seg of segments) {
    if (traveled + seg.len >= target || seg === segments[segments.length - 1]) {
      const segT = seg.len > 0 ? (target - traveled) / seg.len : 0;
      const x = seg.from.x + (seg.to.x - seg.from.x) * segT;
      const y = seg.from.y + (seg.to.y - seg.from.y) * segT;
      const angle = Math.atan2(seg.to.y - seg.from.y, seg.to.x - seg.from.x) * (180 / Math.PI);
      return { x, y, angle };
    }
    traveled += seg.len;
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

export class PathTransition {
  /**
   * @param {string|Element} target - element to animate
   * @param {Object} config
   * @param {string|SVGPathElement|Array} config.path - SVG path selector, element, or [{x,y}] array
   * @param {number} [config.duration=2]
   * @param {string} [config.ease='none']
   * @param {number} [config.start=0] - 0-1, where on path to start
   * @param {number} [config.end=1] - 0-1, where on path to end
   * @param {boolean|number} [config.autoRotate=false] - rotate to follow path (true or offset degrees)
   * @param {number[]} [config.alignOrigin=[0.5,0.5]] - transform origin as [x,y] fractions
   * @param {number} [config.offsetX=0]
   * @param {number} [config.offsetY=0]
   * @param {boolean} [config.curviness] - reserved for future spline support
   */
  constructor(target, config = {}) {
    this.target = typeof target === 'string'
      ? document.querySelector(target) : target;

    if (!this.target) {
      reportError(`[Tensa] PathTransition: target not found: ${target}`);
      return;
    }

    this._duration    = config.duration ?? 2;
    this._ease        = parseEase(config.ease ?? 'none');
    this._start       = config.start ?? 0;
    this._end         = config.end   ?? 1;
    this._autoRotate  = config.autoRotate ?? false;
    this._alignOrigin = config.alignOrigin ?? [0.5, 0.5];
    this._offsetX     = config.offsetX ?? 0;
    this._offsetY     = config.offsetY ?? 0;
    this._repeat      = config.repeat ?? 0;
    this._yoyo        = config.yoyo ?? false;

    this.onStart    = config.onStart    ?? null;
    this.onUpdate   = config.onUpdate   ?? null;
    this.onComplete = config.onComplete ?? null;

    // Resolve path
    this._pathEl     = null;
    this._pathPoints = null;
    this._resolvePath(config.path);

    // Set transform origin
    const [ox, oy] = this._alignOrigin;
    this.target.style.transformOrigin = `${ox * 100}% ${oy * 100}%`;

    this._tween = this._buildTween();
  }

  _resolvePath(path) {
    if (!path) return;

    if (Array.isArray(path)) {
      this._pathPoints = path;
      return;
    }

    const el = typeof path === 'string' ? this.target.ownerDocument.querySelector(path) : path;
    if (el && el.tagName?.toLowerCase() === 'path') {
      this._pathEl = el;
    } else {
      reportError('[Tensa] PathTransition: path must be an SVG <path> element or [{x,y}] array');
    }
  }

  _sample(t) {
    // Remap t from [start, end] range
    const mappedT = this._start + (this._end - this._start) * t;

    if (this._pathEl) {
      return samplePath(this._pathEl, mappedT);
    }
    if (this._pathPoints) {
      return samplePoints(this._pathPoints, mappedT);
    }
    return { x: 0, y: 0, angle: 0 };
  }

  _buildTween() {
    const proxy = { progress: 0 };

    const update = () => {
      const eased = this._ease(proxy.progress);
      const { x, y, angle } = this._sample(eased);

      const dx = x + this._offsetX;
      const dy = y + this._offsetY;

      if (this._autoRotate) {
        const rotOffset = typeof this._autoRotate === 'number' ? this._autoRotate : 0;
        this.target.style.transform = `translate(${dx}px, ${dy}px) rotate(${angle + rotOffset}deg)`;
      } else {
        this.target.style.transform = `translate(${dx}px, ${dy}px)`;
      }

      if (typeof this.onUpdate === 'function') this.onUpdate({ x: dx, y: dy, angle, progress: proxy.progress });
    };

    return Tween.animate(proxy, {
      progress: 1,
      duration: this._duration,
      ease: 'none', // we apply our own ease in _sample
      repeat:   this._repeat,
      yoyo:     this._yoyo,
      onUpdate: update,
      onStart:  this.onStart,
      onComplete: this.onComplete,
    });
  }

  get tween()    { return this._tween; }
  get progress() { return this._tween?.progress ?? 0; }

  play()    { this._tween?.play();    return this; }
  pause()   { this._tween?.pause();   return this; }
  resume()  { this._tween?.resume();  return this; }
  reverse() { this._tween?.reverse(); return this; }
  kill()    { this._tween?.kill();    return this; }
  seek(t)   { this._tween?.seek(t);  return this; }

  static create(target, config) {
    return new PathTransition(target, config);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Property Plugin (for inline Tween usage: { pathTransition: {...} })
// ─────────────────────────────────────────────────────────────────────────────
export const PathTransitionPlugin = {
  name: 'pathTransition',
  
  prepare(target, prop, fromVal, toVal) {
    const config = typeof toVal === 'string' || Array.isArray(toVal) 
      ? { path: toVal } 
      : toVal;
      
    let pathEl = null;
    let pathPoints = null;
    
    if (Array.isArray(config.path)) {
      pathPoints = config.path;
    } else {
      const el = typeof config.path === 'string' ? target.ownerDocument.querySelector(config.path) : config.path;
      if (el && el.tagName?.toLowerCase() === 'path') {
        pathEl = el;
      }
    }
    
    // Set align origin on target if requested
    if (config.alignOrigin) {
      const [ox, oy] = config.alignOrigin;
      target.style.transformOrigin = `${ox * 100}% ${oy * 100}%`;
    }
    
    return {
      type: 'plugin',
      prop: 'pathTransition',
      pathEl,
      pathPoints,
      start: config.start ?? 0,
      end: config.end ?? 1,
      autoRotate: config.autoRotate ?? false,
      offsetX: config.offsetX ?? 0,
      offsetY: config.offsetY ?? 0
    };
  },
  
  render(target, descriptor, t) {
    const { pathEl, pathPoints, start, end, autoRotate, offsetX, offsetY } = descriptor;
    
    const mappedT = start + (end - start) * t;
    let sample = { x: 0, y: 0, angle: 0 };
    
    if (pathEl) {
      sample = samplePath(pathEl, mappedT);
    } else if (pathPoints) {
      sample = samplePoints(pathPoints, mappedT);
    }
    
    const dx = sample.x + offsetX;
    const dy = sample.y + offsetY;
    
    // Write directly to CSSPlugin's hardware acceleration cache!
    const state = getTransformState(target);
    state.x = dx;
    state.y = dy;
    
    if (autoRotate) {
      const rotOffset = typeof autoRotate === 'number' ? autoRotate : 0;
      state.rotation = sample.angle + rotOffset;
    }
    
    target.style.transform = buildTransformString(state);
  }
};

export default PathTransition;

registerPropertyPlugin('pathTransition', PathTransitionPlugin);