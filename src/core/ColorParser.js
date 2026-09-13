
// Named color lookup (common subset; falls back to canvas for full support)
const NAMED_COLORS = {
  transparent: [0, 0, 0, 0],
  black:   [0, 0, 0, 1],   white:   [255, 255, 255, 1],
  red:     [255, 0, 0, 1], green:   [0, 128, 0, 1],
  blue:    [0, 0, 255, 1], yellow:  [255, 255, 0, 1],
  cyan:    [0, 255, 255, 1], magenta: [255, 0, 255, 1],
  orange:  [255, 165, 0, 1], purple: [128, 0, 128, 1],
  pink:    [255, 192, 203, 1], gray: [128, 128, 128, 1],
  grey:    [128, 128, 128, 1], silver: [192, 192, 192, 1],
  brown:   [165, 42, 42, 1], lime:   [0, 255, 0, 1],
  navy:    [0, 0, 128, 1], teal:    [0, 128, 128, 1],
  maroon:  [128, 0, 0, 1], olive:   [128, 128, 0, 1],
  coral:   [255, 127, 80, 1], salmon: [250, 128, 114, 1],
  gold:    [255, 215, 0, 1], indigo:  [75, 0, 130, 1],
  violet:  [238, 130, 238, 1], turquoise: [64, 224, 208, 1],
};

/** Convert an H S L triplet (H in [0,360], S,L in [0,1]) to [R,G,B] in [0,255] */
function hslToRgb(h, s, l) {
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Convert [R,G,B] in [0,255] to [H,S,L] with H∈[0,360], S,L∈[0,1] */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6;
    }
  }
  return [h * 360, s, l];
}

/**
 * Parse any CSS color string into [r, g, b, a] with components in [0-255, 0-255, 0-255, 0-1].
 * Returns null if unparseable.
 */
export function parseColor(color) {
  if (!color || color === 'none') return null;
  const c = color.trim().toLowerCase();

  // Named color
  if (NAMED_COLORS[c]) return [...NAMED_COLORS[c]];

  // #rgb
  let m = c.match(/^#([0-9a-f]{3})$/);
  if (m) {
    const [, h] = m;
    return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16), 1];
  }

  // #rrggbb
  m = c.match(/^#([0-9a-f]{6})$/);
  if (m) {
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 1];
  }

  // #rrggbbaa
  m = c.match(/^#([0-9a-f]{8})$/);
  if (m) {
    const v = parseInt(m[1], 16);
    return [(v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, ((v & 255) / 255)];
  }

  // rgb(r, g, b)
  m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];

  // rgb(r g b / a) - modern syntax
  m = c.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([0-9.%]+))?\s*\)$/);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) : 1;
    return [+m[1], +m[2], +m[3], a];
  }

  // hsl(h, s%, l%)
  m = c.match(/^hsla?\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%(?:\s*,\s*([0-9.]+))?\s*\)$/);
  if (m) {
    const [r, g, b] = hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
    return [r, g, b, m[4] !== undefined ? +m[4] : 1];
  }

  // hsl(h s% l% / a) - modern syntax
  m = c.match(/^hsla?\(\s*([0-9.]+)\s+([0-9.]+)%\s+([0-9.]+)%(?:\s*\/\s*([0-9.%]+))?\s*\)$/);
  if (m) {
    const [r, g, b] = hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) : 1;
    return [r, g, b, a];
  }

  // Try canvas parsing as last resort (browser only)
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    } catch {}
  }

  return null;
}

/**
 * Check if a string looks like a color value.
 */
export function isColor(str) {
  if (typeof str !== 'string') return false;
  const s = str.trim().toLowerCase();
  return s.startsWith('#') || s.startsWith('rgb') || s.startsWith('hsl') ||
         s === 'transparent' || NAMED_COLORS[s] !== undefined;
}

/**
 * Interpolate between two color values at position t ∈ [0,1].
 * Interpolates in RGB space.
 * Returns an rgba() string.
 */
export function interpolateColor(fromColor, toColor, t) {
  const from = parseColor(fromColor);
  const to   = parseColor(toColor);

  if (!from || !to) {
    // Can't interpolate - return target at t=1, source at t=0
    return t >= 1 ? toColor : fromColor;
  }

  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  const a = from[3] + (to[3] - from[3]) * t;

  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

/**
 * Serialize [r,g,b,a] to a CSS color string.
 */
export function serializeColor([r, g, b, a = 1]) {
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Replace all valid CSS colors in a string with their rgba() equivalent.
 */
const COLOR_REGEX = /(?:#(?:[0-9a-fA-F]{3}){1,2}(?:[0-9a-fA-F]{2})?\b|rgba?\([^)]+\)|hsla?\([^)]+\)|\b(?:transparent|black|white|red|green|blue|yellow|cyan|magenta|orange|purple|pink|gray|grey|silver|brown|lime|navy|teal|maroon|olive|coral|salmon|gold|indigo|violet|turquoise)\b)/gi;

export function replaceColorsWithRgba(str) {
  if (typeof str !== 'string') return str;
  return str.replace(COLOR_REGEX, match => {
    const c = parseColor(match);
    if (c) return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`;
    return match;
  });
}

export default { parseColor, isColor, interpolateColor, serializeColor, hslToRgb, rgbToHsl, replaceColorsWithRgba };
