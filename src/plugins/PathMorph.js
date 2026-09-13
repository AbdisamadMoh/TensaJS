
import { registerPropertyPlugin } from '../core/CSSPlugin.js';
import { isElementLike } from '../core/TargetResolver.js';

// Math to convert an SVG Elliptical Arc into cubic beziers.
function arcToBezier(lastX, lastY, rx, ry, angle, largeArcFlag, sweepFlag, x, y) {
  const PI = Math.PI;
  const TAU = PI * 2;
  const rad = angle * PI / 180;
  let cosAngle = Math.cos(rad);
  let sinAngle = Math.sin(rad);

  if (rx === 0 || ry === 0 || (lastX === x && lastY === y)) {
    return [lastX, lastY, x, y, x, y];
  }

  rx = Math.abs(rx);
  ry = Math.abs(ry);

  const dx2 = (lastX - x) / 2;
  const dy2 = (lastY - y) / 2;
  const x1p = cosAngle * dx2 + sinAngle * dy2;
  const y1p = -sinAngle * dx2 + cosAngle * dy2;

  let rx_sq = rx * rx;
  let ry_sq = ry * ry;
  const x1p_sq = x1p * x1p;
  const y1p_sq = y1p * y1p;

  let radiiCheck = x1p_sq / rx_sq + y1p_sq / ry_sq;
  if (radiiCheck > 1) {
    const scale = Math.sqrt(radiiCheck);
    rx *= scale;
    ry *= scale;
    rx_sq = rx * rx;
    ry_sq = ry * ry;
  }

  let sign = (largeArcFlag === sweepFlag) ? -1 : 1;
  let sq = ((rx_sq * ry_sq) - (rx_sq * y1p_sq) - (ry_sq * x1p_sq)) / ((rx_sq * y1p_sq) + (ry_sq * x1p_sq));
  sq = (sq < 0) ? 0 : sq;
  let coef = sign * Math.sqrt(sq);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  const cx = cosAngle * cxp - sinAngle * cyp + (lastX + x) / 2;
  const cy = sinAngle * cxp + cosAngle * cyp + (lastY + y) / 2;

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  let n = Math.sqrt((ux * ux) + (uy * uy));
  let p = ux;
  sign = (uy < 0) ? -1 : 1;
  let startAngle = sign * Math.acos(Math.max(-1, Math.min(1, p / n)));

  n = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
  p = ux * vx + uy * vy;
  sign = (ux * vy - uy * vx < 0) ? -1 : 1;
  let sweepAngle = sign * Math.acos(Math.max(-1, Math.min(1, p / n)));

  if (sweepFlag === 0 && sweepAngle > 0) sweepAngle -= TAU;
  else if (sweepFlag === 1 && sweepAngle < 0) sweepAngle += TAU;

  const segments = Math.ceil(Math.abs(sweepAngle) / (PI / 2));
  const sweepAnglePerSeg = sweepAngle / segments;
  
  const beziers = [];
  let currentAngle = startAngle;

  for (let i = 0; i < segments; i++) {
    const endAngle = currentAngle + sweepAnglePerSeg;
    const a = (4/3) * Math.tan(sweepAnglePerSeg / 4);

    const x1 = lastX + a * (-rx * Math.sin(currentAngle) * cosAngle - ry * Math.cos(currentAngle) * sinAngle);
    const y1 = lastY + a * (-rx * Math.sin(currentAngle) * sinAngle + ry * Math.cos(currentAngle) * cosAngle);

    const eX = cx + rx * Math.cos(endAngle) * cosAngle - ry * Math.sin(endAngle) * sinAngle;
    const eY = cy + rx * Math.cos(endAngle) * sinAngle + ry * Math.sin(endAngle) * cosAngle;

    const x2 = eX + a * (rx * Math.sin(endAngle) * cosAngle + ry * Math.cos(endAngle) * sinAngle);
    const y2 = eY + a * (rx * Math.sin(endAngle) * sinAngle - ry * Math.cos(endAngle) * cosAngle);

    beziers.push(x1, y1, x2, y2, eX, eY);
    
    lastX = eX;
    lastY = eY;
    currentAngle = endAngle;
  }

  return beziers;
}

