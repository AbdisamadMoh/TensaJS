
import { parseValue, resolveRelative, lerp, parseComplexString, buildComplexString, toPx, toAngle, parseBorderRadius, parseGradient, buildGradient, splitTopLevelCommas } from './UnitParser.js';
import { isColor, interpolateColor, parseColor } from './ColorParser.js';
import { isDOMElement, isPlainObject, getOwnerDocument, getOwnerWindow, getMeasurementHost } from './TargetResolver.js';
import { prepareBackground, applyBackground } from './BackgroundMorph.js';
import { prepareClipPath, interpolateClipPath } from './ClipPathMorph.js';

// Property Plugin Architecture
export const propertyPlugins = {};

export function registerPropertyPlugin(name, plugin) {
  propertyPlugins[name] = plugin;
}

// Transform shorthand map - these props feed into the transform matrix
export const TRANSFORM_PROPS = new Set([
  'x', 'y', 'z',
  'rotation', 'rotationX', 'rotationY', 'rotationZ',
  'rotate', 'rotateX', 'rotateY', 'rotateZ',
  'scaleX', 'scaleY', 'scaleZ', 'scale',
  'skewX', 'skewY',
  'perspective',
  'translateX', 'translateY', 'translateZ',
]);

// Default units for transform props
const TRANSFORM_UNITS = {
  x: 'px', y: 'px', z: 'px',
  translateX: 'px', translateY: 'px', translateZ: 'px',
  rotation: 'deg', rotationX: 'deg', rotationY: 'deg', rotationZ: 'deg',
  rotate: 'deg', rotateX: 'deg', rotateY: 'deg', rotateZ: 'deg',
  perspective: 'px',
};

// CSS properties that are unitless (numbers without 'px')
const UNITLESS_PROPS = new Set([
  'opacity', 'zIndex', 'z-index', 'fontWeight', 'font-weight',
  'lineHeight', 'line-height', 'order', 'flexGrow', 'flexShrink',
  'columnCount', 'column-count', 'animationIterationCount', 'scale',
  'scaleX', 'scaleY', 'scaleZ',
]);

// CSS properties that strictly require integer values
const INTEGER_PROPS = new Set([
  'zIndex', 'z-index', 'fontWeight', 'font-weight', 'order', 
  'columnCount', 'column-count', 'animationIterationCount', 'animation-iteration-count'
]);

// CSS properties that animate colors for better performance.
const COLOR_PROPS = new Set([
  'color', 'backgroundColor', 'background-color', 'borderColor', 'border-color',
  'borderTopColor', 'border-top-color', 'borderRightColor', 'border-right-color',
  'borderBottomColor', 'border-bottom-color', 'borderLeftColor', 'border-left-color',
  'outlineColor', 'outline-color', 'textDecorationColor', 'text-decoration-color',
  'fill', 'stroke', 'stopColor', 'stop-color', 'floodColor', 'flood-color',
  'lightingColor', 'lighting-color', 'caretColor', 'caret-color',
  'columnRuleColor', 'column-rule-color', 'accentColor', 'accent-color',
]);

// Transform state storage (keyed by element)
const transformCache = new WeakMap();

// will-change Reference Counting & Compositing Layer Management
const willChangeMap = new WeakMap();

const RESERVED_TWEEN_KEYS = new Set([
  'duration', 'delay', 'ease', 'paused', 'repeat', 'yoyo', 'repeatDelay',
  'stagger', 'onStart', 'onUpdate', 'onComplete', 'onRepeat', 'onReverseComplete',
  'onStartParams', 'onUpdateParams', 'onCompleteParams',
  'id', 'data', 'callbackScope', 'immediateRender', 'overwrite', 'lazy',
  'startAt', 'keyframes', 'reversed', 'willChange', 'scrollSync',
]);

const FORBIDDEN_WILL_CHANGE_TOKENS = new Set([
  'will-change', 'none', 'all', 'auto', 'default', 'initial', 'inherit', 'revert', 'revert-layer', 'unset'
]);

/**
 * Derives an optimal will-change string based on the animated properties map.
 * @param {Object} vars - Property map being animated.
 * @returns {string} e.g. "transform", "transform, opacity"
 */
export function inferWillChange(vars = {}) {
  const hints = new Set();
  for (const prop of Object.keys(vars)) {
    if (RESERVED_TWEEN_KEYS.has(prop)) continue;
    if (TRANSFORM_PROPS.has(prop)) {
      hints.add('transform');
    } else if (prop === 'opacity') {
      hints.add('opacity');
    } else if (prop === 'clipPath' || prop === 'clip-path') {
      hints.add('clip-path');
    } else if (prop === 'filter' || prop === 'backdropFilter' || prop === 'backdrop-filter') {
      hints.add('filter');
    } else if (prop === 'scrollLeft' || prop === 'scrollTop' || prop === 'scroll') {
      hints.add('scroll-position');
    } else {
      const kebab = normalizePropName(prop);
      if (kebab && !kebab.startsWith('--') && !kebab.startsWith('_') && !FORBIDDEN_WILL_CHANGE_TOKENS.has(kebab)) {
        hints.add(kebab);
      }
    }
  }
  return hints.size > 0 ? Array.from(hints).join(', ') : 'transform';
}

/**
 * Apply reference-counted will-change to a DOM element.
 * @param {Element} el - DOM target
 * @param {string} value - CSS will-change value
 */
