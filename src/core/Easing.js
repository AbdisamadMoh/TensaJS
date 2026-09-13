import { reportError } from './Config.js';

const PI = Math.PI;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * PI) / 3;
const c5 = (2 * PI) / 4.5;

function bounceOut(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1)      return n1 * t * t;
  if (t < 2 / d1)      return n1 * (t -= 1.5  / d1) * t + 0.75;
  if (t < 2.5 / d1)    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

const easings = {
  'none':            t => t,
  'linear':          t => t,

  'quad.in':         t => t * t,
  'quad.out':        t => 1 - (1 - t) ** 2,
  'quad.inOut':      t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,

  'cubic.in':        t => t ** 3,
  'cubic.out':       t => 1 - (1 - t) ** 3,
  'cubic.inOut':     t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,

  'quart.in':        t => t ** 4,
  'quart.out':       t => 1 - (1 - t) ** 4,
  'quart.inOut':     t => t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2,

  'quint.in':        t => t ** 5,
  'quint.out':       t => 1 - (1 - t) ** 5,
  'quint.inOut':     t => t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2,

  'sine.in':         t => 1 - Math.cos((t * PI) / 2),
  'sine.out':        t => Math.sin((t * PI) / 2),
  'sine.inOut':      t => -(Math.cos(PI * t) - 1) / 2,

  'expo.in':         t => t === 0 ? 0 : 2 ** (10 * t - 10),
  'expo.out':        t => t === 1 ? 1 : 1 - 2 ** (-10 * t),
  'expo.inOut':      t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5
                       ? 2 ** (20 * t - 10) / 2
                       : (2 - 2 ** (-20 * t + 10)) / 2,

  'circ.in':         t => 1 - Math.sqrt(1 - t ** 2),
  'circ.out':        t => Math.sqrt(1 - (t - 1) ** 2),
  'circ.inOut':      t => t < 0.5
                       ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2
                       : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2,

  'back.in':         t => c3 * t ** 3 - c1 * t ** 2,
  'back.out':        t => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  'back.inOut':      t => t < 0.5
                       ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2
                       : ((2 * t - 2) ** 2 * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2,

  'elastic.in':      t => t === 0 ? 0 : t === 1 ? 1
                       : -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * c4),
  'elastic.out':     t => t === 0 ? 0 : t === 1 ? 1
                       : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1,
  'elastic.inOut':   t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5
                       ? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
                       : 2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * c5) / 2 + 1,

  'bounce.in':       t => 1 - bounceOut(1 - t),
  'bounce.out':      t => bounceOut(t),
  'bounce.inOut':    t => t < 0.5
                       ? (1 - bounceOut(1 - 2 * t)) / 2
                       : (1 + bounceOut(2 * t - 1)) / 2,

  'steps(1)':        t => Math.round(t),
};

// For compatibility aliases
easings['power1.in']    = easings['quad.in'];
easings['power1.out']   = easings['quad.out'];
easings['power1.inOut'] = easings['quad.inOut'];
easings['power2.in']    = easings['cubic.in'];
easings['power2.out']   = easings['cubic.out'];
easings['power2.inOut'] = easings['cubic.inOut'];
easings['power3.in']    = easings['quart.in'];
easings['power3.out']   = easings['quart.out'];
easings['power3.inOut'] = easings['quart.inOut'];
easings['power4.in']    = easings['quint.in'];
easings['power4.out']   = easings['quint.out'];
easings['power4.inOut'] = easings['quint.inOut'];

function createSteps(n, direction = 'end') {
  return (t) => {
    const step = direction === 'start' ? Math.ceil(t * n) : Math.floor(t * n);
    return Math.min(step / n, 1);
  };
}

function solveCubicBezier(p1x, p1y, p2x, p2y) {
  // Newton-Raphson solver for CSS cubic-bezier equivalent
  const NEWTON_ITERATIONS = 8;
  const NEWTON_MIN_SLOPE = 0.001;
  const SUBDIVISION_PRECISION = 0.0000001;
  const SUBDIVISION_MAX_ITERS = 10;
  const kSplineTableSize = 11;
  const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

  function A(a1, a2) { return 1.0 - 3.0 * a2 + 3.0 * a1; }
  function B(a1, a2) { return 3.0 * a2 - 6.0 * a1; }
  function C(a1)     { return 3.0 * a1; }

  function calcBezier(t, a1, a2) {
    return ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  }

  function getSlope(t, a1, a2) {
    return 3.0 * A(a1, a2) * t * t + 2.0 * B(a1, a2) * t + C(a1);
  }

  // Pre-compute sample table
  const sampleValues = new Float32Array(kSplineTableSize);
  if (p1x !== p1y || p2x !== p2y) {
    for (let i = 0; i < kSplineTableSize; ++i) {
      sampleValues[i] = calcBezier(i * kSampleStepSize, p1x, p2x);
    }
  }

  function getTForX(aX) {
    let intervalStart = 0.0;
    let currentSample = 1;
    const lastSample = kSplineTableSize - 1;

    for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
      intervalStart += kSampleStepSize;
    }
    --currentSample;

    const dist = (aX - sampleValues[currentSample]) /
                 (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    const guessForT = intervalStart + dist * kSampleStepSize;
    const initialSlope = getSlope(guessForT, p1x, p2x);

    if (initialSlope >= NEWTON_MIN_SLOPE) {
      // Newton-Raphson iteration
      let aGuessT = guessForT;
      for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
        const currentSlope = getSlope(aGuessT, p1x, p2x);
        if (currentSlope === 0.0) return aGuessT;
        aGuessT -= (calcBezier(aGuessT, p1x, p2x) - aX) / currentSlope;
      }
      return aGuessT;
    } else if (initialSlope === 0.0) {
      return guessForT;
    } else {
      // Binary subdivision
      let aA = intervalStart, aB = intervalStart + kSampleStepSize;
      let currentT = 0;
      let i = 0;
      do {
        currentT = aA + (aB - aA) / 2.0;
        const xEst = calcBezier(currentT, p1x, p2x) - aX;
        if (xEst > 0.0) aB = currentT;
        else aA = currentT;
      } while (Math.abs(calcBezier(currentT, p1x, p2x) - aX) > SUBDIVISION_PRECISION
               && ++i < SUBDIVISION_MAX_ITERS);
      return currentT;
    }
  }

  if (p1x === p1y && p2x === p2y) return t => t; // linear shortcut

  return (t) => {
    if (t === 0 || t === 1) return t;
    return calcBezier(getTForX(t), p1y, p2y);
  };
}