// Full parser supporting M, L, C, Q, S, T, H, V, A, Z
export function parsePath(d) {
  // Regex to extract commands and numbers (handles floats, negatives, e-notation)
  const tokens = d.match(/[a-df-z]|[\-+]?(?:\d+\.?\d*|\.\d+)(?:e[\-+]?\d+)?/ig) || [];
  const beziers = []; 
  let x = 0, y = 0;
  let startX = 0, startY = 0;
  let lastCx = null, lastCy = null; // For S and T
  let cmd = '', i = 0;
  let isClosed = false;

  while (i < tokens.length) {
    if (isNaN(parseFloat(tokens[i]))) {
      cmd = tokens[i++];
    }
    const isRel = cmd.toLowerCase() === cmd;
    const c = cmd.toUpperCase();
    isClosed = false;

    if (c === 'M') {
      x = isRel ? x + +tokens[i++] : +tokens[i++];
      y = isRel ? y + +tokens[i++] : +tokens[i++];
      startX = x; startY = y;
      lastCx = null; lastCy = null;
      cmd = isRel ? 'l' : 'L';
    } else if (c === 'L') {
      const nx = isRel ? x + +tokens[i++] : +tokens[i++];
      const ny = isRel ? y + +tokens[i++] : +tokens[i++];
      beziers.push(x, y, nx, ny, nx, ny);
      x = nx; y = ny;
      lastCx = null; lastCy = null;
    } else if (c === 'H') {
      const nx = isRel ? x + +tokens[i++] : +tokens[i++];
      beziers.push(x, y, nx, y, nx, y);
      x = nx;
      lastCx = null; lastCy = null;
    } else if (c === 'V') {
      const ny = isRel ? y + +tokens[i++] : +tokens[i++];
      beziers.push(x, y, x, ny, x, ny);
      y = ny;
      lastCx = null; lastCy = null;
    } else if (c === 'C') {
      const x1 = isRel ? x + +tokens[i++] : +tokens[i++];
      const y1 = isRel ? y + +tokens[i++] : +tokens[i++];
      const x2 = isRel ? x + +tokens[i++] : +tokens[i++];
      const y2 = isRel ? y + +tokens[i++] : +tokens[i++];
      const nx = isRel ? x + +tokens[i++] : +tokens[i++];
      const ny = isRel ? y + +tokens[i++] : +tokens[i++];
      beziers.push(x1, y1, x2, y2, nx, ny);
      x = nx; y = ny;
      lastCx = x2; lastCy = y2;
    } else if (c === 'S') {
      // Reflection of previous control point
      const x1 = (lastCx !== null) ? x + (x - lastCx) : x;
      const y1 = (lastCy !== null) ? y + (y - lastCy) : y;
      const x2 = isRel ? x + +tokens[i++] : +tokens[i++];
      const y2 = isRel ? y + +tokens[i++] : +tokens[i++];
      const nx = isRel ? x + +tokens[i++] : +tokens[i++];
      const ny = isRel ? y + +tokens[i++] : +tokens[i++];
      beziers.push(x1, y1, x2, y2, nx, ny);
      x = nx; y = ny;
      lastCx = x2; lastCy = y2;
    } else if (c === 'Q') {
      const cx = isRel ? x + +tokens[i++] : +tokens[i++];
      const cy = isRel ? y + +tokens[i++] : +tokens[i++];
      const nx = isRel ? x + +tokens[i++] : +tokens[i++];
      const ny = isRel ? y + +tokens[i++] : +tokens[i++];
      
      const x1 = x + (2/3) * (cx - x);
      const y1 = y + (2/3) * (cy - y);
      const x2 = nx + (2/3) * (cx - nx);
      const y2 = ny + (2/3) * (cy - ny);
      
      beziers.push(x1, y1, x2, y2, nx, ny);
      x = nx; y = ny;
      lastCx = cx; lastCy = cy;
    } else if (c === 'T') {
      const cx = (lastCx !== null) ? x + (x - lastCx) : x;
      const cy = (lastCy !== null) ? y + (y - lastCy) : y;
      const nx = isRel ? x + +tokens[i++] : +tokens[i++];
      const ny = isRel ? y + +tokens[i++] : +tokens[i++];
      
      const x1 = x + (2/3) * (cx - x);
      const y1 = y + (2/3) * (cy - y);
      const x2 = nx + (2/3) * (cx - nx);
      const y2 = ny + (2/3) * (cy - ny);
      
      beziers.push(x1, y1, x2, y2, nx, ny);
      x = nx; y = ny;
      lastCx = cx; lastCy = cy;
    } else if (c === 'A') {
      const rx = +tokens[i++];
      const ry = +tokens[i++];
      const angle = +tokens[i++];
      const laf = +tokens[i++];
      const sf = +tokens[i++];
      const nx = isRel ? x + +tokens[i++] : +tokens[i++];
      const ny = isRel ? y + +tokens[i++] : +tokens[i++];
      
      const arcBeziers = arcToBezier(x, y, rx, ry, angle, laf, sf, nx, ny);
      beziers.push(...arcBeziers);
      
      x = nx; y = ny;
      lastCx = null; lastCy = null;
    } else if (c === 'Z') {
      const dx = startX - x;
      const dy = startY - y;
      // Only push a bezier for Z if there is a meaningful visual gap.
      // Otherwise, we just mark it closed and let the render append Z.
      if (dx * dx + dy * dy > 0.1) {
        beziers.push(x, y, startX, startY, startX, startY);
      }
      x = startX; y = startY;
      lastCx = null; lastCy = null;
      isClosed = true;
    } else {
      i++;
    }
  }
  return { startX, startY, beziers, isClosed };
}

