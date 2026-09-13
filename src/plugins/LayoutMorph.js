/**
 * Tensa LayoutMorph Plugin - FLIP Animation Technique
 * 
 * Records element bounds before a DOM change, applies the change,
 * then smoothly animates from old → new state. Fully supports
 * absolute positioning and nested morphological transforms.
 *
 * Methods: LayoutMorph.record(), LayoutMorph.play(), LayoutMorph.fit(), LayoutMorph.isMorphing()
 */

import { Tween } from '../core/Tween.js';
import { Timeline } from '../core/Timeline.js';
import { tweenManager } from '../core/TweenManager.js';
import { parseBorderRadius } from '../core/UnitParser.js';
import { getTransformState, clearTransformCache } from '../core/CSSPlugin.js';
import { isElementLike, isNodeListLike, getOwnerWindow } from '../core/TargetResolver.js';

// ─────────────────────────────────────────────────────────────────────────────
// Modules & Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stop any active tweens and completely unwrap the element from its FLIP "hologram".
 * This restores the true underlying layout properties so that upcoming DOM changes apply correctly.
 */
function restoreNativeFlow(el) {
  if (el._layoutMorphOriginals) {
    for (const key in el._layoutMorphOriginals) {
      el.style[key] = el._layoutMorphOriginals[key];
    }

    // Clean up so animateFrom treats this as a brand new layout
    delete el._layoutMorphOriginals;
    delete el._layoutMorphUnscaledRadius;
    delete el._layoutMorphUnscaledBorders;
    delete el._layoutMorphId;
  }
}

function captureVisualState(el) {
  let currentX = 0, currentY = 0, currentScaleX = 1, currentScaleY = 1;
  let activePhysics = el.style.transform;
  let ts = {};
  
  if (el._layoutMorphOriginals) {
    // 1. Stop the active tween immediately so it doesn't tick on the next frame
    if (el._layoutMorphTimeline) {
      el._layoutMorphTimeline.kill();
      el._layoutMorphTimeline = null;
    }

    // 2. Extract EXACTLY where it was frozen in mid-air (all properties)
    ts = { ...getTransformState(el) };
    currentX = ts.x || 0;
    currentY = ts.y || 0;
    currentScaleX = ts.scaleX !== undefined ? ts.scaleX : 1;
    currentScaleY = ts.scaleY !== undefined ? ts.scaleY : 1;
  } else {
    ts = { ...getTransformState(el) };
  }

  // 3. Strip any active transforms to measure the pure, unrotated native layout box
  if (el._layoutMorphOriginals) {
    el.style.transform = el._layoutMorphOriginals.transform;
  }
  
  clearTransformCache(el);

  el.style.transform = 'none';
  const rect = getAbsoluteRect(el);
  const cs = getOwnerWindow(el).getComputedStyle(el);
  
  const origin = cs.transformOrigin.split(' ');
  const ox = parseFloat(origin[0]) || 0;
  const oy = parseFloat(origin[1]) || 0;

  // Restore the mid-flight physics immediately so children can be accurately measured globally
  el.style.transform = activePhysics;

  // 4. Calculate the mathematically exact visual bounding box
  const visualLeft = rect.left + ox - (ox * currentScaleX) + currentX;
  const visualTop = rect.top + oy - (oy * currentScaleY) + currentY;
  const visualWidth = rect.width * currentScaleX;
  const visualHeight = rect.height * currentScaleY;

  return {
    rect: {
      left: visualLeft,
      top: visualTop,
      width: visualWidth,
      height: visualHeight,
      bottom: visualTop + visualHeight,
      right: visualLeft + visualWidth
    },
    transformOriginX: ox,
    transformOriginY: oy,
    ts, cs, activePhysics
  };
}

/**
 * Capture structural and visual CSS properties like opacity and border-radius.
 */