export function applyWillChange(el, value) {
  if (!isDOMElement(el) || !value) return;
  let entry = willChangeMap.get(el);
  if (!entry) {
    entry = { count: 0, original: el.style.willChange || '', activeValues: [] };
    willChangeMap.set(el, entry);
  }
  entry.count++;
  entry.activeValues.push(value);

  const allTokens = new Set();
  for (const val of entry.activeValues) {
    for (const part of val.split(',')) {
      const trimmed = part.trim();
      if (trimmed) allTokens.add(trimmed);
    }
  }
  el.style.willChange = Array.from(allTokens).join(', ');
}

/**
 * Decrement reference count and restore original will-change when all active tweens release it.
 * @param {Element} el - DOM target
 * @param {string} [value] - CSS will-change value originally applied
 */
export function releaseWillChange(el, value) {
  if (!isDOMElement(el)) return;
  const entry = willChangeMap.get(el);
  if (!entry) return;
  entry.count--;

  if (value && entry.activeValues) {
    const idx = entry.activeValues.indexOf(value);
    if (idx !== -1) entry.activeValues.splice(idx, 1);
  }

  if (entry.count <= 0) {
    if (entry.original) {
      el.style.willChange = entry.original;
    } else {
      el.style.removeProperty('will-change');
    }
    willChangeMap.delete(el);
  } else if (entry.activeValues && entry.activeValues.length > 0) {
    const allTokens = new Set();
    for (const val of entry.activeValues) {
      for (const part of val.split(',')) {
        const trimmed = part.trim();
        if (trimmed) allTokens.add(trimmed);
      }
    }
    el.style.willChange = Array.from(allTokens).join(', ');
  }
}

export function clearTransformCache(el) {
  transformCache.delete(el);
}

export function getTransformState(el) {
  if (!transformCache.has(el)) {
    let x = 0, y = 0, z = 0;
    let rotation = 0, rotationX = 0, rotationY = 0;
    let scaleX = 1, scaleY = 1, scaleZ = 1;
    let skewX = 0, skewY = 0;
    let perspective = 0;

    try {
      const cs = getOwnerWindow(el).getComputedStyle(el);
      if (cs.transform && cs.transform !== 'none') {
        const m = new DOMMatrix(cs.transform);
        
        // Translation
        x = m.m41;
        y = m.m42;
        z = m.m43 || 0;

        const RAD2DEG = 180 / Math.PI;

        if (m.is2D) {
          scaleX = Math.sqrt(m.m11 * m.m11 + m.m12 * m.m12);
          rotation = Math.atan2(m.m12, m.m11);
          
          // Remove rotation from column 2 (m21, m22)
          const cosR = Math.cos(-rotation);
          const sinR = Math.sin(-rotation);
          
          const c21 = m.m21 * cosR - m.m22 * sinR;
          const c22 = m.m21 * sinR + m.m22 * cosR;
          
          scaleY = c22;
          if (scaleY !== 0) {
            skewX = Math.atan2(c21, c22);
          }
          
          rotation *= RAD2DEG;
          skewX *= RAD2DEG;
        } else {
          // 3D Scale (Magnitudes of the COLUMNS)
          scaleX = Math.sqrt(m.m11 * m.m11 + m.m12 * m.m12 + m.m13 * m.m13);
          scaleY = Math.sqrt(m.m21 * m.m21 + m.m22 * m.m22 + m.m23 * m.m23);
          scaleZ = Math.sqrt(m.m31 * m.m31 + m.m32 * m.m32 + m.m33 * m.m33);

          // Normalize matrix columns to remove scale
          // Divide Column 1 by scaleX, Column 2 by scaleY, Column 3 by scaleZ
          const n11 = m.m11 / scaleX, n12 = m.m12 / scaleX, n13 = m.m13 / scaleX;
          const n21 = m.m21 / scaleY, n22 = m.m22 / scaleY, n23 = m.m23 / scaleY;
          const n31 = m.m31 / scaleZ, n32 = m.m32 / scaleZ, n33 = m.m33 / scaleZ;

          // Extract Euler angles (XYZ order)
          rotationY = Math.asin(Math.max(-1, Math.min(1, n31))); 
          
          if (Math.abs(n31) < 0.99999) { // Non-gimbal lock
              rotationX = Math.atan2(-n32, n33);
              rotation = Math.atan2(-n21, n11); // rotationZ
          } else { // Gimbal lock
              // Use R32 and R22 for mathematical fallback at the poles
              rotationX = Math.atan2(n23, n22); 
              rotation = 0;
          }

          rotation *= RAD2DEG;
          rotationX *= RAD2DEG;
          rotationY *= RAD2DEG;
        }
      }
    } catch (e) {}

    transformCache.set(el, {
      x, y, z,
      rotation, rotationX, rotationY,
      scaleX, scaleY, scaleZ,
      skewX, skewY,
      perspective,
    });
  }
  return transformCache.get(el);
}

export function buildTransformString(state) {
  const parts = [];

  if (state.perspective) parts.push(`perspective(${state.perspective}px)`);
  if (state.x || state.y || state.z) {
    parts.push(`translate3d(${state.x}px, ${state.y}px, ${state.z}px)`);
  }
  if (state.rotationX) parts.push(`rotateX(${state.rotationX}deg)`);
  if (state.rotationY) parts.push(`rotateY(${state.rotationY}deg)`);
  if (state.rotation || state.rotationZ) {
    parts.push(`rotateZ(${state.rotation || state.rotationZ}deg)`);
  }
  if (state.scaleX !== 1 || state.scaleY !== 1 || state.scaleZ !== 1) {
    if (state.scaleZ !== 1) {
      parts.push(`scale3d(${state.scaleX}, ${state.scaleY}, ${state.scaleZ})`);
    } else {
      parts.push(`scale(${state.scaleX}, ${state.scaleY})`);
    }
  }
  if (state.skewX || state.skewY) {
    parts.push(`skew(${state.skewX}deg, ${state.skewY}deg)`);
  }

  return parts.join(' ') || 'none';
}