function splitBezier(bz, index) {
  const x0 = bz[index - 2], y0 = bz[index - 1];
  const x1 = bz[index],     y1 = bz[index + 1];
  const x2 = bz[index + 2], y2 = bz[index + 3];
  const x3 = bz[index + 4], y3 = bz[index + 5];

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  const lx1 = (x0 + x1) / 2;
  const ly1 = (y0 + y1) / 2;
  const lx2 = (lx1 + mx) / 2;
  const ly2 = (ly1 + my) / 2;

  const rx2 = (x2 + x3) / 2;
  const ry2 = (y2 + y3) / 2;
  const rx1 = (mx + rx2) / 2;
  const ry1 = (my + ry2) / 2;

  const x_mid = (lx2 + rx1) / 2;
  const y_mid = (ly2 + ry1) / 2;

  bz.splice(index, 6, 
    lx1, ly1, lx2, ly2, x_mid, y_mid,
    rx1, ry1, rx2, ry2, x3, y3
  );
}

function splitLongestBezier(bz) {
  let maxDistSq = -1;
  let maxIdx = 2;
  for (let i = 2; i < bz.length; i += 6) {
    const dx = bz[i + 4] - bz[i - 2];
    const dy = bz[i + 5] - bz[i - 1];
    const distSq = dx * dx + dy * dy;
    if (distSq > maxDistSq) {
      maxDistSq = distSq;
      maxIdx = i;
    }
  }
  splitBezier(bz, maxIdx);
}

function reversePath(bz) {
  let numBeziers = (bz.length - 2) / 6;
  let newBz = [];
  let oldLastX = bz[bz.length - 2];
  let oldLastY = bz[bz.length - 1];
  newBz.push(oldLastX, oldLastY);

  for (let k = numBeziers - 1; k >= 0; k--) {
    let idx = 2 + k * 6;
    let cx1 = bz[idx + 2];
    let cy1 = bz[idx + 3];
    let cx2 = bz[idx];
    let cy2 = bz[idx + 1];
    
    let endX = (k === 0) ? bz[0] : bz[2 + (k-1)*6 + 4];
    let endY = (k === 0) ? bz[1] : bz[2 + (k-1)*6 + 5];
    
    newBz.push(cx1, cy1, cx2, cy2, endX, endY);
  }
  
  for (let i = 0; i < newBz.length; i++) bz[i] = newBz[i];
}

