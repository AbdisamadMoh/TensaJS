/**
 * Tensa TextGradientPlugin
 *
 * Animates a CSS linear-gradient applied as a text fill on an element.
 * Works by setting:
 *   background: linear-gradient(...)
 *   -webkit-background-clip: text
 *   background-clip: text
 *   color: transparent
 *
 * Property name: 'textGradient'
 *
 * Usage:
 *   // Animate from a two-stop gradient to another
 *   Tensa.animate(el, {
 *     duration: 2,
 *     textGradient: {
 *       angle: 135,
 *       stops: ['#ff6b6b', '#ffd93d', '#6bcb77']
 *     }
 *   });
 *
 *   // Full control with stop positions
 *   Tensa.sequence(el, {
 *     textGradient: {
 *       angle: 0,
 *       stops: [
 *         { color: '#7c6fff', position: 0 },
 *         { color: '#ff6bdf', position: 100 }
 *       ]
 *     }
 *   }, {
 *     textGradient: {
 *       angle: 180,
 *       stops: [
 *         { color: '#00d2ff', position: 0 },
 *         { color: '#ff6b6b', position: 100 }
 *       ]
 *     }
 *   });
 *
 *   // Animated gradient position (shimmer / sweep effect)
 *   Tensa.animate(el, {
 *     duration: 1.5,
 *     textGradient: {
 *       angle: 90,
 *       stops: ['#fff 0%', '#7c6fff 50%', '#fff 100%'],
 *       backgroundSize: '200% 100%',
 *       backgroundPositionX: '100%'
 *     }
 *   });
 */

import { parseColor, interpolateColor } from '../../core/ColorParser.js';
import { parseGradient } from '../../core/UnitParser.js';
import { registerPropertyPlugin } from '../../core/CSSPlugin.js';
import { getOwnerWindow } from '../../core/TargetResolver.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a stop descriptor into a normalised { color: [r,g,b,a], position: 0-100 } object.
 * Accepts:
 *   '#ff0000'                       → { color: parsed, position: null }
 *   '#ff0000 50%'                   → { color: parsed, position: 50 }
 *   { color: '#ff0000', position: 50 }
 *   { color: '#ff0000' }            → { color: parsed, position: null }
 */
function parseStop(stop, index, total) {
  let colorStr, position;

  if (typeof stop === 'string') {
    // Handle 'red 50%' or just 'red'
    const m = stop.match(/^(.+?)\s+([\d.]+)%\s*$/);
    if (m) {
      colorStr = m[1].trim();
      position = parseFloat(m[2]);
    } else {
      colorStr = stop.trim();
      position = null;
    }
  } else if (stop && typeof stop === 'object') {
    colorStr = stop.color;
    position = stop.position != null ? parseFloat(stop.position) : null;
  } else {
    colorStr = '#000';
    position = null;
  }

  // Default evenly-spaced positions
  if (position == null) {
    position = total <= 1 ? 0 : (index / (total - 1)) * 100;
  }

  return { color: parseColor(colorStr) || [0, 0, 0, 1], position };
}

/**
 * Normalise a gradient config into { angle, stops[] }.
 */
function normaliseGradient(val) {
  if (!val || typeof val !== 'object') {
    return { angle: 90, stops: [{ color: [0, 0, 0, 1], position: 0 }, { color: [255, 255, 255, 1], position: 100 }] };
  }

  const angle = val.angle != null ? parseFloat(val.angle) : 90;
  const rawStops = Array.isArray(val.stops) ? val.stops : [];
  const stops = rawStops.map((s, i) => parseStop(s, i, rawStops.length));

  return { angle, stops };
}

/**
 * Serialize [r,g,b,a] to a CSS color string.
 */
