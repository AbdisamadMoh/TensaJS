/**
 * Tensa SchemaValidator - Validate an Tensa JSON document
 * 
 * Provides human-readable error messages.
 * Tree-shakeable - import only when needed.
 */

const VALID_TWEEN_TYPES = new Set(['animate', 'animateFrom', 'sequence', 'apply']);
const VALID_EASE_PATTERNS = [
  /^(none|linear)$/,
  /^(quad|cubic|quart|quint|sine|expo|circ|back|elastic|bounce|power[1-4])\.(in|out|inOut)(?:\([0-9., -]+\))?$/,
  /^steps\(\d+(?:,\s*(start|end))?\)$/,
  /^cubic-bezier\([0-9., -]+\)$/,
];

const VALID_ACTIONS = new Set([
  'addClass', 'removeClass', 'toggleClass',
  'setAttribute', 'removeAttribute',
  'setStyle', 'setText',
  'animate', 'animateFrom', 'apply',
  'stop', 'play', 'pause', 'seek', 'restart',
  'dispatch', 'navigate', 'wait'
]);

export function registerValidTweenType(type) {
  VALID_TWEEN_TYPES.add(type);
}

export function registerValidEasePattern(pattern) {
  VALID_EASE_PATTERNS.push(pattern);
}

export function registerValidAction(action) {
  VALID_ACTIONS.add(action);
}


function isValidEase(ease, customEaseNames) {
  if (typeof ease !== 'string') return false;
  if (customEaseNames && customEaseNames.has(ease)) return true;
  return VALID_EASE_PATTERNS.some(p => p.test(ease));
}

function isValidPosition(pos) {
  if (typeof pos === 'number') return true;
  if (typeof pos === 'string') return true;
  return false;
}