function alignPaths(b1, b2, isClosed1, isClosed2) {
  if (!isClosed1 || !isClosed2) return;
  const numBeziers = (b1.length - 2) / 6;
  if (numBeziers <= 1) return;

  function getShiftDist(bz1, bz2, shift) {
    let totalDist = 0;
    for (let k = 0; k < numBeziers; k++) {
      let x1 = (k === 0) ? bz1[0] : bz1[2 + (k-1)*6 + 4];
      let y1 = (k === 0) ? bz1[1] : bz1[2 + (k-1)*6 + 5];

      let m = (k + shift) % numBeziers;
      let x2 = (m === 0) ? bz2[0] : bz2[2 + (m-1)*6 + 4];
      let y2 = (m === 0) ? bz2[1] : bz2[2 + (m-1)*6 + 5];

      totalDist += (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    }
    return totalDist;
  }

  let minTotalDist = Infinity;
  let bestShift = 0;
  let bestIsReverse = false;

  let b2Rev = b2.slice();
  reversePath(b2Rev);

  for (let shift = 0; shift < numBeziers; shift++) {
    let distFwd = getShiftDist(b1, b2, shift);
    if (distFwd < minTotalDist) {
      minTotalDist = distFwd;
      bestShift = shift;
      bestIsReverse = false;
    }
    let distRev = getShiftDist(b1, b2Rev, shift);
    if (distRev < minTotalDist) {
      minTotalDist = distRev;
      bestShift = shift;
      bestIsReverse = true;
    }
  }

  let targetB2 = bestIsReverse ? b2Rev : b2;
  let newB2 = [];
  let newStartX = (bestShift === 0) ? targetB2[0] : targetB2[2 + (bestShift - 1)*6 + 4];
  let newStartY = (bestShift === 0) ? targetB2[1] : targetB2[2 + (bestShift - 1)*6 + 5];
  
  newB2.push(newStartX, newStartY);

  for (let k = 0; k < numBeziers; k++) {
    let m = (k + bestShift) % numBeziers;
    let idx = 2 + m * 6;
    newB2.push(targetB2[idx], targetB2[idx+1], targetB2[idx+2], targetB2[idx+3], targetB2[idx+4], targetB2[idx+5]);
  }
  
  for (let i = 0; i < newB2.length; i++) b2[i] = newB2[i];
}

function closePath(beziers, startX, startY) {
  // Trace the bezier array backwards to produce a closed outline.
  // Correct reversal of a cubic bezier [cp1, cp2, end] from implicit start P0:
  //   reversed: end -> [cp2, cp1, P0]
  const reversed = [];
  const n = beziers.length / 6;
  for (let seg = n - 1; seg >= 0; seg--) {
    const i = seg * 6;
    // The implicit start of this original segment
    const segStartX = seg === 0 ? startX : beziers[(seg - 1) * 6 + 4];
    const segStartY = seg === 0 ? startY : beziers[(seg - 1) * 6 + 5];
    reversed.push(
      beziers[i + 2], beziers[i + 3], // cp1 of reversed = cp2 of original
      beziers[i],     beziers[i + 1], // cp2 of reversed = cp1 of original
      segStartX,      segStartY       // end of reversed = implicit start of original
    );
  }
  return reversed;
}

function normalizePaths(d1, d2) {
  const p1 = parsePath(d1);
  const p2 = parsePath(d2);

  let b1 = p1.beziers;
  let b2 = p2.beziers;
  let isClosed1 = p1.isClosed;
  let isClosed2 = p2.isClosed;

  if (b1.length === 0 || b2.length === 0) return null;

  // If one path is open and the other closed, close the open one by tracing
  // it back to its own start. This prevents open/closed mismatch artifacts.
  if (isClosed1 !== isClosed2) {
    if (!isClosed1) {
      const extra = closePath(b1, p1.startX, p1.startY);
      b1 = b1.concat(extra);
      isClosed1 = true;
    } else {
      const extra = closePath(b2, p2.startX, p2.startY);
      b2 = b2.concat(extra);
      isClosed2 = true;
    }
  }

  b1.unshift(p1.startX, p1.startY);
  b2.unshift(p2.startX, p2.startY);

  while (b1.length < b2.length) { splitLongestBezier(b1); }
  while (b2.length < b1.length) { splitLongestBezier(b2); }

  alignPaths(b1, b2, isClosed1, isClosed2);

  const start1 = [b1.shift(), b1.shift()];
  const start2 = [b2.shift(), b2.shift()];

  return { start1, start2, beziers1: b1, beziers2: b2, isClosed1, isClosed2 };
}

export function renderPath(start, beziers, isClosed = false) {
  let d = `M${start[0]},${start[1]} C`;
  for (let i = 0; i < beziers.length; i += 6) {
    // If it's the very last bezier and the path is closed, forcefully snap its end to start
    // to prevent floating-point tears or elastic overshoot slice artifacts.
    if (isClosed && i === beziers.length - 6) {
      d += `${beziers[i]},${beziers[i+1]} ${beziers[i+2]},${beziers[i+3]} ${start[0]},${start[1]} `;
    } else {
      d += `${beziers[i]},${beziers[i+1]} ${beziers[i+2]},${beziers[i+3]} ${beziers[i+4]},${beziers[i+5]} `;
    }
  }
  if (isClosed) d += 'Z';
  return d.trim();
}

export function elementToPath(el) {
  if (typeof el === 'string') return el;
  if (!el || !el.tagName) return '';

  const tag = el.tagName.toLowerCase();
  
  if (tag === 'path') {
    return el.getAttribute('d') || '';
  }

  if (tag === 'circle') {
    const cx = parseFloat(el.getAttribute('cx')) || 0;
    const cy = parseFloat(el.getAttribute('cy')) || 0;
    const r = parseFloat(el.getAttribute('r')) || 0;
    return `M ${cx - r}, ${cy} A ${r},${r} 0 1,0 ${cx + r},${cy} A ${r},${r} 0 1,0 ${cx - r},${cy} Z`;
  }

  if (tag === 'ellipse') {
    const cx = parseFloat(el.getAttribute('cx')) || 0;
    const cy = parseFloat(el.getAttribute('cy')) || 0;
    const rx = parseFloat(el.getAttribute('rx')) || 0;
    const ry = parseFloat(el.getAttribute('ry')) || 0;
    return `M ${cx - rx}, ${cy} A ${rx},${ry} 0 1,0 ${cx + rx},${cy} A ${rx},${ry} 0 1,0 ${cx - rx},${cy} Z`;
  }

  if (tag === 'rect') {
    const x = parseFloat(el.getAttribute('x')) || 0;
    const y = parseFloat(el.getAttribute('y')) || 0;
    const w = parseFloat(el.getAttribute('width')) || 0;
    const h = parseFloat(el.getAttribute('height')) || 0;
    let rx = parseFloat(el.getAttribute('rx')) || 0;
    let ry = parseFloat(el.getAttribute('ry')) || 0;
    
    if (rx && !ry) ry = rx;
    else if (ry && !rx) rx = ry;

    if (!rx && !ry) {
      return `M ${x},${y} L ${x + w},${y} L ${x + w},${y + h} L ${x},${y + h} Z`;
    } else {
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      return `M ${x + rx},${y} L ${x + w - rx},${y} A ${rx},${ry} 0 0,1 ${x + w},${y + ry} L ${x + w},${y + h - ry} A ${rx},${ry} 0 0,1 ${x + w - rx},${y + h} L ${x + rx},${y + h} A ${rx},${ry} 0 0,1 ${x},${y + h - ry} L ${x},${y + ry} A ${rx},${ry} 0 0,1 ${x + rx},${y} Z`;
    }
  }

  if (tag === 'line') {
    const x1 = parseFloat(el.getAttribute('x1')) || 0;
    const y1 = parseFloat(el.getAttribute('y1')) || 0;
    const x2 = parseFloat(el.getAttribute('x2')) || 0;
    const y2 = parseFloat(el.getAttribute('y2')) || 0;
    // Generate 8 evenly-spaced waypoints along the line.
    // The open/closed mismatch with any target is handled in normalizePaths.
    const steps = 8;
    const dx = (x2 - x1) / steps;
    const dy = (y2 - y1) / steps;
    let d = `M ${x1},${y1}`;
    for (let i = 1; i <= steps; i++) {
      d += ` L ${+(x1 + dx * i).toFixed(3)},${+(y1 + dy * i).toFixed(3)}`;
    }
    return d;
  }

  if (tag === 'polygon' || tag === 'polyline') {
    const points = (el.getAttribute('points') || '').trim().split(/[\s,]+/);
    if (points.length < 2) return '';
    let d = `M ${points[0]},${points[1]} `;
    for (let i = 2; i < points.length; i += 2) {
      if (points[i] !== undefined && points[i+1] !== undefined) {
        d += `L ${points[i]},${points[i+1]} `;
      }
    }
    if (tag === 'polygon') d += 'Z';
    return d.trim();
  }

  return '';
}

export function convertToPath(targets) {
  let els = [];
  if (typeof targets === 'string') els = Array.from(document.querySelectorAll(targets));
  else if (isElementLike(targets)) els = [targets];
  else if (targets.length) els = Array.from(targets);
  
  const paths = [];
  els.forEach(el => {
    if (el.tagName.toLowerCase() === 'path') {
      paths.push(el);
      return;
    }
    const d = elementToPath(el);
    if (!d) return;
    
    const path = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    
    // Copy attributes
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      const name = attr.name;
      if (name !== 'x' && name !== 'y' && name !== 'width' && name !== 'height' && name !== 'cx' && name !== 'cy' && name !== 'r' && name !== 'rx' && name !== 'ry' && name !== 'x1' && name !== 'x2' && name !== 'y1' && name !== 'y2' && name !== 'points') {
        path.setAttribute(name, attr.value);
      }
    }
    
    if (el.parentNode) {
      el.parentNode.replaceChild(path, el);
    }
    paths.push(path);
  });
  
  return paths.length === 1 ? paths[0] : paths;
}

