import { getOwnerWindow, getOwnerDocument } from '../../core/TargetResolver.js';

export const GRAVITY = 980; // px/s²

export function parseCurrentValue(el, prop) {
  if (!el) return 0;
  try {
    const cs = getOwnerWindow(el).getComputedStyle(el);
    const matrix = new DOMMatrix(cs.transform);
    if (prop === 'x') return matrix.m41;
    if (prop === 'y') return matrix.m42;
    if (prop === 'rotation' || prop === 'rotate') return Math.atan2(matrix.m12, matrix.m11) * (180 / Math.PI);
    if (prop === 'scale') return Math.sqrt(matrix.m11 * matrix.m11 + matrix.m12 * matrix.m12);
    return parseFloat(cs[prop]) || 0;
  } catch {
    return 0;
  }
}

/**
 * Resolve a container from a selector string or element.
 * `refEl` (optional) - an already-resolved target element, used to pick the correct
 * window/document when `bounds` is the literal 'window' or a CSS selector string,
 * so a target living inside an <iframe> resolves against its own realm.
 */
export function resolveContainer(bounds, refEl) {
  if (!bounds) return null;
  if (bounds === 'window') return refEl ? getOwnerWindow(refEl) : (typeof window !== 'undefined' ? window : null);
  if (typeof bounds === 'string') {
    const doc = refEl ? getOwnerDocument(refEl) : (typeof document !== 'undefined' ? document : null);
    return doc ? doc.querySelector(bounds) : null;
  }
  // If it's a DOM element or a custom literal object ({minX, maxX...}) return it directly
  return bounds;
}

/**
 * Compute transform-space wall limits for `el` relative to `container`.
 * Called every physics tick so it stays accurate after resize.
 * 
 * Returns { minX, maxX, minY, maxY } in CSS transform-space:
 *   - minX = how far left the element can translate before its left edge hits the container left wall
 *   - maxX = how far right  before its right edge hits the container right wall
 *   - (same for Y / top / bottom)
 */
export function resolveBoundsForEl(el, container) {
  // If the container is actually a custom literal bounds object, just return it!
  if (container && (container.minX !== undefined || container.maxX !== undefined || container.minY !== undefined || container.maxY !== undefined)) {
    return {
      minX: container.minX ?? -Infinity,
      maxX: container.maxX ?? Infinity,
      minY: container.minY ?? -Infinity,
      maxY: container.maxY ?? Infinity
    };
  }

  const win = getOwnerWindow(el);
  let oLeft = 0, oTop = 0, curr = el;
  while (curr && curr !== container && curr !== win) {
    oLeft += curr.offsetLeft;
    oTop  += curr.offsetTop;
    curr   = curr.offsetParent;
  }
  
  if (container === win) {
    return {
      minX: -oLeft,
      maxX: win.innerWidth - oLeft - el.offsetWidth,
      minY: -oTop,
      maxY: win.innerHeight - oTop - el.offsetHeight,
    };
  }

  return {
    minX: -oLeft,
    maxX:  container.clientWidth  - oLeft - el.offsetWidth,
    minY: -oTop,
    maxY:  container.clientHeight - oTop  - el.offsetHeight,
  };
}