/**
 * Validate an Tensa JSON animation document.
 * @param {Object} doc - parsed JSON object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSchema(doc) {
  const errors = [];

  if (typeof doc !== 'object' || doc === null) {
    return { valid: false, errors: ['Document must be a JSON object'] };
  }

  // Version check
  if (doc.version && doc.version !== '1.0') {
    errors.push(`Unsupported version: "${doc.version}". Only "1.0" is supported.`);
  }

  // Collect custom ease names first — needed when validating ease fields below
  const customEaseNames = new Set();
  if (doc.customEasings) {
    validateCustomEasings(doc.customEasings, errors, customEaseNames);
  }

  // Validate variables
  if (doc.variables) {
    validateVariables(doc.variables, errors);
  }

  // Validate inline callbacks
  if (doc.callbacks) {
    validateCallbacks(doc.callbacks, errors, customEaseNames);
  }

  // Validate setup block
  if (doc.setup) {
    if (!Array.isArray(doc.setup)) {
      errors.push('"setup" must be an array of actions.');
    } else {
      doc.setup.forEach((action, i) => validateAction(action, `setup[${i}]`, errors));
    }
  }

  // Must have at least a timeline, tweens array, a valid single tween, or a setup block
  if (!doc.timeline && !doc.tweens && !(doc.target && doc.props) && !doc.setup) {
    errors.push('Document must have a "timeline", "tweens", or "setup" property, or be a valid single Tween config with "target" and "props".');
  } else if (doc.target && doc.props && !doc.timeline && !doc.tweens) {
    validateTween(doc, 'root', errors, customEaseNames);
  }

  // Validate defaults
  if (doc.defaults) {
    validateDefaults(doc.defaults, errors, customEaseNames);
  }

  // Validate top-level tweens array
  if (doc.tweens) {
    if (!Array.isArray(doc.tweens)) {
      errors.push('"tweens" must be an array.');
    } else {
      doc.tweens.forEach((t, i) => validateTween(t, `tweens[${i}]`, errors, customEaseNames));
    }
  }

  // Validate timeline
  if (doc.timeline) {
    validateTimeline(doc.timeline, 'timeline', errors, customEaseNames);
  }

  return { valid: errors.length === 0, errors };
}

function validateCustomEasings(entries, errors, customEaseNames) {
  if (!Array.isArray(entries)) {
    errors.push('"customEasings" must be an array.');
    return;
  }
  entries.forEach((entry, i) => {
    const path = `customEasings[${i}]`;
    if (!entry.name || typeof entry.name !== 'string') {
      errors.push(`${path}.name is required and must be a string.`);
      return;
    }
    customEaseNames.add(entry.name);
    const hasCubic = Array.isArray(entry.cubicBezier);
    const hasSteps = Array.isArray(entry.steps);
    const hasFrom  = typeof entry.from === 'string';
    if (!hasCubic && !hasSteps && !hasFrom) {
      errors.push(`${path} must have one of: "cubicBezier", "steps", or "from".`);
    }
    if (hasCubic && entry.cubicBezier.length !== 4) {
      errors.push(`${path}.cubicBezier must have exactly 4 values [x1, y1, x2, y2].`);
    }
    if (hasSteps && (entry.steps.length < 1 || typeof entry.steps[0] !== 'number')) {
      errors.push(`${path}.steps must start with a step count number.`);
    }
  });
}

function validateVariables(variables, errors) {
  if (typeof variables !== 'object' || variables === null) {
    errors.push('"variables" must be an object.');
    return;
  }
  for (const [key, val] of Object.entries(variables)) {
    const t = typeof val;
    if (t !== 'number' && t !== 'string' && t !== 'boolean') {
      errors.push(`variables.${key} must be a number, string, or boolean.`);
    }
  }
}

function validateCallbacks(callbacks, errors, customEaseNames) {
  if (typeof callbacks !== 'object' || callbacks === null) {
    errors.push('"callbacks" must be an object.');
    return;
  }
  for (const [name, sequence] of Object.entries(callbacks)) {
    const path = `callbacks.${name}`;
    if (!Array.isArray(sequence)) {
      errors.push(`${path} must be an array of actions.`);
      continue;
    }
    sequence.forEach((action, i) => {
      validateAction(action, `${path}[${i}]`, errors, customEaseNames);
    });
  }
}

function validateAction(action, ap, errors, customEaseNames) {
  if (!action.action || !VALID_ACTIONS.has(action.action)) {
    errors.push(`${ap}.action "${action.action}" is not a valid action.`);
  }
  if (action.ease !== undefined && !isValidEase(action.ease, customEaseNames)) {
    errors.push(`${ap}.ease "${action.ease}" is not recognized.`);
  }
}

function validateDefaults(defaults, errors, customEaseNames, path = 'defaults') {
  if (defaults.duration !== undefined && typeof defaults.duration !== 'number') {
    errors.push(`${path}.duration must be a number.`);
  }
  if (defaults.ease !== undefined && !isValidEase(defaults.ease, customEaseNames)) {
    errors.push(`${path}.ease "${defaults.ease}" is not a recognized easing function.`);
  }
  if (defaults.repeat !== undefined && !Number.isInteger(defaults.repeat)) {
    errors.push(`${path}.repeat must be an integer.`);
  }
  if (defaults.willChange !== undefined && typeof defaults.willChange !== 'boolean' && typeof defaults.willChange !== 'string') {
    errors.push(`${path}.willChange must be a boolean or string.`);
  }
}

function validateTimeline(tl, path, errors, customEaseNames) {
  if (typeof tl !== 'object' || tl === null) {
    errors.push(`${path} must be an object.`);
    return;
  }

  if (tl.repeat !== undefined && !Number.isInteger(tl.repeat)) {
    errors.push(`${path}.repeat must be an integer (use -1 for infinite).`);
  }
  if (tl.ease !== undefined && !isValidEase(tl.ease, customEaseNames)) {
    errors.push(`${path}.ease "${tl.ease}" is not recognized.`);
  }
  if (tl.timeScale !== undefined && (typeof tl.timeScale !== 'number' || tl.timeScale <= 0)) {
    errors.push(`${path}.timeScale must be a positive number.`);
  }

  if (tl.tweens) {
    if (!Array.isArray(tl.tweens)) {
      errors.push(`${path}.tweens must be an array.`);
    } else {
      tl.tweens.forEach((t, i) => validateTween(t, `${path}.tweens[${i}]`, errors, customEaseNames));
    }
  }

  if (tl.labels) {
    if (typeof tl.labels !== 'object') {
      errors.push(`${path}.labels must be an object.`);
    } else {
      for (const [name, time] of Object.entries(tl.labels)) {
        if (typeof time !== 'number') {
          errors.push(`${path}.labels.${name} must be a number (time in seconds).`);
        }
      }
    }
  }

  if (tl.timelines) {
    if (!Array.isArray(tl.timelines)) {
      errors.push(`${path}.timelines must be an array.`);
    } else {
      tl.timelines.forEach((entry, i) => {
        if (!entry.timeline) {
          errors.push(`${path}.timelines[${i}] must have a "timeline" property.`);
        } else {
          validateTimeline(entry.timeline, `${path}.timelines[${i}].timeline`, errors, customEaseNames);
        }
      });
    }
  }
}

function validateTween(tween, path, errors, customEaseNames) {
  if (typeof tween !== 'object' || tween === null) {
    errors.push(`${path} must be an object.`);
    return;
  }

  if (!tween.target) {
    errors.push(`${path}.target is required.`);
  } else if (typeof tween.target !== 'string' && !Array.isArray(tween.target)) {
    errors.push(`${path}.target must be a CSS selector string or array of selectors.`);
  }

  if (tween.type && !VALID_TWEEN_TYPES.has(tween.type)) {
    errors.push(`${path}.type "${tween.type}" is invalid. Must be one of: animate, animateFrom, sequence, apply.`);
  }

  if (tween.setup) {
    const setupArr = Array.isArray(tween.setup) ? tween.setup : [tween.setup];
    setupArr.forEach((action, i) => validateAction(action, `${path}.setup[${i}]`, errors));
  }

  if (tween.duration !== undefined) {
    if (typeof tween.duration !== 'number' || tween.duration < 0) {
      errors.push(`${path}.duration must be a non-negative number.`);
    }
  }

  if (tween.delay !== undefined && typeof tween.delay !== 'number') {
    errors.push(`${path}.delay must be a number.`);
  }

  if (tween.ease !== undefined && !isValidEase(tween.ease, customEaseNames)) {
    errors.push(`${path}.ease "${tween.ease}" is not a recognized easing function.`);
  }

  if (tween.repeat !== undefined && !Number.isInteger(tween.repeat)) {
    errors.push(`${path}.repeat must be an integer (use -1 for infinite).`);
  }

  if (tween.willChange !== undefined && typeof tween.willChange !== 'boolean' && typeof tween.willChange !== 'string') {
    errors.push(`${path}.willChange must be a boolean or string.`);
  }

  if (tween.type === 'sequence') {
    if (!tween.fromProps) {
      errors.push(`${path}: type "sequence" requires a "fromProps" object.`);
    }
    if (!tween.props) {
      errors.push(`${path}: type "sequence" requires a "props" object.`);
    }
  }

  if (tween.position !== undefined && !isValidPosition(tween.position)) {
    errors.push(`${path}.position must be a number or string.`);
  }

  if (tween.stagger !== undefined) {
    validateStagger(tween.stagger, `${path}.stagger`, errors, customEaseNames);
  }

  if (tween.keyframes !== undefined) {
    if (!Array.isArray(tween.keyframes)) {
      errors.push(`${path}.keyframes must be an array.`);
    } else {
      tween.keyframes.forEach((kf, i) => {
        if (kf.at === undefined) {
          errors.push(`${path}.keyframes[${i}].at is required.`);
        }
        if (kf.ease !== undefined && !isValidEase(kf.ease, customEaseNames)) {
          errors.push(`${path}.keyframes[${i}].ease "${kf.ease}" is not recognized.`);
        }
      });
    }
  }
}

function validateStagger(stagger, path, errors, customEaseNames) {
  if (typeof stagger === 'number') return;
  if (typeof stagger !== 'object' || stagger === null) {
    errors.push(`${path} must be a number or object.`);
    return;
  }
  if (stagger.amount !== undefined && typeof stagger.amount !== 'number') {
    errors.push(`${path}.amount must be a number.`);
  }
  if (stagger.each !== undefined && typeof stagger.each !== 'number') {
    errors.push(`${path}.each must be a number.`);
  }
  if (stagger.ease !== undefined && !isValidEase(stagger.ease, customEaseNames)) {
    errors.push(`${path}.ease "${stagger.ease}" is not recognized.`);
  }
  if (stagger.grid !== undefined) {
    if (!Array.isArray(stagger.grid) || stagger.grid.length !== 2) {
      errors.push(`${path}.grid must be an array of [cols, rows].`);
    }
  }
}

export default validateSchema;
