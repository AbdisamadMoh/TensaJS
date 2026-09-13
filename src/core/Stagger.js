
import { parseEase } from './Easing.js';

/**
 * Resolve stagger config into an array of delay offsets (in seconds) per element.
 * 
 * @param {number|Object} stagger - simple number OR stagger config object
 * @param {number} count - number of targets
 * @param {Array} [targets] - DOM elements (used for grid distribution)
 * @returns {number[]} delay offsets in seconds
 */
export function resolveStagger(stagger, count, targets = []) {
  if (count <= 1) return [0];

  // Simple numeric stagger: each element delayed by this many seconds
  if (typeof stagger === 'number') {
    return Array.from({ length: count }, (_, i) => i * stagger);
  }

  const {
    amount,
    each,
    from = 'start',
    grid,
    axis,
    ease: easeStr,
  } = stagger;

  // Calculate the base 'each' delay
  let eachDelay;
  if (each !== undefined) {
    eachDelay = each;
  } else if (amount !== undefined) {
    eachDelay = count > 1 ? amount / (count - 1) : 0;
  } else {
    eachDelay = 0.1; // default
  }

  const ease = easeStr ? parseEase(easeStr) : null;

  // Compute distance of each element from the 'from' origin
  const distances = computeDistances(count, from, grid, axis, targets);

  // Normalize distances to [0, 1]
  const maxDist = Math.max(...distances, 1);
  const normalized = distances.map(d => d / maxDist);

  // Apply ease to normalized positions
  const eased = ease ? normalized.map(n => ease(n)) : normalized;

  // Scale back to time offsets
  const totalAmount = each !== undefined ? eachDelay * (count - 1) : (amount ?? eachDelay * (count - 1));
  return eased.map(n => n * totalAmount);
}

function computeDistances(count, from, grid, axis, targets) {
  // Grid-based stagger (2D distance)
  if (grid && Array.isArray(grid)) {
    return computeGridDistances(count, from, grid, axis);
  }

  // Linear from specific element
  let originIndex;

  if (from === 'start' || from === 0)         originIndex = 0;
  else if (from === 'end')                    originIndex = count - 1;
  else if (from === 'center')                 originIndex = (count - 1) / 2;
  else if (from === 'random')                 originIndex = Math.floor(Math.random() * count);
  else if (from === 'edges') {
    // Distance from nearest edge
    return Array.from({ length: count }, (_, i) => {
      const fromStart = i;
      const fromEnd   = count - 1 - i;
      return Math.min(fromStart, fromEnd);
    });
  } else if (typeof from === 'number') {
    originIndex = from;
  } else {
    originIndex = 0;
  }

  return Array.from({ length: count }, (_, i) => Math.abs(i - originIndex));
}

function computeGridDistances(count, from, [cols, rows], axis) {
  const distances = [];

  let originCol, originRow;
  if (from === 'center') {
    originCol = (cols - 1) / 2;
    originRow = (rows - 1) / 2;
  } else if (from === 'start') {
    originCol = 0; originRow = 0;
  } else if (from === 'end') {
    originCol = cols - 1; originRow = rows - 1;
  } else if (from === 'random') {
    originCol = Math.floor(Math.random() * cols);
    originRow = Math.floor(Math.random() * rows);
  } else if (Array.isArray(from)) {
    [originCol, originRow] = from;
  } else {
    originCol = 0; originRow = 0;
  }

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    let dist;
    if (axis === 'x')      dist = Math.abs(col - originCol);
    else if (axis === 'y') dist = Math.abs(row - originRow);
    else dist = Math.sqrt((col - originCol) ** 2 + (row - originRow) ** 2);
    distances.push(dist);
  }

  return distances;
}

export default resolveStagger;