function serializeColor([r, g, b, a = 1]) {
  if (a >= 1) return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 1000) / 1000})`;
}

/**
 * Build the final gradient CSS string from an array of interpolated stops.
 */
function buildGradient(angle, stops) {
  const stopStrings = stops.map(s => `${serializeColor(s.color)} ${Math.round(s.position * 100) / 100}%`);
  return `linear-gradient(${Math.round(angle * 1000) / 1000}deg, ${stopStrings.join(', ')})`;
}

/**
 * Apply the gradient as a text fill to a DOM element.
 */
function applyGradientText(el, gradientCSS) {
  el.style.background = gradientCSS;
  el.style.webkitBackgroundClip = 'text';
  el.style.backgroundClip = 'text';
  el.style.webkitTextFillColor = 'transparent';
  el.style.color = 'transparent';
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export const TextGradientPlugin = {
  name: 'textGradient',

  prepare(target, prop, fromVal, toVal) {
    if (prop !== 'textGradient') return null;

    let fromGrad;

    if (fromVal != null) {
      fromGrad = normaliseGradient(fromVal);
    } else if (target._tensajs_textGradient) {
      // Use the last known gradient state (deep cloned via normaliseGradient)
      // Since colors are stored as [r,g,b,a] arrays, serialize them back to strings first
      fromGrad = normaliseGradient({
        angle: target._tensajs_textGradient.angle,
        stops: target._tensajs_textGradient.stops.map(s => ({
          color: serializeColor(s.color),
          position: s.position
        }))
      });
    } else {
      // Best-effort: Read computed gradient or fallback to solid color
      const cs = getOwnerWindow(target).getComputedStyle(target);
      const bgImage = cs.backgroundImage;

      if (bgImage && bgImage !== 'none' && bgImage.includes('gradient')) {
        const parsed = parseGradient(bgImage);
        if (parsed && parsed.stops) {
          let angle = 180;
          if (parsed.prefix) {
            const match = parsed.prefix.match(/([+-]?[\d.]+)(deg|rad|turn|grad)/);
            if (match) {
              const val = parseFloat(match[1]);
              const unit = match[2];
              if (unit === 'deg') angle = val;
              else if (unit === 'rad') angle = val * (180 / Math.PI);
              else if (unit === 'turn') angle = val * 360;
              else if (unit === 'grad') angle = val * 0.9;
            } else if (parsed.prefix.includes('to top')) angle = 0;
            else if (parsed.prefix.includes('to right')) angle = 90;
            else if (parsed.prefix.includes('to left')) angle = 270;
          }
          fromGrad = normaliseGradient({
            angle,
            stops: parsed.stops.map(s => {
              const position = s.posParsed && s.posParsed.unit === '%' ? s.posParsed.value : null;
              const a = Math.max(0, Math.min(1, s.a));
              const rgba = `rgba(${Math.round(s.r)}, ${Math.round(s.g)}, ${Math.round(s.b)}, ${a})`;
              return { color: rgba, position };
            })
          });
        }
      }

      // If parsing failed or no gradient, fallback to solid text color
      if (!fromGrad) {
        const colorStr = cs.color || '#000';
        const toGradTemp = normaliseGradient(toVal);
        fromGrad = normaliseGradient({
          angle: toGradTemp.angle,
          stops: Array(toGradTemp.stops.length).fill(colorStr)
        });
      }
    }

    const toGrad = normaliseGradient(toVal);

    // Pad stops so both arrays have the same length
    const maxLen = Math.max(fromGrad.stops.length, toGrad.stops.length);
    while (fromGrad.stops.length < maxLen) {
      fromGrad.stops.push({ ...fromGrad.stops[fromGrad.stops.length - 1] });
    }
    while (toGrad.stops.length < maxLen) {
      toGrad.stops.push({ ...toGrad.stops[toGrad.stops.length - 1] });
    }

    // Immediately apply initial state so text becomes "gradient text" right away
    applyGradientText(target, buildGradient(fromGrad.angle, fromGrad.stops));

    return {
      type: 'plugin',
      prop: 'textGradient',
      fromGrad,
      toGrad,
    };
  },

  render(target, descriptor, t) {
    const { fromGrad, toGrad } = descriptor;

    // Interpolate angle
    const angle = fromGrad.angle + (toGrad.angle - fromGrad.angle) * t;

    // Interpolate each stop
    const stops = fromGrad.stops.map((from, i) => {
      const to = toGrad.stops[i];
      const position = from.position + (to.position - from.position) * t;
      const color = from.color.map((c, ci) => c + (to.color[ci] - c) * t);
      return { color, position };
    });

    // Save state for future animations on this element
    target._tensajs_textGradient = { angle, stops };

    applyGradientText(target, buildGradient(angle, stops));
  }
};

export default TextGradientPlugin;

registerPropertyPlugin('textGradient', TextGradientPlugin);
