/**
 * Tensa UnitParser - CSS unit parsing, conversion, and relative value handling
 * 
 * Handles: px, %, vw, vh, vmin, vmax, rem, em, deg, rad, turn, grad, auto
 * Relative ops: +=, -=, *=
 * Function values: (target, index, targets) => value
 */

import { replaceColorsWithRgba } from './ColorParser.js';
import { getOwnerDocument, getOwnerWindow } from './TargetResolver.js';

const UNIT_REGEX = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|%|vw|vh|vmin|vmax|rem|em|ch|ex|cm|mm|in|pt|pc|deg|rad|turn|grad|fr|s|ms)?$/i;
const RELATIVE_REGEX = /^([+\-*])=([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(.*)?$/;
const NUMBER_REGEX = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/**
 * Parse a CSS value string into { value: number, unit: string }
 * Returns null if unparseable.
 */
export function parseValue(str) {
  if (str === null || str === undefined) return null;
  if (typeof str === 'number') return { value: str, unit: '' };

  const s = String(str).trim();

  if (s === 'auto') return { value: 'auto', unit: 'auto' };
  if (s === 'none') return { value: 'none', unit: 'none' };

  const match = s.match(UNIT_REGEX);
  if (match) {
    return {
      value: parseFloat(match[1]),
      unit: match[2] || '',
    };
  }

  return null;
}

/**
 * Resolve a relative value expression against a base value.
 * '+=' → add, '-=' → subtract, '*=' → multiply
 * Returns a resolved { value, unit } or null if not relative.
 */
export function resolveRelative(expr, base, convertFn) {
  if (typeof expr !== 'string') return null;
  const match = expr.match(RELATIVE_REGEX);
  if (!match) return null;

  const op = match[1];
  let amount = parseFloat(match[2]);
  let unit = match[3] || (base ? base.unit : 'px');
  const baseVal = base ? base.value : 0;

  if (base && unit !== base.unit && convertFn) {
    amount = convertFn(amount, unit, base.unit);
    unit = base.unit;
  }

  let value;
  switch (op) {
    case '+': value = baseVal + amount; break;
    case '-': value = baseVal - amount; break;
    case '*': value = baseVal * amount; break;
    default:  value = baseVal;
  }

  return { value, unit };
}

/**
 * Convert a value from one unit to px using a reference element.
 * For viewport units, uses window dimensions.
 * For %, uses the element's parent dimensions.
 */
export function toPx(value, unit, element, axis = 'x') {
  if (unit === 'px' || unit === '' || !unit) return value;

  switch (unit) {
    case '%': {
      if (!element) return value;
      // Add self-relative context
      if (axis === 'self-x') return (value / 100) * element.offsetWidth;
      if (axis === 'self-y') return (value / 100) * element.offsetHeight;

      const parent = element.parentElement || getOwnerDocument(element).documentElement;
      const ref = axis === 'y' ? parent.offsetHeight : parent.offsetWidth;
      return (value / 100) * ref;
    }
    case 'vw': return (value / 100) * getOwnerWindow(element).innerWidth;
    case 'vh': return (value / 100) * getOwnerWindow(element).innerHeight;
    case 'vmin': return (value / 100) * Math.min(getOwnerWindow(element).innerWidth, getOwnerWindow(element).innerHeight);
    case 'vmax': return (value / 100) * Math.max(getOwnerWindow(element).innerWidth, getOwnerWindow(element).innerHeight);
    case 'rem': {
      const doc = getOwnerDocument(element);
      const rootFontSize = parseFloat(getOwnerWindow(element).getComputedStyle(doc.documentElement).fontSize) || 16;
      return value * rootFontSize;
    }
    case 'em': {
      const fontSize = element
        ? parseFloat(getOwnerWindow(element).getComputedStyle(element).fontSize) || 16
        : 16;
      return value * fontSize;
    }
    case 'cm':  return value * 37.8;
    case 'mm':  return value * 3.78;
    case 'in':  return value * 96;
    case 'pt':  return value * 1.333;
    case 'pc':  return value * 16;
    default: return value;
  }
}

/**
 * Convert degrees to radians
 */
export function degToRad(deg) { return deg * (Math.PI / 180); }

/**
 * Convert radians to degrees
 */
export function radToDeg(rad) { return rad * (180 / Math.PI); }

/**
 * Normalize an angular value to a given unit ('deg', 'rad', 'turn', 'grad')
 */
export function toAngle(value, fromUnit, toUnit = 'deg') {
  let degrees;
  switch (fromUnit) {
    case 'rad':  degrees = radToDeg(value); break;
    case 'turn': degrees = value * 360; break;
    case 'grad': degrees = value * 0.9; break;
    default:     degrees = value;
  }
  switch (toUnit) {
    case 'rad':  return degToRad(degrees);
    case 'turn': return degrees / 360;
    case 'grad': return degrees / 0.9;
    default:     return degrees;
  }
}

/**
 * Get computed CSS value for a property on an element.
 * Returns { value, unit } object.
 */
export function getComputedValue(element, prop) {
  if (!element || !element.style) return null;
  const cs = getOwnerWindow(element).getComputedStyle(element);
  const raw = cs.getPropertyValue(prop) || cs[prop] || '';
  if (!raw || raw === 'auto' || raw === 'none') {
    return { value: 0, unit: 'px', raw };
  }
  const parsed = parseValue(raw.trim());
  return parsed || { value: 0, unit: 'px', raw };
}

/**
 * Clamp a number between min and max.
 */
export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Linear interpolation between a and b.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

const NUMBER_AND_UNIT_REGEX = /(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px|%|vw|vh|vmin|vmax|rem|em|ch|ex|cm|mm|in|pt|pc|deg|rad|turn|grad|fr|s|ms)?/gi;

/**
 * Parses a complex multi-value string (e.g., "0px 4px rgba(0,0,0,0.5)")
 * into a template and an array of numeric values.
 * If target is provided, it canonicalizes relative units (vw, rem) to px.
 */
export function parseComplexString(str, target, prop = '') {
  if (typeof str !== 'string') return null;
  
  // 1. MASK URLs: Protect URLs so numbers inside filenames/paths aren't animated
  const protectedUrls = [];
  let maskedStr = str.replace(/url\([^)]+\)/gi, match => {
    protectedUrls.push(match);
    return `__URL_${protectedUrls.length - 1}__`;
  });

  // If there are no numbers left outside of the URLs, bail out
  if (!NUMBER_AND_UNIT_REGEX.test(maskedStr)) return null; 
  
  // 2. Normalize extra whitespace
  const normalizedSpaces = maskedStr.replace(/\s+/g, ' ').trim();

  // 3. Normalize all colors to rgba() format
  const normalizedStr = replaceColorsWithRgba(normalizedSpaces);
  
  // 4. Extract numbers and optional units
  const values = [];
  let template = normalizedStr.replace(NUMBER_AND_UNIT_REGEX, (match, numStr, unit, offset) => {
    let val = parseFloat(numStr);
    let outUnit = unit || '';

    // Convert length/angle units internally if we have a target
    if (unit && target) {
      // clip-path, background-position, and transform-origin percentages should remain as percentages
      // because they are intrinsically self-relative and browsers often retain them as %.
      if (unit === '%' && /clip-?path|background-?position|transform-?origin/i.test(prop)) {
        // Do not convert
      }
      else if (['vw', 'vh', 'vmin', 'vmax', 'rem', 'em', 'cm', 'mm', 'in', 'pt', 'pc', '%'].includes(unit)) {
        let axis = /translateX/i.test(str) || /border-?radius|border/i.test(prop) ? 'self-x' : 
                     /translateY/i.test(str) ? 'self-y' : 
                     /x|width|left|right|padding|margin/i.test(prop) ? 'x' : 'y';
        
        if (/border-?radius/i.test(prop) && str.includes('/')) {
          const slashIndex = str.indexOf('/');
          if (offset > slashIndex) {
            axis = 'self-y';
          }
        }
        val = toPx(val, unit, target, axis);
        outUnit = 'px';
      } else if (['rad', 'turn', 'grad'].includes(unit)) {
        val = toAngle(val, unit, 'deg');
        outUnit = 'deg';
      }
    }
    
    values.push(val);
    return '{}' + outUnit;
  });
  
  // 5. UNMASK URLs: Inject the protected URLs safely back into the final template
  protectedUrls.forEach((url, i) => {
    template = template.replace(`__URL_${i}__`, url);
  });

  if (values.length === 0) return null;
  return { template, values };
}

/**
 * Reconstructs a complex string from a template and an array of numeric values.
 */
export function buildComplexString(template, values) {
  let i = 0;
  const res = template.replace(/\{\}/g, () => {
    let v = values[i++];
    return Math.abs(v) < 0.00001 && v !== 0 ? 0 : Math.round(v * 10000) / 10000;
  });
  return res;
}

/**
 * Determine the best unit to use for a property, resolving
 * 'auto' or missing units from the computed style.
 */
export function resolveUnit(rawFrom, rawTo, element, prop) {
  // If 'to' has a unit, use it
  if (rawTo && rawTo.unit && rawTo.unit !== 'auto') return rawTo.unit;
  // Fall back to 'from' unit
  if (rawFrom && rawFrom.unit && rawFrom.unit !== 'auto') return rawFrom.unit;
  // Fall back to computed style
  if (element) {
    const computed = getComputedValue(element, prop);
    if (computed && computed.unit) return computed.unit;
  }
  return 'px';
}

export default { parseValue, resolveRelative, toPx, toAngle, lerp, clamp, getComputedValue, parseComplexString, buildComplexString, parseBorderRadius, parseGradient, buildGradient, splitTopLevelCommas };
/**
 * Dedicated parser for CSS border-radius shorthands.
 * Accurately extracts 1 to 4 values per axis, handling the optional '/' separator,
 * and normalizes the output into an 8-value structure (4 horizontal, 4 vertical).
 * Each value is an object { value: Number, unit: String }.
 *
 * @param {string} str - The border-radius string (e.g., "10px", "300px 50%", "10px 20px / 30px")
 * @returns {Object|null} - { h: [{value, unit}...], v: [{value, unit}...] } or null if invalid
 */
export function parseBorderRadius(str) {
  if (typeof str !== 'string') return null;

  const parts = str.split('/').map(s => s.trim());
  if (parts.length > 2) return null; // Invalid syntax

  // Helper to parse a single side into an array of {value, unit}
  const parseSide = (sideStr) => {
    const vals = [];
    const regex = /([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|%|vw|vh|vmin|vmax|rem|em|ch|ex|cm|mm|in|pt|pc)?/gi;
    let match;
    while ((match = regex.exec(sideStr)) !== null) {
      vals.push({
        value: parseFloat(match[1]),
        unit: match[2] || 'px'
      });
    }
    return vals;
  };

  const expandToFour = (vals) => {
    if (vals.length === 0) return null;
    if (vals.length === 1) return [vals[0], vals[0], vals[0], vals[0]];
    if (vals.length === 2) return [vals[0], vals[1], vals[0], vals[1]];
    if (vals.length === 3) return [vals[0], vals[1], vals[2], vals[1]];
    if (vals.length >= 4) return [vals[0], vals[1], vals[2], vals[3]];
    return null;
  };

  const horizontalRaw = parseSide(parts[0]);
  const horizontal = expandToFour(horizontalRaw);
  if (!horizontal) return null;

  let vertical;
  if (parts.length === 2) {
    const verticalRaw = parseSide(parts[1]);
    vertical = expandToFour(verticalRaw);
    if (!vertical) return null;
  } else {
    // If no slash, vertical perfectly mirrors horizontal
    vertical = [...horizontal];
  }

  return { h: horizontal, v: vertical };
}

/**
 * Safely splits a CSS string by top-level commas, ignoring commas
 * nested inside parentheses like url(...) or rgba(...).
 */
export function splitTopLevelCommas(str) {
  if (!str) return [];
  const result = [];
  let current = '';
  let depth = 0;
  
  // State trackers
  let inSingle = false;
  let inDouble = false;
  let inComment = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1];
    const prevChar = str[i - 1];

    // 1. Handle Escaped Characters
    const isEscaped = prevChar === '\\';
    if (isEscaped) {
      current += char;
      continue;
    }

    // 2. Handle CSS Comments
    if (!inSingle && !inDouble) {
      if (inComment) {
        current += char;
        if (char === '*' && nextChar === '/') {
          inComment = false;
          current += nextChar; // Add the trailing slash
          i++; // Skip the next loop iteration
        }
        continue;
      } else if (char === '/' && nextChar === '*') {
        inComment = true;
        current += char;
        current += nextChar;
        i++;
        continue;
      }
    }

    // 3. Handle String Quotes
    if (!inComment) {
      if (char === "'" && !inDouble) inSingle = !inSingle;
      if (char === '"' && !inSingle) inDouble = !inDouble;
    }

    // 4. Structural Bracket Tracking (Only when outside strings/comments)
    if (!inSingle && !inDouble && !inComment) {
      if (char === '(') depth++;
      else if (char === ')') depth = Math.max(0, depth - 1);
      else if (char === ',' && depth === 0) {
        // Safe to split!
        result.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current) result.push(current.trim());
  return result;
}

/**
 * Parses a CSS gradient string into a structured object.
 * Extracts the type, prefix (angle/shape), and an array of color stops.
 * @param {string} str - e.g., "linear-gradient(90deg, red 0%, blue 100%)"
 */
export function parseGradient11(str) {
  if (typeof str !== 'string' || str.trim() === 'none') return null;

  const typeMatch = /((?:repeating-)?(?:linear|radial|conic)-gradient)\((.*)\)/i.exec(str);
  if (!typeMatch) return null;

  const type = typeMatch[1].toLowerCase();
  const content = typeMatch[2];

  // Replace colors with rgba so we have a consistent format to parse
  const rgbaContent = replaceColorsWithRgba(content);

  const firstRgba = rgbaContent.indexOf('rgba(');
  if (firstRgba === -1) return null; // No colors found

  let prefix = '';
  if (firstRgba > 0) {
    prefix = rgbaContent.substring(0, firstRgba).trim();
    if (prefix.endsWith(',')) prefix = prefix.slice(0, -1).trim();
  }

  const stops = [];
  const regex = /rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)\s*([^,]*)/gi;
  let match;
  
  while ((match = regex.exec(rgbaContent)) !== null) {
    const posStr = match[5] ? match[5].trim() : '';
    const parsedPos = posStr ? parseValue(posStr) : null;
    stops.push({
      r: parseFloat(match[1]),
      g: parseFloat(match[2]),
      b: parseFloat(match[3]),
      a: parseFloat(match[4]),
      posRaw: posStr,
      posParsed: parsedPos
    });
  }

  if (stops.length === 0) return null;

  return { type, prefix, stops };
}

/**
 * Reconstructs a gradient string from a structured gradient object.
 */
export function buildGradient11(g) {
  const stopsStr = g.stops.map(s => {
    // Clamp alpha safely
    const a = clamp(s.a, 0, 1);
    // Limit decimals for cleaner strings
    const r = Math.round(s.r);
    const gVal = Math.round(s.g);
    const b = Math.round(s.b);
    const alpha = Math.round(a * 1000) / 1000;
    
    const color = `rgba(${r}, ${gVal}, ${b}, ${alpha})`;
    const pos = s.posRaw ? ` ${s.posRaw}` : '';
    return `${color}${pos}`;
  }).join(', ');
  
  const prefix = g.prefix ? `${g.prefix}, ` : '';
  return `${g.type}(${prefix}${stopsStr})`;
}

export function parseGradient(str) {
  if (typeof str !== 'string' || str.trim() === 'none') return null;

  // FIX: Added `(.*)` at the end to capture sizing/positioning/repeat suffixes
  const typeMatch = /((?:repeating-)?(?:linear|radial|conic)-gradient)\((.*)\)(.*)/i.exec(str);
  if (!typeMatch) return null;

  const type = typeMatch[1].toLowerCase();
  const content = typeMatch[2];
  const suffix = typeMatch[3] || ''; // Capture the suffix!

  const rgbaContent = replaceColorsWithRgba(content);

  const firstRgba = rgbaContent.indexOf('rgba(');
  if (firstRgba === -1) return null;

  let prefix = '';
  if (firstRgba > 0) {
    prefix = rgbaContent.substring(0, firstRgba).trim();
    if (prefix.endsWith(',')) prefix = prefix.slice(0, -1).trim();
  }

  const stops = [];
  const regex = /rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)\s*([^,]*)/gi;
  let match;
  
  while ((match = regex.exec(rgbaContent)) !== null) {
    const posStr = match[5] ? match[5].trim() : '';
    stops.push({
      r: parseFloat(match[1]),
      g: parseFloat(match[2]),
      b: parseFloat(match[3]),
      a: parseFloat(match[4]),
      posRaw: posStr,
      posParsed: posStr ? parseValue(posStr) : null
    });
  }

  if (stops.length === 0) return null;
  return { type, prefix, stops, suffix }; // Return suffix
}

export function buildGradient(g) {
  const stopsStr = g.stops.map(s => {
    const a = clamp(s.a, 0, 1);
    const color = `rgba(${Math.round(s.r)}, ${Math.round(s.g)}, ${Math.round(s.b)}, ${Math.round(a * 1000) / 1000})`;
    const pos = s.posRaw ? ` ${s.posRaw}` : '';
    return `${color}${pos}`;
  }).join(', ');
  
  const prefix = g.prefix ? `${g.prefix}, ` : '';
  // FIX: Reattach the suffix
  return `${g.type}(${prefix}${stopsStr})${g.suffix}`; 
}