function getPathString(target) {
  if (typeof target === 'string') {
    if (target.startsWith('M') || target.startsWith('m')) return target;
    const el = document.querySelector(target);
    return el ? elementToPath(el) : '';
  }
  if (isElementLike(target)) {
    return elementToPath(target);
  }
  return '';
}

export const PathMorphPlugin = {
  name: 'morphPath',
  convertToPath,
  elementToPath,
  
  prepare(target, prop, fromVal, toVal) {
    let startD;
    const isDOM = target.tagName && target.tagName.toLowerCase() === 'path';

    // If it's not a path element and not a plain object, fail
    if (!isDOM && typeof target !== 'object') {
      return { type: 'morphPath', valid: false };
    }

    // If the user passed an object like { from: 'M...', to: 'M...' } or { path: 'M...' }
    let explicitTo = toVal;
    let explicitFrom = fromVal;

    if (toVal && typeof toVal === 'object' && !isElementLike(toVal)) {
      explicitTo = toVal.to || toVal.path || toVal.shape || toVal;
      if (toVal.from) explicitFrom = toVal.from;
    }

    // Prioritize explicitFrom, then fromVal (from startAt), fallback to live state
    if (isDOM) {
      startD = getPathString(explicitFrom) || target.getAttribute('d');
    } else {
      startD = getPathString(explicitFrom) || target[prop];
    }

    const endD = getPathString(explicitTo);

    if (!startD || !endD) return { type: 'morphPath', valid: false };

    const norm = normalizePaths(startD, endD);
    if (!norm) return { type: 'morphPath', valid: false };

    return {
      type: 'plugin',
      prop: prop,
      target,
      isDOM,
      s1: norm.start1,
      s2: norm.start2,
      b1: norm.beziers1,
      b2: norm.beziers2,
      isClosed1: norm.isClosed1,
      isClosed2: norm.isClosed2,
      currentStart: [0, 0],
      currentBeziers: new Array(norm.beziers1.length),
      valid: true
    };
  },

  render(target, desc, progress) {
    if (!desc.valid) return;

    desc.currentStart[0] = desc.s1[0] + (desc.s2[0] - desc.s1[0]) * progress;
    desc.currentStart[1] = desc.s1[1] + (desc.s2[1] - desc.s1[1]) * progress;

    for (let i = 0; i < desc.b1.length; i++) {
      desc.currentBeziers[i] = desc.b1[i] + (desc.b2[i] - desc.b1[i]) * progress;
    }

    const isClosed = (progress > 0.99 && desc.isClosed2) || (progress < 0.01 && desc.isClosed1) || (desc.isClosed1 && desc.isClosed2);
    const d = renderPath(desc.currentStart, desc.currentBeziers, isClosed);
    
    if (desc.isDOM) {
      target.setAttribute('d', d);
    } else {
      target[desc.prop] = d;
    }
  }
};

export default PathMorphPlugin;
export { PathMorphPlugin as PathMorph };

registerPropertyPlugin('morphPath', PathMorphPlugin);