function captureStyleProps(el, visualState, props = []) {
  const { cs, ts } = visualState;
  return {
    opacity: parseFloat(cs.opacity) || 1,
    rotation: ts.rotation || 0,
    rotationX: ts.rotationX || 0,
    rotationY: ts.rotationY || 0,
    skewX: ts.skewX || 0,
    skewY: ts.skewY || 0,
    borderRadius: el._layoutMorphUnscaledRadius || cs.borderRadius,
    borderTopWidth: el._layoutMorphUnscaledBorders ? el._layoutMorphUnscaledBorders.top : parseFloat(cs.borderTopWidth) || 0,
    borderRightWidth: el._layoutMorphUnscaledBorders ? el._layoutMorphUnscaledBorders.right : parseFloat(cs.borderRightWidth) || 0,
    borderBottomWidth: el._layoutMorphUnscaledBorders ? el._layoutMorphUnscaledBorders.bottom : parseFloat(cs.borderBottomWidth) || 0,
    borderLeftWidth: el._layoutMorphUnscaledBorders ? el._layoutMorphUnscaledBorders.left : parseFloat(cs.borderLeftWidth) || 0,
    ...props.reduce((acc, p) => { acc[p] = cs[p]; return acc; }, {})
  };
}

/**
 * Ensure `el._layoutMorphOriginals` exists so we can safely measure `toRect` and clean up later.
 */
function prepareForMeasurement(el, props = []) {
  if (!el._layoutMorphOriginals) {
    const originals = {
      position: el.style.position,
      top: el.style.top,
      left: el.style.left,
      width: el.style.width,
      height: el.style.height,
      margin: el.style.margin,
      boxSizing: el.style.boxSizing,
      borderRadius: el.style.borderRadius,
      borderTopWidth: el.style.borderTopWidth,
      borderRightWidth: el.style.borderRightWidth,
      borderBottomWidth: el.style.borderBottomWidth,
      borderLeftWidth: el.style.borderLeftWidth,
      transform: el.style.transform,
      opacity: el.style.opacity
    };
    
    for (const p of props) {
      originals[p] = el.style[p];
    }
    
    el._layoutMorphOriginals = originals;
  }

  // Stop the old LayoutMorph timeline from ticking and interfering with the new morph
  if (el._layoutMorphTimeline) {
    el._layoutMorphTimeline.kill();
    el._layoutMorphTimeline = null;
  }

  // Restore all original styles temporarily to measure true native layout bounds
  for (const key in el._layoutMorphOriginals) {
    if (key === 'transform') {
      el.style.transform = 'none';
    } else {
      el.style[key] = el._layoutMorphOriginals[key];
    }
  }

  // Force CSSPlugin to read the true DOM matrix instead of the cached one
  clearTransformCache(el);
}

/**
 * Calculates exactly how far an element needs to be translated/scaled backwards 
 * from its new layout position to visually cover its old state.
 */
function computeTransformOffsets(from, toRect, ox_to, oy_to) {
  let sx = toRect.width !== 0 ? from.rect.width / toRect.width : 1;
  let sy = toRect.height !== 0 ? from.rect.height / toRect.height : 1;
  
  // Mathematically flawless absolute top-left overlay algorithm
  let dx = from.rect.left - toRect.left + ox_to * (sx - 1);
  let dy = from.rect.top - toRect.top + oy_to * (sy - 1);

  const isFromZero = from.rect.width === 0 && from.rect.height === 0;
  const isToZero = toRect.width === 0 && toRect.height === 0;

  if (isFromZero && !isToZero) {
    // Entering from 0x0. Grow from its new center.
    dx = toRect.width / 2;
    dy = toRect.height / 2;
    sx = 0;
    sy = 0;
  } else if (!isFromZero && isToZero) {
    // Exiting to 0x0. Skip morphing to 0,0.
    return null;
  } else if (isFromZero && isToZero) {
    return null;
  }

  return { dx, dy, sx, sy };
}

/**
 * Inverts ancestor FLIP transforms from child transitions to prevent double-scaling.
 */
