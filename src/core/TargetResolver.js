
import { reportError } from './Config.js';


export function isElementLike(target) {
  return target != null && target.nodeType === 1;
}

export function isDocumentLike(target) {
  return target != null && target.nodeType === 9;
}

export function isWindowLike(target) {
  return target != null && target.window === target;
}

export function isNodeListLike(target) {
  return target != null && typeof target.length === 'number' && typeof target.item === 'function';
}

export function getOwnerDocument(target) {
  if (isDocumentLike(target)) return target;
  if (target && target.ownerDocument) return target.ownerDocument;
  if (isWindowLike(target)) return target.document;
  return typeof document !== 'undefined' ? document : null;
}


export function getOwnerWindow(target) {
  if (isWindowLike(target)) return target;
  const doc = isDocumentLike(target) ? target : (target && target.ownerDocument);
  if (doc && doc.defaultView) return doc.defaultView;
  return typeof window !== 'undefined' ? window : null;
}


export function isShadowRootLike(target) {
  return target != null && target.nodeType === 11 && !!target.host;
}


export function getOwnerRootNode(target) {
  if (target && typeof target.getRootNode === 'function') return target.getRootNode();
  return getOwnerDocument(target);
}

export function getMeasurementHost(target) {
  const root = getOwnerRootNode(target);
  if (isShadowRootLike(root)) return root;
  const doc = getOwnerDocument(target);
  return doc ? doc.body : null;
}

/**
 * Resolve a target into a flat array of targets.
 * @param {string|Element|NodeList|Array|Object} target
 * @returns {Array}
 */
export function resolveTargets(target) {
  if (!target) return [];

  // Already a flat array (deduplicate)
  if (Array.isArray(target)) {
    return Array.from(new Set(target.flatMap(t => resolveTargets(t))));
  }

  // NodeList or HTMLCollection
  if (isNodeListLike(target)) {
    return Array.from(target);
  }

  // CSS selector string
  if (typeof target === 'string') {
    try {
      const nodes = document.querySelectorAll(target);
      return Array.from(nodes);
    } catch (e) {
      reportError(`[Tensa] Invalid selector: "${target}". ${e.message}`);
      return [];
    }
  }

  // Single DOM Element, Window, or Document (possibly from another realm)
  if (isElementLike(target) || isWindowLike(target) || isDocumentLike(target)) {
    return [target];
  }

  // Plain JS object (for number/value tweening)
  if (typeof target === 'object' && target !== null) {
    return [target];
  }

  return [];
}

/**
 * Resolve a single target (returns first element for selector strings).
 */
export function resolveTarget(target) {
  const targets = resolveTargets(target);
  return targets[0] || null;
}

/**
 * Check if a target is a DOM element (not a plain object).
 */
export function isDOMElement(target) {
  return isElementLike(target) || isWindowLike(target) || isDocumentLike(target);
}

/**
 * Check if a target is a plain object (for property tweening).
 */
export function isPlainObject(target) {
  return target !== null && typeof target === 'object' &&
         !isElementLike(target) && !isNodeListLike(target) &&
         !isWindowLike(target) && !isDocumentLike(target);
}

export default {
  resolveTargets, resolveTarget, isDOMElement, isPlainObject,
  isElementLike, isDocumentLike, isWindowLike, isNodeListLike, isShadowRootLike,
  getOwnerDocument, getOwnerWindow, getOwnerRootNode, getMeasurementHost,
};
