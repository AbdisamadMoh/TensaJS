
import { resolveTarget, getOwnerDocument, getOwnerWindow } from './TargetResolver.js';
import { getTransformState, TRANSFORM_PROPS, camelCase } from './CSSPlugin.js';
import { parseValue, toPx, toAngle } from './UnitParser.js';

/**
 * Get the current value of a CSS or animated property on a target.
 * Returns a number, or a string with unit if unit is specified.
 * 
 * @param {string|Element} target
 * @param {string} prop - CSS property or Tensa shorthand (x, y, rotation, etc.)
 * @param {string} [unit] - desired output unit (px, %, rem, deg, etc.)
 * @returns {number|string}
 */
export function measure(target, prop, unit) {
  const el = typeof target === 'string' ? resolveTarget(target) : target;
  if (!el) return unit ? `0${unit}` : 0;

  // Transform shorthands from cache
  if (TRANSFORM_PROPS.has(prop)) {
    const state = getTransformState(el);
    const aliases = {
      rotate: 'rotation', rotateX: 'rotationX', rotateY: 'rotationY', rotateZ: 'rotationZ',
      translateX: 'x', translateY: 'y', translateZ: 'z',
    };
    const key = aliases[prop] || prop;
    const value = key ? (state[key] ?? 0) : 0;
    return unit ? `${value}${unit}` : value;
  }

  // CSS Custom Property
  if (prop.startsWith('--')) {
    const raw = el.style?.getPropertyValue(prop)?.trim() ||
                getOwnerWindow(el).getComputedStyle(el)?.getPropertyValue(prop)?.trim() || '0';
    if (unit) return `${parseFloat(raw)}${unit}`;
    return parseFloat(raw) || raw;
  }

  // Regular CSS property
  const cs = getOwnerWindow(el).getComputedStyle(el);
  const camel = camelCase(prop);
  const raw = cs[camel] || cs.getPropertyValue(prop) || '0';

  const parsed = parseValue(raw);
  if (!parsed) return unit ? `0${unit}` : raw;

  if (!unit || unit === parsed.unit) {
    return unit ? `${parsed.value}${unit}` : parsed.value;
  }

  // Convert units if needed
  let value = parsed.value;
  if (parsed.unit === 'px' && unit === '%') {
    const parent = el.parentElement || getOwnerDocument(el).documentElement;
    const ref = prop.toLowerCase().includes('height') ? parent.offsetHeight : parent.offsetWidth;
    value = ref > 0 ? (value / ref) * 100 : 0;
  } else if (parsed.unit === '%' && unit === 'px') {
    value = toPx(value, '%', el);
  } else if (['deg','rad','turn','grad'].includes(unit)) {
    value = toAngle(value, parsed.unit, unit);
  }

  return unit ? `${value}${unit}` : value;
}

/**
 * Get all currently animated properties of a target as a plain object.
 */
export function measureAll(target) {
  const el = typeof target === 'string' ? resolveTarget(target) : target;
  if (!el) return {};

  const state = getTransformState(el);
  const cs = getOwnerWindow(el).getComputedStyle(el);

  return {
    ...state,
    opacity:    parseFloat(cs.opacity),
    width:      cs.width,
    height:     cs.height,
    color:      cs.color,
    backgroundColor: cs.backgroundColor,
  };
}

export default { measure, measureAll };