function computeNestedOffsets(transitions) {
  for (const t of transitions) {
    let parent = t.el.parentElement;
    let ancestorTransition = null;
    while (parent) {
      ancestorTransition = transitions.find(tr => tr.el === parent);
      if (ancestorTransition) break;
      parent = parent.parentElement;
    }

    if (ancestorTransition) {
      const A_sx = ancestorTransition.globalSx;
      const A_sy = ancestorTransition.globalSy;
      const A_dx = ancestorTransition.globalDx;
      const A_dy = ancestorTransition.globalDy;
      
      t.sx = t.globalSx / A_sx;
      t.sy = t.globalSy / A_sy;
      
      const O_C_x = t.toRect.left + t.ox_to;
      const O_C_y = t.toRect.top + t.oy_to;
      const O_A_x = ancestorTransition.toRect.left + ancestorTransition.ox_to;
      const O_A_y = ancestorTransition.toRect.top + ancestorTransition.oy_to;
      
      t.dx = (t.globalDx - A_dx + (O_C_x - O_A_x) * (1 - A_sx)) / A_sx;
      t.dy = (t.globalDy - A_dy + (O_C_y - O_A_y) * (1 - A_sy)) / A_sy;
    }
  }
}

/**
 * Modifies the layout engine directly to pull elements out of document flow
 * while perfectly keeping their position on the screen.
 */
function applyAbsoluteLayout(transitions) {
  for (const t of transitions) {
    t.el.style.position = 'absolute';
    t.el.style.margin = '0';
    t.el.style.boxSizing = 'border-box';
    t.el.style.width = t.toRect.width + 'px';
    t.el.style.height = t.toRect.height + 'px';
    t.el.style.top = '0px';
    t.el.style.left = '0px';
  }
  
  for (const t of transitions) {
    // currentRect is now exactly the viewport coordinate of the element's offsetParent origin!
    const currentRect = getAbsoluteRect(t.el);
    const offsetDx = t.toRect.left - currentRect.left;
    const offsetDy = t.toRect.top - currentRect.top;
    t.el.style.top = offsetDy + 'px';
    t.el.style.left = offsetDx + 'px';
  }
}

/**
 * Returns a fast onUpdate hook to mathematically counter-scale border-radius against element scaling.
 */
function createRadiusUpdater(el, fromRadiusParsed, toRadiusParsed) {
  return function(progress, sx, sy) {
    const absSx = Math.abs(sx) > 0.001 ? Math.abs(sx) : 1;
    const absSy = Math.abs(sy) > 0.001 ? Math.abs(sy) : 1;

    const hVals = [];
    const vVals = [];
    const unscaledHVals = [];
    const unscaledVVals = [];
    
    for (let i = 0; i < 4; i++) {
      const fH = fromRadiusParsed.h[i], tH = toRadiusParsed.h[i];
      const fV = fromRadiusParsed.v[i], tV = toRadiusParsed.v[i];
      const curH = fH.value + (tH.value - fH.value) * progress;
      const curV = fV.value + (tV.value - fV.value) * progress;
      
      const scaledH = curH / absSx;
      const scaledV = curV / absSy;
      
      hVals.push(`${scaledH}px`);
      vVals.push(`${scaledV}px`);
      unscaledHVals.push(`${curH}px`);
      unscaledVVals.push(`${curV}px`);
    }
    
    el.style.borderRadius = `${hVals.join(' ')} / ${vVals.join(' ')}`;
    el._layoutMorphUnscaledRadius = `${unscaledHVals.join(' ')} / ${unscaledVVals.join(' ')}`;
  };
}

/**
 * Returns a fast onUpdate hook to mathematically counter-scale border-widths against element scaling.
 */