// Property normalization
function normalizePropName(prop) {
  // Convert camelCase to kebab-case for CSS properties
  // But keep shorthand names as-is for transform handling
  if (TRANSFORM_PROPS.has(prop)) return prop;
  if (prop.startsWith('--')) return prop; // CSS custom property

  // Convert camelCase > kebab-case
  return prop.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function camelCase(kebab) {
  return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// Reading current values
function getCurrentValue(el, prop) {
  if (isPlainObject(el)) {
    return el[prop];
  }

  if (!isDOMElement(el)) return 0;

  // Transform props come from our cached state
  if (TRANSFORM_PROPS.has(prop)) {
    const state = getTransformState(el);
    const aliases = {
      rotate: 'rotation', rotateX: 'rotationX', rotateY: 'rotationY', rotateZ: 'rotationZ',
      translateX: 'x', translateY: 'y', translateZ: 'z',
      scale: null, // scale is scaleX+scaleY combined
    };
    if (prop === 'scale') return state.scaleX; // return unified scale
    const key = aliases[prop] !== undefined ? aliases[prop] : prop;
    return key ? state[key] : 0;
  }

  // CSS custom property
  if (prop.startsWith('--')) {
    const val = el.style.getPropertyValue(prop) ||
                getOwnerWindow(el).getComputedStyle(el).getPropertyValue(prop);
    return val.trim();
  }

  // Regular CSS property
  const cs = getOwnerWindow(el).getComputedStyle(el);
  const camel = camelCase(prop.startsWith('-') ? prop.slice(1) : prop);
  const value = cs[camel] || cs.getPropertyValue(normalizePropName(prop)) || '0';
  return value;
}

// Property interpolation

/**
 * Prepare interpolation data for a single property on a single target.
 * Returns an interpolator descriptor for use during tween update.
 */
export function prepareProperty(target, prop, fromVal, toVal) {
  // Delegate to registered property plugin if one exists for this prop
  if (propertyPlugins[prop]) {
    return propertyPlugins[prop].prepare(target, prop, fromVal, toVal);
  }


  // Handle Array Keyframes (e.g. x: [0, 100, 200])
  if (Array.isArray(toVal)) {
    if (toVal.length === 0) return null;
    if (toVal.length === 1) {
      return prepareProperty(target, prop, fromVal, toVal[0]);
    }
    const segments = [];
    let currentFrom = fromVal;
    for (let i = 0; i < toVal.length; i++) {
      const segmentTo = toVal[i];
      const desc = prepareProperty(target, prop, currentFrom, segmentTo);
      segments.push(desc);
      
      if (!desc) {
        currentFrom = segmentTo;
      } else if (desc.type === 'complex' || desc.type === 'gradient') {
        currentFrom = desc.originalToValue;
      } else if (desc.unit !== undefined) {
        currentFrom = String(desc.to) + desc.unit;
      } else {
        currentFrom = desc.to;
      }
    }
    return { type: 'array-keyframes', prop, segments };
  }

  // Handle scale shorthand
  const actualProp = prop;

  // Color properties
  const isColorProp = COLOR_PROPS.has(prop) || COLOR_PROPS.has(camelCase(prop)) ||
                      isColor(String(fromVal)) || isColor(String(toVal));
  if (isColorProp) {
    const fromStr = fromVal !== undefined && fromVal !== null ? String(fromVal) : getCurrentValue(target, prop);
    const toStr = String(toVal);
    return { type: 'color', prop: actualProp, from: fromStr, to: toStr };
  }

  // Transform props
  if (TRANSFORM_PROPS.has(prop) && !isPlainObject(target)) {
    const state = getTransformState(target);
    const aliases = {
      rotate: 'rotation', rotateX: 'rotationX', rotateY: 'rotationY', rotateZ: 'rotationZ',
      translateX: 'x', translateY: 'y', translateZ: 'z',
    };
    const key = aliases[prop] || prop;

    // Helper to convert % to px for transforms
    const resolveTransformUnit = (valStr, rawNum) => {
      const parsed = parseValue(String(valStr));
      if (parsed && parsed.unit === '%') {
        const axis = /y|translateY/i.test(key) ? 'self-y' : 'self-x';
        return toPx(parsed.value, '%', target, axis);
      }
      return rawNum;
    };

    let fromRaw = fromVal !== undefined && fromVal !== null
      ? resolveNumeric(fromVal, prop)
      : (prop === 'scale' ? state.scaleX : (state[key] !== undefined ? state[key] : 0));
    
    let from = resolveTransformUnit(fromVal, fromRaw);
    
    let toRaw = resolveNumericTo(String(toVal), fromRaw, prop, fromVal, target, key);
    let to = resolveTransformUnit(toVal, toRaw);

    return { type: 'transform', prop: actualProp, key, from, to, state };
  }

  // Handle complex nested comma structures specifically for background/mask using the AST parser
  if (prop === 'background' || prop === 'backgroundImage' || prop === 'maskImage' || prop === 'mask') {
    return prepareBackground(prop, toVal, fromVal, target);
  }

  // Handle boxShadow with the legacy heuristic layer matching
  if (prop === 'boxShadow') {
    let toStr = String(toVal);
    let fromStr = fromVal != null ? String(fromVal) : getCurrentValue(target, prop);

    // 1. Browser-Assisted Normalization
    const doc = getOwnerDocument(target);
    if (doc) {
      const dummy = doc.createElement('div');
      const host = getMeasurementHost(target);
      
      if (host) {
        dummy.style.display = 'none';
        host.appendChild(dummy);
        
        dummy.style[prop] = toStr;
        const computedTo = getOwnerWindow(target).getComputedStyle(dummy)[prop];
        if (computedTo) toStr = computedTo;
        
        if (fromVal != null) {
          dummy.style[prop] = ''; // Clear previous value
          dummy.style[prop] = String(fromVal);
          const computedFrom = getOwnerWindow(target).getComputedStyle(dummy)[prop];
          if (computedFrom) fromStr = computedFrom;
        }
        
        host.removeChild(dummy);
      } else {
        dummy.style[prop] = toStr;
        if (dummy.style[prop]) toStr = dummy.style[prop];
        
        if (fromVal != null) {
          dummy.style[prop] = ''; // Clear previous value
          dummy.style[prop] = String(fromVal);
          if (dummy.style[prop]) fromStr = dummy.style[prop];
        }
      }
    }

    const toLayers = splitTopLevelCommas(toStr);
    const fromLayers = splitTopLevelCommas(fromStr);
    
    // Mismatched Box Shadow Padding: Pad with transparent shadows to allow smooth growth
    if (fromLayers.length < toLayers.length) {
      while (fromLayers.length < toLayers.length) {
        const targetComplex = parseComplexString(toLayers[fromLayers.length], target, prop);
        const zeroValues = new Array(targetComplex.values.length).fill(0);
        fromLayers.push(buildComplexString(targetComplex.template, zeroValues));
      }
    } else if (toLayers.length < fromLayers.length) {
      while (toLayers.length < fromLayers.length) {
        const targetComplex = parseComplexString(fromLayers[toLayers.length], target, prop);
        const zeroValues = new Array(targetComplex.values.length).fill(0);
        toLayers.push(buildComplexString(targetComplex.template, zeroValues));
      }
    }
    
    // 2. Heuristic Layer Matching
    const layerDescriptors = [];
    
    const toParsedGradients = toLayers.map(l => parseGradient(l));
    const fromParsedGradients = fromLayers.map(l => parseGradient(l));
    const fromComplex = fromLayers.map((l, i) => fromParsedGradients[i] ? null : parseComplexString(l, target, prop));
    const toComplex = toLayers.map((l, i) => toParsedGradients[i] ? null : parseComplexString(l, target, prop));

    const matchedFromIndices = new Set();

    for (let i = 0; i < toLayers.length; i++) {
      let matchIdx = -1;
      
      // 1. Try to find exact structural match
      if (toParsedGradients[i]) {
        for (let j = 0; j < fromLayers.length; j++) {
          if (matchedFromIndices.has(j)) continue;
          if (fromParsedGradients[j] && fromParsedGradients[j].type === toParsedGradients[i].type) {
            matchIdx = j;
            break;
          }
        }
      } else if (toComplex[i]) {
        for (let j = 0; j < fromLayers.length; j++) {
          if (matchedFromIndices.has(j)) continue;
          if (fromComplex[j] && fromComplex[j].template === toComplex[i].template) {
            matchIdx = j;
            break;
          }
        }
      }

      // 2. Try to find ANY match of the same broad category (gradient vs non-gradient)
      if (matchIdx === -1) {
        for (let j = 0; j < fromLayers.length; j++) {
          if (matchedFromIndices.has(j)) continue;
          if ((toParsedGradients[i] && fromParsedGradients[j]) || (!toParsedGradients[i] && !fromParsedGradients[j])) {
            matchIdx = j;
            break;
          }
        }
      }

      let parsedFrom = null;
      let complexFrom = null;
      let ts = toLayers[i];

      if (matchIdx !== -1) {
        matchedFromIndices.add(matchIdx);
        parsedFrom = fromParsedGradients[matchIdx];
        complexFrom = fromComplex[matchIdx];
      }

      // Create descriptor
      if (toParsedGradients[i]) {
        let parsedTo = toParsedGradients[i];
        if (!parsedFrom) {
          // Initialize from "to" template with alpha = 0 (Fade in)
          parsedFrom = {
            type: parsedTo.type,
            prefix: parsedTo.prefix,
            suffix: parsedTo.suffix,
            stops: parsedTo.stops.map(s => ({ ...s, a: 0 }))
          };
        } else {
          // Pad stops
          while (parsedFrom.stops.length < parsedTo.stops.length) {
            parsedFrom.stops.push({ ...parsedFrom.stops[parsedFrom.stops.length - 1] });
          }
          while (parsedTo.stops.length < parsedFrom.stops.length) {
            parsedTo.stops.push({ ...parsedTo.stops[parsedTo.stops.length - 1] });
          }
        }

        let prefixDescriptor = null;
        if (parsedFrom.prefix && parsedTo.prefix && parsedFrom.prefix !== parsedTo.prefix) {
          const cTo = parseComplexString(parsedTo.prefix, null, null);
          const cFrom = parseComplexString(parsedFrom.prefix, null, null);
          if (cTo && cFrom && cTo.template === cFrom.template) {
            prefixDescriptor = { template: cTo.template, fromValues: cFrom.values, toValues: cTo.values };
          }
        }

        let suffixDescriptor = null;
        if (parsedFrom.suffix && parsedTo.suffix && parsedFrom.suffix !== parsedTo.suffix) {
          const cTo = parseComplexString(parsedTo.suffix, null, null);
          const cFrom = parseComplexString(parsedFrom.suffix, null, null);
          if (cTo && cFrom && cTo.template === cFrom.template) {
            suffixDescriptor = { template: cTo.template, fromValues: cFrom.values, toValues: cTo.values };
          }
        }
        
        layerDescriptors.push({ type: 'gradient', fromG: parsedFrom, toG: parsedTo, originalToValue: ts, prefixDescriptor, suffixDescriptor });
      } else {
        // Non-gradient
        const complexTo = toComplex[i] || parseComplexString(ts, target, prop);
        if (complexFrom && complexTo && complexFrom.template === complexTo.template) {
           layerDescriptors.push({ type: 'complex', template: complexTo.template, fromValues: complexFrom.values, toValues: complexTo.values, originalToValue: ts });
        } else {
           // No match found or templates don't match. 
           // We can't fade a non-gradient. We just snap it.
           layerDescriptors.push({ type: 'snap', toValue: ts, fromValue: matchIdx !== -1 ? fromLayers[matchIdx] : null });
        }
      }
    }

    // Unmatched FROM layers (Preserve them so they don't immediately disappear!)
    const unmatchedFromLayers = [];
    for (let j = 0; j < fromLayers.length; j++) {
      if (!matchedFromIndices.has(j)) {
        unmatchedFromLayers.push(fromLayers[j]);
      }
    }

    return { type: 'complex-layers', prop: prop, layers: layerDescriptors, originalToValue: String(toVal), unmatchedFrom: unmatchedFromLayers };
  }

  // Border-Radius 8-Value Shorthand
  if (/border-?radius/i.test(prop)) {
    const toStr = String(toVal);
    const fromStr = fromVal != null ? String(fromVal) : getCurrentValue(target, prop);
    const parsedFrom = parseBorderRadius(fromStr);
    const parsedTo = parseBorderRadius(toStr);
    
    if (parsedFrom && parsedTo) {
      return {
        type: 'border-radius-8',
        prop,
        fromH: parsedFrom.h,
        fromV: parsedFrom.v,
        toH: parsedTo.h,
        toV: parsedTo.v,
        originalToValue: toStr
      };
    }
  }

  // CSS Custom Property (Unparsed Strings)
  if (prop.startsWith('--')) {
    const parsed = parseValue(String(toVal));
    if (!parsed && !isColor(String(toVal))) {
      const fromStr = fromVal != null ? String(fromVal) : getCurrentValue(target, prop);
      return { type: 'custom-prop-string', prop, from: fromStr, to: String(toVal) };
    }
  }

  // Unitless properties
  if (UNITLESS_PROPS.has(prop) || UNITLESS_PROPS.has(camelCase(prop))) {
    const fromRaw = fromVal != null ? fromVal : parseFloat(getCurrentValue(target, prop)) || 0;
    const toRaw = resolveNumericRelative(toVal, fromRaw);
    return { type: 'unitless', prop, from: parseFloat(fromRaw), to: parseFloat(toRaw) };
  }

  // Complex values (e.g., box-shadow, transform, clip-path, filter) - string interpolation not supported; skip with warning
  let toStr = String(toVal);
  const toParsed = parseValue(toStr);
  let fromStr = fromVal != null ? String(fromVal) : getCurrentValue(target, prop);

  // Dedicated Clip-Path Handler
  if (prop === 'clipPath' || prop === 'clip-path') {
    return prepareClipPath(target, fromStr, toStr);
  }

  const fromParsed = parseValue(fromStr);
  
  let resolvedToStr = toStr;
  if (fromParsed && typeof toVal === 'string') {
    const relMatch = toVal.match(/^([+\-*])=([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(.*)?$/);
    if (relMatch) {
      let relUnit = relMatch[3] || fromParsed.unit || 'px';
      if (relUnit !== fromParsed.unit && isDOMElement(target)) {
        const lengthUnits = ['px', '%', 'vw', 'vh', 'vmin', 'vmax', 'rem', 'em', 'cm', 'mm', 'in', 'pt', 'pc'];
        if (lengthUnits.includes(relUnit) && lengthUnits.includes(fromParsed.unit)) {
          let fallbackAxis = /translateX|border-?radius/i.test(prop) ? 'self-x' : 
                       /translateY/i.test(prop) ? 'self-y' : 
                       /x|width|left|right|padding|margin/i.test(prop) ? 'x' : 'y';
          const basePx = toPx(fromParsed.value, fromParsed.unit, target, fallbackAxis);
          const relPx = toPx(parseFloat(relMatch[2]), relUnit, target, fallbackAxis);
          
          let newValue;
          switch (relMatch[1]) {
            case '+': newValue = basePx + relPx; break;
            case '-': newValue = basePx - relPx; break;
            case '*': newValue = basePx * relPx; break;
          }
          resolvedToStr = newValue + 'px';
        }
      } else {
        const rel = resolveRelative(toVal, fromParsed);
        if (rel) resolvedToStr = String(rel.value) + (rel.unit || fromParsed.unit || 'px');
      }
    }
  }
  
  const reParsedTo = parseValue(resolvedToStr);

  // If simple parsing fails, try complex string parsing
  if (!reParsedTo || !fromParsed) {
    const complexTo = parseComplexString(toStr, target, prop);
    if (complexTo) {
      const complexFrom = parseComplexString(fromStr, target, prop);
      if (complexFrom) {
        // Ensure templates match structurally
        if (complexFrom.template === complexTo.template && complexFrom.values.length === complexTo.values.length) {
          return {
            type: 'complex',
            prop,
            template: complexTo.template,
            from: complexFrom.values,
            to: complexTo.values,
            originalToValue: toStr
          };
        }
        
        // Mismatch Fallback: For CSS shorthands like margin/padding/borderRadius, 
        // 10px and 10px 20px mean the same thing but have different template lengths.
        // We can safely adopt the destination template and cycle the start values to match.
        const isShorthand = prop.toLowerCase().match(/margin|padding|radius|border/);
        if (isShorthand && complexFrom.values.length > 0 && complexTo.values.length > 0) {
          const fromBigger = complexFrom.values.length >= complexTo.values.length;
          const targetTemplate = fromBigger ? complexFrom.template : complexTo.template;
          const targetLen = fromBigger ? complexFrom.values.length : complexTo.values.length;
          
          const expandedFrom = [];
          const expandedTo = [];
          
          for (let i = 0; i < targetLen; i++) {
            expandedFrom.push(complexFrom.values[i % complexFrom.values.length]);
            expandedTo.push(complexTo.values[i % complexTo.values.length]);
          }
          return {
            type: 'complex',
            prop,
            template: targetTemplate,
            from: expandedFrom,
            to: expandedTo,
            originalToValue: toStr
          };
        }

        // Canonicalization Fallback: For properties like box-shadow or filter, the input might 
        // be perfectly valid but ordered differently than the browser's computed style (e.g. color first).
        // We can force the browser to parse and normalize the target value so it matches the start template!
        if (!isShorthand && getOwnerDocument(target)?.body) {
          const doc = getOwnerDocument(target);
          const host = getMeasurementHost(target);
          const dummy = doc.createElement('div');
          
          if (target && typeof target.offsetWidth === 'number' && target.offsetWidth > 0) {
            dummy.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;width:${target.offsetWidth}px;height:${target.offsetHeight}px;`;
          } else {
            dummy.style.display = 'none';
          }
          
          host.appendChild(dummy);
          dummy.style[prop] = toStr;
          
          const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          const kebab = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
          const win = getOwnerWindow(target);
          const browserTo = win.getComputedStyle(dummy)[camel] || win.getComputedStyle(dummy).getPropertyValue(kebab);
          
          host.removeChild(dummy);
          
          if (browserTo && browserTo !== toStr && browserTo !== 'none') {
            const complexBrowserTo = parseComplexString(browserTo, target, prop);
            if (complexBrowserTo && complexFrom.template === complexBrowserTo.template) {
              return {
                type: 'complex',
                prop,
                template: complexBrowserTo.template,
                from: complexFrom.values,
                to: complexBrowserTo.values,
                originalToValue: toStr
              };
            }
          }
        }
      }
    }
    return { type: 'snap', prop, from: fromStr, to: toStr };
  }

  // If we reach here, we are using the numeric fallback
  // fromParsed and reParsedTo are already evaluated correctly at the top of the function
  
  let from = fromParsed.value;
  let to = reParsedTo.value;
  let unit = reParsedTo.unit || fromParsed.unit || (isPlainObject(target) ? '' : (UNITLESS_PROPS.has(prop) ? '' : 'px'));
  
  const fromUnit = fromParsed.unit || 'px';
  const toUnit = reParsedTo.unit || 'px';

  // If units mismatch, normalize to px or deg for the interpolation
  let interpolateInPx = false;
  let fallbackAxis = 'x';
  if (fromUnit !== toUnit && isDOMElement(target)) {
    const lengthUnits = ['px', '%', 'vw', 'vh', 'vmin', 'vmax', 'rem', 'em', 'cm', 'mm', 'in', 'pt', 'pc'];
    const angleUnits = ['deg', 'rad', 'turn', 'grad'];
    
    if (lengthUnits.includes(fromUnit) && lengthUnits.includes(toUnit)) {
      fallbackAxis = /translateX|border-?radius/i.test(prop) ? 'self-x' : 
                   /translateY/i.test(prop) ? 'self-y' : 
                   /x|width|left|right|padding|margin/i.test(prop) ? 'x' : 'y';
      
      from = toPx(from, fromUnit, target, fallbackAxis);
      to = toPx(to, toUnit, target, fallbackAxis);
      interpolateInPx = true;
    } else if (angleUnits.includes(fromUnit) && angleUnits.includes(toUnit)) {
      from = toAngle(from, fromUnit, 'deg');
      to = toAngle(to, toUnit, 'deg');
      unit = 'deg';
    }
  }

  return {
    type: interpolateInPx ? 'numeric-px-fallback' : 'numeric',
    prop,
    from,
    to,
    unit,
    originalToValue: reParsedTo.value,
    originalToUnit: reParsedTo.unit,
    axis: interpolateInPx ? fallbackAxis : undefined
  };
}

function resolveNumeric(val, prop) {
  if (typeof val === 'number') return val;
  const parsed = parseValue(String(val));
  return parsed ? parsed.value : 0;
}

function resolveNumericTo(toStr, fromRaw, prop, fromVal, target, key) {
  const relMatch = toStr.match(/^([+\-*])=([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(.*)?$/);
  if (relMatch) {
    const fromParsed = parseValue(String(fromVal));
    const fromUnit = (fromParsed && fromParsed.unit) ? fromParsed.unit : (TRANSFORM_UNITS[prop] || 'px');
    const relUnit = relMatch[3] || fromUnit;
    
    if (relUnit !== fromUnit && isDOMElement(target)) {
      const axis = /y|translateY/i.test(key) ? 'self-y' : 'self-x';
      const basePx = toPx(fromRaw, fromUnit, target, axis);
      const relPx = toPx(parseFloat(relMatch[2]), relUnit, target, axis);
      
      let newValue;
      switch (relMatch[1]) {
        case '+': newValue = basePx + relPx; break;
        case '-': newValue = basePx - relPx; break;
        case '*': newValue = basePx * relPx; break;
      }
      return newValue;
    }
  }

  const rel = resolveRelative(toStr, { value: fromRaw, unit: TRANSFORM_UNITS[prop] || 'px' });
  if (rel) return rel.value;
  return resolveNumeric(toStr, prop);
}

function resolveNumericRelative(toVal, from) {
  if (typeof toVal === 'number') return toVal;
  const rel = resolveRelative(String(toVal), { value: from, unit: '' });
  if (rel) return rel.value;
  return parseFloat(toVal) || 0;
}

// Applying interpolated values to targets

/**
 * Apply an interpolated value at progress t ∈ [0,1] for a prepared property descriptor.
 */
export function applyProperty(target, descriptor, t) {
  const { type, prop, from, to } = descriptor;

  switch (type) {
    case 'array-keyframes': {
      const { segments } = descriptor;
      const count = segments.length;
      
      let segmentIndex = Math.floor(t * count);
      if (segmentIndex >= count) {
        segmentIndex = count - 1;
      } else if (segmentIndex < 0) {
        segmentIndex = 0;
      }
      
      const segmentT = (t * count) - segmentIndex;
      applyProperty(target, segments[segmentIndex], segmentT);
      break;
    }

    case 'plugin': {
      propertyPlugins[prop].render(target, descriptor, t);
      break;
    }

    case 'color': {
      const value = interpolateColor(from, to, t);
      setStyle(target, prop, value);
      break;
    }

    case 'transform': {
      const { key, state } = descriptor;
      const value = lerp(from, to, t);
      if (prop === 'scale') {
        state.scaleX = value;
        state.scaleY = value;
      } else {
        state[key] = value;
      }
      if (isDOMElement(target)) {
        target.style.transform = buildTransformString(state);
      }
      break;
    }

    case 'custom-prop-string': {
      // String snap for custom props
      if (t >= 1 && isDOMElement(target)) {
        target.style.setProperty(prop, to);
      }
      break;
    }

    case 'unitless': {
      let value = lerp(from, to, t);
      if (INTEGER_PROPS.has(prop)) value = Math.round(value);
      setStyle(target, prop, value);
      break;
    }

    case 'numeric': {
      const value = lerp(from, to, t);
      const unit = descriptor.unit || '';
      setStyle(target, prop, `${value}${unit}`);
      break;
    }

    case 'numeric-px-fallback': {
      let liveTo = descriptor.to;
      if (descriptor.originalToUnit && ['%', 'vw', 'vh', 'vmin', 'vmax', 'rem', 'em'].includes(descriptor.originalToUnit)) {
        liveTo = toPx(descriptor.originalToValue, descriptor.originalToUnit, target, descriptor.axis);
      }
      const value = lerp(descriptor.from, liveTo, t);
      if (t >= 1 && descriptor.originalToUnit) {
        setStyle(target, prop, `${descriptor.originalToValue}${descriptor.originalToUnit}`);
      } else {
        setStyle(target, prop, `${value}px`);
      }
      break;
    }

    case 'background-layers': {
      applyBackground(target, prop, descriptor, t);
      break;
    }

    case 'border-radius-8': {
      const hStr = descriptor.fromH.map((f, i) => {
        const toObj = descriptor.toH[i];
        let liveTo = toObj.value;
        if (toObj.unit && ['%', 'vw', 'vh', 'vmin', 'vmax', 'rem', 'em'].includes(toObj.unit)) {
          liveTo = toPx(toObj.value, toObj.unit, target, 'self-x');
        }
        const liveFrom = toPx(f.value, f.unit, target, 'self-x');
        return `${lerp(liveFrom, liveTo, t)}px`;
      }).join(' ');

      const vStr = descriptor.fromV.map((f, i) => {
        const toObj = descriptor.toV[i];
        let liveTo = toObj.value;
        if (toObj.unit && ['%', 'vw', 'vh', 'vmin', 'vmax', 'rem', 'em'].includes(toObj.unit)) {
          liveTo = toPx(toObj.value, toObj.unit, target, 'self-y');
        }
        const liveFrom = toPx(f.value, f.unit, target, 'self-y');
        return `${lerp(liveFrom, liveTo, t)}px`;
      }).join(' ');

      if (t >= 1 && descriptor.originalToValue) {
        setStyle(target, prop, descriptor.originalToValue);
      } else {
        setStyle(target, prop, `${hStr} / ${vStr}`);
      }
      break;
    }

    case 'clip-path': {
      setStyle(target, prop, interpolateClipPath(descriptor, t));
      break;
    }

    case 'snap': {
      if (t >= 1) setStyle(target, prop, to);
      else setStyle(target, prop, from);
      break;
    }

    case 'complex': {
      const interpolated = [];
      for (let i = 0; i < descriptor.from.length; i++) {
        interpolated.push(lerp(descriptor.from[i], descriptor.to[i], t));
      }
      let val = t === 1 ? descriptor.originalToValue : buildComplexString(descriptor.template, interpolated);
      setStyle(target, prop, val);
      break;
    }
    case 'complex-layers': {
      if (t >= 1) {
        setStyle(target, prop, descriptor.originalToValue);
      } else {
        const outLayers = [];
        for (const layer of descriptor.layers) {
          
          if (layer.type === 'gradient') {
            let prefix = layer.toG.prefix !== undefined ? layer.toG.prefix : layer.fromG.prefix;
            if (layer.prefixDescriptor) {
              const interpolated = [];
              for (let i = 0; i < layer.prefixDescriptor.fromValues.length; i++) {
                interpolated.push(lerp(layer.prefixDescriptor.fromValues[i], layer.prefixDescriptor.toValues[i], t));
              }
              prefix = buildComplexString(layer.prefixDescriptor.template, interpolated);
            }

            let suffix = layer.toG.suffix !== undefined ? layer.toG.suffix : layer.fromG.suffix;
            if (layer.suffixDescriptor) {
              const interpolated = [];
              for (let i = 0; i < layer.suffixDescriptor.fromValues.length; i++) {
                interpolated.push(lerp(layer.suffixDescriptor.fromValues[i], layer.suffixDescriptor.toValues[i], t));
              }
              suffix = buildComplexString(layer.suffixDescriptor.template, interpolated);
            }
            
            const liveG = {
              type: layer.toG.type,
              prefix,
              suffix,
              stops: []
            };
            for (let i = 0; i < layer.fromG.stops.length; i++) {
              const fs = layer.fromG.stops[i];
              const ts = layer.toG.stops[i];
              const r = lerp(fs.r, ts.r, t);
              const g = lerp(fs.g, ts.g, t);
              const b = lerp(fs.b, ts.b, t);
              const a = lerp(fs.a, ts.a, t);
              let posRaw = ts.posParsed ? ts.posRaw : fs.posRaw;
              if (fs.posParsed && ts.posParsed && fs.posParsed.unit === ts.posParsed.unit) {
                posRaw = `${lerp(fs.posParsed.value, ts.posParsed.value, t)}${fs.posParsed.unit}`;
              }
              liveG.stops.push({ r, g, b, a, posRaw });
            }
            outLayers.push(buildGradient(liveG));
            
          } else if (layer.type === 'complex') {
            const interpolated = [];
            for (let i = 0; i < layer.fromValues.length; i++) {
              interpolated.push(lerp(layer.fromValues[i], layer.toValues[i], t));
            }
            outLayers.push(buildComplexString(layer.template, interpolated));
            
          } else if (layer.type === 'snap') {
            if (t >= 1 && layer.toValue) outLayers.push(layer.toValue);
            else if (t < 1 && layer.fromValue) outLayers.push(layer.fromValue);
          } else {
            const pushVal = layer.toValue || layer.to;
            if (pushVal) outLayers.push(pushVal);
          }
        }
        
        // Append any unmatched FROM layers so they are preserved beneath the fading layers
        if (descriptor.unmatchedFrom && descriptor.unmatchedFrom.length > 0) {
          for (const unmatched of descriptor.unmatchedFrom) {
            outLayers.push(unmatched);
          }
        }
        
        setStyle(target, prop, outLayers.join(', '));
      }
      break;
    }
  }
}

function setStyle(target, prop, value) {
  if (isPlainObject(target)) {
    // Plain JS object - store raw numeric value (strip any CSS unit suffix like 'px')
    const camel = camelCase(prop.replace(/^-/, ''));
    const numeric = parseFloat(value);
    const stored  = !isNaN(numeric) && String(value) !== String(false) ? numeric : value;
    target[prop]  = stored;
    target[camel] = stored;
    return;
  }
  if (!isDOMElement(target)) return;

  const el = target;
  const camel = camelCase(prop.startsWith('-') && !prop.startsWith('--')
    ? prop.slice(1) : prop);

  if (prop.startsWith('--')) {
    el.style.setProperty(prop, value);
  } else {
    el.style[camel] = value;
  }
}

// Snapshot / restore

/**
 * Record the current inline style of an element for later restore.
 */
export function snapshotStyles(el, props) {
  const snapshot = {};
  for (const prop of props) {
    if (TRANSFORM_PROPS.has(prop)) {
      snapshot.__transform = { ...getTransformState(el) };
    } else if (prop.startsWith('--')) {
      snapshot[prop] = el.style.getPropertyValue(prop);
    } else {
      snapshot[prop] = el.style[camelCase(prop)] || '';
    }
  }
  return snapshot;
}

/**
 * Restore previously snapshotted styles.
 */
export function restoreStyles(el, snapshot) {
  for (const [prop, val] of Object.entries(snapshot)) {
    if (prop === '__transform') {
      Object.assign(getTransformState(el), val);
      el.style.transform = buildTransformString(val);
    } else if (prop.startsWith('--')) {
      el.style.setProperty(prop, val);
    } else {
      el.style[camelCase(prop)] = val;
    }
  }
}

export { TRANSFORM_UNITS, camelCase, getCurrentValue };
export default { prepareProperty, applyProperty, snapshotStyles, restoreStyles, TRANSFORM_PROPS };