function createBack(direction, amt) {
  const c1 = amt;
  const c3 = amt + 1;
  const c2 = c1 * 1.525;
  if (direction === 'in') return t => c3 * t ** 3 - c1 * t ** 2;
  if (direction === 'out') return t => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  return t => t < 0.5
    ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2
    : ((2 * t - 2) ** 2 * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2;
}

function createElastic(direction, amplitude, period) {
  const a = Math.max(1, amplitude);
  const p = period / (2 * Math.PI);
  const s = Math.asin(1 / a) * p;
  if (direction === 'in') {
    return t => t === 0 ? 0 : t === 1 ? 1 : -(a * 2 ** (10 * (t -= 1)) * Math.sin((t - s) / p));
  }
  if (direction === 'out') {
    return t => t === 0 ? 0 : t === 1 ? 1 : a * 2 ** (-10 * t) * Math.sin((t - s) / p) + 1;
  }
  return t => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    let t2 = t * 2 - 1;
    if (t2 < 0) return -(a * 2 ** (10 * t2) * Math.sin((t2 - s) / p)) / 2;
    return a * 2 ** (-10 * t2) * Math.sin((t2 - s) / p) / 2 + 1;
  };
}

/**
 * Parse an easing string and return an easing function.
 * Supports:
 *   - Named: 'cubic.out', 'bounce.in', 'linear'
 *   - Steps: 'steps(6)', 'steps(4,start)'
 *   - Cubic bezier: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)'
 *   - Parameterized: 'back.out(1.7)', 'elastic.out(1, 0.3)'
 *   - Custom registered: see defineEase()
 */
export function parseEase(ease) {
  if (typeof ease === 'function') return ease;
  if (!ease || ease === 'none' || ease === 'linear') return t => t;

  // Check registry first
  if (easings[ease]) return easings[ease];

  // Parameterized: back.out(1.7) or elastic.out(1, 0.3)
  const paramMatch = ease.match(/^([a-zA-Z0-9.]+)\(([^)]+)\)$/);
  if (paramMatch && !ease.startsWith('steps') && !ease.startsWith('cubic-bezier')) {
    const baseName = paramMatch[1];
    const args = paramMatch[2].split(',').map(Number);
    
    if (baseName.startsWith('back.')) {
      return createBack(baseName.split('.')[1], args[0] !== undefined && !isNaN(args[0]) ? args[0] : 1.70158);
    }
    if (baseName.startsWith('elastic.')) {
      return createElastic(baseName.split('.')[1], 
        args[0] !== undefined && !isNaN(args[0]) ? args[0] : 1, 
        args[1] !== undefined && !isNaN(args[1]) ? args[1] : 0.3
      );
    }
    
    if (easings[baseName]) return easings[baseName];
  }

  // steps(n) or steps(n, direction)
  const stepsMatch = ease.match(/^steps\((\d+)(?:,\s*(start|end))?\)$/);
  if (stepsMatch) {
    return createSteps(parseInt(stepsMatch[1]), stepsMatch[2] || 'end');
  }

  // cubic-bezier(x1, y1, x2, y2)
  const bezierMatch = ease.match(
    /^cubic-bezier\(\s*([0-9.]+)\s*,\s*([0-9.-]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.-]+)\s*\)$/
  );
  if (bezierMatch) {
    const [, x1, y1, x2, y2] = bezierMatch.map(Number);
    return solveCubicBezier(x1, y1, x2, y2);
  }

  // Shorthand without direction e.g. "cubic" → "cubic.out"
  if (easings[ease + '.out']) return easings[ease + '.out'];

  reportError(`[Tensa] Unknown easing: "${ease}", falling back to "cubic.out"`);
  return easings['cubic.out'];
}

/**
 * Register a custom easing function under a name.
 * @param {string} name
 * @param {Function|string} easeOrBezier - function(t) or cubic-bezier string
 */
export function defineEase(name, easeOrBezier) {
  easings[name] = typeof easeOrBezier === 'string'
    ? parseEase(easeOrBezier)
    : easeOrBezier;
}

/** Get all registered easing names */
export function getEaseNames() {
  return Object.keys(easings);
}

/** Raw easings map for direct access */
export { easings };

export default parseEase;