function createBorderUpdater(el, fromBorder, toBorder) {
  return function(progress, sx, sy) {
    const absSx = Math.abs(sx) > 0.001 ? Math.abs(sx) : 1;
    const absSy = Math.abs(sy) > 0.001 ? Math.abs(sy) : 1;

    const currentBorderTop = fromBorder.borderTopWidth + (toBorder.t - fromBorder.borderTopWidth) * progress;
    const currentBorderBottom = fromBorder.borderBottomWidth + (toBorder.b - fromBorder.borderBottomWidth) * progress;
    const currentBorderLeft = fromBorder.borderLeftWidth + (toBorder.l - fromBorder.borderLeftWidth) * progress;
    const currentBorderRight = fromBorder.borderRightWidth + (toBorder.r - fromBorder.borderRightWidth) * progress;

    el.style.borderTopWidth = `${currentBorderTop / absSy}px`;
    el.style.borderBottomWidth = `${currentBorderBottom / absSy}px`;
    el.style.borderLeftWidth = `${currentBorderLeft / absSx}px`;
    el.style.borderRightWidth = `${currentBorderRight / absSx}px`;

    el._layoutMorphUnscaledBorders = {
      top: currentBorderTop,
      bottom: currentBorderBottom,
      left: currentBorderLeft,
      right: currentBorderRight
    };
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Core LayoutMorph Logic
// ─────────────────────────────────────────────────────────────────────────────

class LayoutMorphState {
  constructor(elements, props) {
    this._data = new Map();
    this.elements = elements;
    this._props = props;
    this._capture(props);
  }

  _capture(props = []) {
    // Phase 1: Capture all visual bounds while the DOM is mid-flight
    for (const el of this.elements) {
      const visualState = captureVisualState(el);
      const styleProps = captureStyleProps(el, visualState, props);

      this._data.set(el, {
        rect: visualState.rect,
        transformOriginX: visualState.transformOriginX,
        transformOriginY: visualState.transformOriginY,
        ...styleProps
      });
    }

    // Phase 2: Now that all global visual bounds are captured, unwrap the holograms
    for (const el of this.elements) {
      if (el._layoutMorphOriginals) {
        restoreNativeFlow(el);
      }
    }
    
    return this;
  }

  getData(el) { return this._data.get(el); }
}

export class LayoutMorph {
  /**
   * Capture the current state of elements.
   * Call this BEFORE making any DOM changes.
   * 
   * @param {string|Element|NodeList|Element[]} targets
   * @param {Object} [config]
   * @param {string[]} [config.props] - extra CSS properties to capture
   * @returns {LayoutMorphState}
   */
  static record(targets, config = {}) {
    const elements = resolveElements(targets);
    return new LayoutMorphState(elements, config.props || []);
  }

  static capture(targets, config = {}) {
    return LayoutMorph.record(targets, config);
  }

  /**
   * Animate FROM the captured state TO the current state.
   * Call this AFTER making DOM changes.
   * 
   * @param {LayoutMorphState} state - state captured before DOM change
   * @param {Object} [config] - animation config (duration, ease, stagger, absolute, nested)
   * @returns {Timeline}
   */
  static play(record, config = {}) {
    const {
      duration = 0.5,
      ease = 'cubic.inOut',
      stagger = 0,
      onComplete = null,
      onStart = null,
      absolute = false,
      nested = false,
      ...extraConfig
    } = config;

    const tl = new Timeline({ paused: false });
    const transitions = [];

    // 1. Prep Phase: Clean up any mid-flight pollution
    for (const el of record.elements) {
      prepareForMeasurement(el, record._props);
    }

    // 2. Measurement Phase: Calculate the mathematically perfect offsets
    for (const el of record.elements) {
      const from = record.getData(el);
      if (!from) continue;

      // Temporarily restore real transform to read true CSS destination matrix
      el.style.transform = el._layoutMorphOriginals.transform;
      const ts = { ...getTransformState(el) };
      el.style.transform = 'none';
      
      const toRect = getAbsoluteRect(el);
      const cs = getOwnerWindow(el).getComputedStyle(el);
      
      const origin = cs.transformOrigin.split(' ');
      const ox_to = parseFloat(origin[0]) || 0;
      const oy_to = parseFloat(origin[1]) || 0;

      const offsets = computeTransformOffsets(from, toRect, ox_to, oy_to);
      if (!offsets) continue; // Skip morphing (e.g. exit to 0x0)
      
      const { dx, dy, sx, sy } = offsets;
      const toOpacity = parseFloat(cs.opacity) || 1;

      let hasChanges = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(sx - 1) > 0.005 || Math.abs(sy - 1) > 0.005;

      const extraPropsFrom = {};
      const extraPropsTo = {};

      if (Math.abs((from.rotation || 0) - (ts.rotation || 0)) > 0.01 || 
          Math.abs((from.skewX || 0) - (ts.skewX || 0)) > 0.01) {
        hasChanges = true;
      }

      extraPropsFrom.rotation = from.rotation || 0;
      extraPropsTo.rotation = ts.rotation || 0;
      extraPropsFrom.rotationX = from.rotationX || 0;
      extraPropsTo.rotationX = ts.rotationX || 0;
      extraPropsFrom.rotationY = from.rotationY || 0;
      extraPropsTo.rotationY = ts.rotationY || 0;
      extraPropsFrom.skewX = from.skewX || 0;
      extraPropsTo.skewX = ts.skewX || 0;
      extraPropsFrom.skewY = from.skewY || 0;
      extraPropsTo.skewY = ts.skewY || 0;

      if (record._props && record._props.length > 0) {
        for (const p of record._props) {
          if (from[p] !== cs[p]) {
            hasChanges = true;
            extraPropsFrom[p] = from[p];
            extraPropsTo[p] = cs[p];
          }
        }
      }

      // Normalizes border-radius to pixels so that counter-scaling math works flawlessly
      const normalizeRadius = (parsed, rect) => {
        if (!parsed) return null;
        return {
          h: parsed.h.map(r => ({ value: r.unit === '%' ? (r.value / 100) * rect.width : r.value, unit: 'px' })),
          v: parsed.v.map(r => ({ value: r.unit === '%' ? (r.value / 100) * rect.height : r.value, unit: 'px' }))
        };
      };

      const fromRadiusParsed = normalizeRadius(parseBorderRadius(from.borderRadius), from.rect);
      const toRadiusParsed = normalizeRadius(parseBorderRadius(cs.borderRadius), toRect);
      
      const hasFromRadius = fromRadiusParsed && (fromRadiusParsed.h.some(r => r.value !== 0) || fromRadiusParsed.v.some(r => r.value !== 0));
      const hasToRadius = toRadiusParsed && (toRadiusParsed.h.some(r => r.value !== 0) || toRadiusParsed.v.some(r => r.value !== 0));
      const needsRadiusCorrection = (hasFromRadius || hasToRadius) && (Math.abs(sx - 1) > 0.005 || Math.abs(sy - 1) > 0.005);

      const toBorder = {
        t: parseFloat(cs.borderTopWidth) || 0,
        r: parseFloat(cs.borderRightWidth) || 0,
        b: parseFloat(cs.borderBottomWidth) || 0,
        l: parseFloat(cs.borderLeftWidth) || 0
      };
      const hasFromBorder = from.borderTopWidth || from.borderRightWidth || from.borderBottomWidth || from.borderLeftWidth;
      const hasToBorder = toBorder.t || toBorder.r || toBorder.b || toBorder.l;
      const needsBorderCorrection = (hasFromBorder || hasToBorder) && (Math.abs(sx - 1) > 0.005 || Math.abs(sy - 1) > 0.005);

      if (hasChanges || needsRadiusCorrection || needsBorderCorrection) {
        transitions.push({
          el, from, toRect, dx, dy, sx, sy,
          globalDx: dx, globalDy: dy, globalSx: sx, globalSy: sy,
          ox_to, oy_to,
          fromOpacity: from.opacity, toOpacity,
          fromRadiusParsed, toRadiusParsed, needsRadiusCorrection,
          needsBorderCorrection, toBorder,
          extraPropsFrom, extraPropsTo
        });
      }
    }

    // 3. Modifier Phase
    if (nested) computeNestedOffsets(transitions);
    if (absolute) applyAbsoluteLayout(transitions);

    // 4. Tween Construction Phase
    let index = 0;
    const userOnUpdate = extraConfig.onUpdate;

    for (const t of transitions) {
      const { el, dx, dy, sx, sy, fromOpacity, toOpacity, fromRadiusParsed, toRadiusParsed, needsRadiusCorrection, needsBorderCorrection, toBorder, extraPropsFrom, extraPropsTo } = t;

      const staggerDelay = typeof stagger === 'number' ? stagger * index : 0;
      index++;

      if (getOwnerWindow(el).getComputedStyle(el).position === 'static') {
        el.style.position = 'relative';
      }

      const currentMorphId = (el._layoutMorphId || 0) + 1;
      el._layoutMorphId = currentMorphId;

      const updateRadius = needsRadiusCorrection ? createRadiusUpdater(el, fromRadiusParsed, toRadiusParsed) : null;
      const updateBorder = needsBorderCorrection ? createBorderUpdater(el, t.from, toBorder) : null;

      const tween = Tween.sequence(el, {
        x: dx, y: dy, scaleX: sx, scaleY: sy, opacity: fromOpacity, ...extraPropsFrom
      }, {
        x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: toOpacity, ...extraPropsTo,
        duration, ease, delay: staggerDelay, ...extraConfig, paused: true,
        onUpdate: function() {
          if (updateRadius || updateBorder) {
            const progress = this.visualProgress || 0;
            const currentSx = sx + (1 - sx) * progress;
            const currentSy = sy + (1 - sy) * progress;
            if (updateRadius) updateRadius(progress, currentSx, currentSy);
            if (updateBorder) updateBorder(progress, currentSx, currentSy);
          }
          if (userOnUpdate) userOnUpdate.call(this);
        },
        onComplete: () => {
          if (el._layoutMorphId === currentMorphId && el._layoutMorphOriginals) {
            restoreNativeFlow(el);
            el._layoutMorphTimeline = null;
          }
          if (extraConfig.onComplete) extraConfig.onComplete();
        }
      });

      tl.add(tween, 0);
      el._layoutMorphTimeline = tl;
    }

    if (onComplete) tl.onComplete = onComplete;
    if (onStart) tl.onStart = onStart;

    // Bridge the 1-frame gap
    tl.seek(0);

    return tl;
  }

  /**
   * Fit one element's bounds to match another element's bounds with animation.
   * 
   * @param {string|Element} element - element to fit
   * @param {string|Element} target - target to fit TO
   * @param {Object} [config]
   */
  static fit(element, target, config = {}) {
    const el = resolveElement(element);
    const tgt = resolveElement(target);
    if (!el || !tgt) return;

    const activePhysicsEl = el.style.transform;
    el.style.transform = 'none';

    const fromRect = getAbsoluteRect(el);
    const cs = getOwnerWindow(el).getComputedStyle(el);
    const origin = cs.transformOrigin.split(' ');
    const ox = parseFloat(origin[0]) || 0;
    const oy = parseFloat(origin[1]) || 0;

    el.style.transform = activePhysicsEl;

    const toRect = getAbsoluteRect(tgt);

    const sx = fromRect.width !== 0 ? toRect.width / fromRect.width : 1;
    const sy = fromRect.height !== 0 ? toRect.height / fromRect.height : 1;

    const x = toRect.left - fromRect.left - ox * (1 - sx);
    const y = toRect.top - fromRect.top - oy * (1 - sy);

    return Tween.animate(el, {
      x: x,
      y: y,
      scaleX: sx,
      scaleY: sy,
      duration: config.duration ?? 0.5,
      ease: config.ease ?? 'cubic.inOut',
      ...config
    });
  }

  /**
   * Check if any element is currently being FLIP-animated.
   */
  static isMorphing(element) {
    const el = resolveElement(element);
    if (!el) return false;
    return tweenManager.getAnimations(el).length > 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Util
// ─────────────────────────────────────────────────────────────────────────────
function resolveElements(target) {
  if (typeof target === 'string') return Array.from(document.querySelectorAll(target));
  if (isElementLike(target)) return [target];
  if (isNodeListLike(target)) return Array.from(target);
  if (Array.isArray(target)) return target.flatMap(resolveElements);
  return [];
}

function resolveElement(target) {
  if (typeof target === 'string') return document.querySelector(target);
  return target;
}

function getAbsoluteRect(el) {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
    right: rect.right
  };
}

export default LayoutMorph;
