import { lerp } from './UnitParser.js';
import { getOwnerDocument, getOwnerWindow, getMeasurementHost } from './TargetResolver.js';

const NUMBER_AND_UNIT_REGEX = /(-?\d*\.?\d+)(%|px|em|rem|vh|vw|vmin|vmax|cm|mm|in|pt|pc|deg|rad|turn)?/g;

/**
 * Returns canonical computed style for a complex clip-path.
 */
function getCanonical(target, valStr) {
  const doc = getOwnerDocument(target);
  const host = getMeasurementHost(target);
  if (!doc || !host || valStr === 'none') return valStr;
  const dummy = doc.createElement('div');
  if (target && typeof target.offsetWidth === 'number' && target.offsetWidth > 0) {
    dummy.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;width:${target.offsetWidth}px;height:${target.offsetHeight}px;`;
  } else {
    dummy.style.display = 'none';
  }
  host.appendChild(dummy);
  dummy.style.clipPath = valStr;
  const computed = getOwnerWindow(target).getComputedStyle(dummy).clipPath;
  host.removeChild(dummy);
  return computed && computed !== 'none' ? computed : valStr;
}

/**
 * Extracts values and units from a clip-path string, returning a unitless template.
 */
function parseClipPath(str) {
  const values = [];
  const units = [];
  
  // Normalize whitespace
  str = str.replace(/\s+/g, ' ').trim();
  
  const template = str.replace(NUMBER_AND_UNIT_REGEX, (match, numStr, unit) => {
    values.push(parseFloat(numStr));
    units.push(unit || '');
    return '{}';
  });

  return { template, values, units, original: str };
}

/**
 * Handles 'none' gracefully by adopting the counterpart's structure.
 */
function handleNone(fromStr, toStr) {
  if (fromStr === 'none') {
    if (toStr.includes('polygon')) return 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
    if (toStr.includes('circle')) return 'circle(100% at 50% 50%)';
    if (toStr.includes('inset')) return 'inset(0%)';
    if (toStr.includes('ellipse')) return 'ellipse(100% 100% at 50% 50%)';
    if (toStr.includes('xywh')) return 'xywh(0% 0% 100% 100%)';
    if (toStr.includes('rect')) return 'rect(0% 100% 100% 0%)';
    if (toStr.includes('path')) return 'inset(0%)'; // Transpiler will handle converting this to a polygon
    return 'inset(0%)'; // Universal fallback for any unknown shape
  }
  
  if (toStr === 'none') {
    if (fromStr.includes('polygon')) return 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
    if (fromStr.includes('circle')) return 'circle(100% at 50% 50%)';
    if (fromStr.includes('inset')) return 'inset(0%)';
    if (fromStr.includes('ellipse')) return 'ellipse(100% 100% at 50% 50%)';
    if (fromStr.includes('xywh')) return 'xywh(0% 0% 100% 100%)';
    if (fromStr.includes('rect')) return 'rect(0% 100% 100% 0%)';
    if (fromStr.includes('path')) return 'inset(0%)';
    return 'inset(0%)';
  }
  
  return fromStr === 'none' ? toStr : fromStr;
}

/**
 * Evaluates any CSS length (calc, vh, em, etc.) into an absolute percentage relative to the target's dimension.
 */
export function resolveCSSLength(valStr, target, isVertical) {
  if (!valStr || !target) return 0;
  const doc = getOwnerDocument(target);
  if (!doc) return 0;
  valStr = valStr.trim();
  if (valStr.endsWith('%')) return parseFloat(valStr);
  const total = isVertical ? target.offsetHeight : target.offsetWidth;
  if (valStr.endsWith('px')) return parseFloat(valStr) / total * 100;
  if (valStr === '0') return 0;

  const win = getOwnerWindow(target);

  // Temporarily make the target a containing block to correctly resolve % inside calc()
  const computedPos = win.getComputedStyle(target).position;
  const originalPos = target.style.position;
  let posChanged = false;
  if (computedPos === 'static') {
    target.style.position = 'relative';
    posChanged = true;
  }

  const dummy = doc.createElement('div');
  dummy.style.position = 'absolute';
  dummy.style.visibility = 'hidden';
  dummy.style.pointerEvents = 'none';
  if (isVertical) dummy.style.height = valStr;
  else dummy.style.width = valStr;

  target.appendChild(dummy);
  const computed = win.getComputedStyle(dummy);
  const pxVal = parseFloat(isVertical ? computed.height : computed.width) || 0;
  target.removeChild(dummy);

  if (posChanged) {
    target.style.position = originalPos;
  }

  return (pxVal / total) * 100;
}

/**
 * Converts a circle, ellipse, inset, or path into a polygon string using purely relative percentages.
 */
function convertToPolygon(shapeStr, target, numPoints = 12) {
  if (shapeStr.startsWith('polygon') || shapeStr === 'none') return shapeStr;
  
  shapeStr = shapeStr.trim().replace(/\s+/g, ' ');

  const w = target ? target.offsetWidth : 100;
  const h = target ? target.offsetHeight : 100;

  if (shapeStr.startsWith('path(') && typeof document !== 'undefined') {
    const match = shapeStr.match(/path\((['"]?)(.*?)\1\)/);
    if (match) {
      const doc = getOwnerDocument(target);
      const host = getMeasurementHost(target);
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', match[2]);
      svg.appendChild(path);
      host.appendChild(svg);
      
      const len = path.getTotalLength();
      if (len === 0) {
        host.removeChild(svg);
        return 'polygon(0% 0%)';
      }

      const points = [];
      const steps = Math.max(numPoints, 24); // Use more points for paths to capture curves
      for (let i = 0; i < steps; i++) {
        const pt = path.getPointAtLength((i / steps) * len);
        points.push(`${Math.round((pt.x / w * 100) * 1000) / 1000}% ${Math.round((pt.y / h * 100) * 1000) / 1000}%`);
      }
      host.removeChild(svg);
      return `polygon(${points.join(', ')})`;
    }
  }

  if (shapeStr.startsWith('inset')) {
    const inner = shapeStr.substring(shapeStr.indexOf('(') + 1, shapeStr.lastIndexOf(')'));
    let argsStr = inner;
    let roundStr = '';
    const roundIdx = inner.lastIndexOf(' round ');
    if (roundIdx !== -1) {
      argsStr = inner.substring(0, roundIdx);
      roundStr = inner.substring(roundIdx + 7);
    }
    
    const vals = argsStr.trim().split(/\s+(?![^(]*\))/);
    if (vals.length > 0) {
      const t = resolveCSSLength(vals[0], target, true);
      const r = resolveCSSLength(vals[1] || vals[0], target, false);
      const b = resolveCSSLength(vals[2] || vals[0], target, true);
      const l = resolveCSSLength(vals[3] || vals[1] || vals[0], target, false);

      if (roundStr) {
        const halves = roundStr.split('/');
        const xVals = halves[0].trim().split(/\s+(?![^(]*\))/);
        const yVals = (halves[1] || halves[0]).trim().split(/\s+(?![^(]*\))/);
        
        const expandRound = (vals, isY) => [
          resolveCSSLength(vals[0] || '0%', target, isY),
          resolveCSSLength(vals[1] || vals[0] || '0%', target, isY),
          resolveCSSLength(vals[2] || vals[0] || '0%', target, isY),
          resolveCSSLength(vals[3] || vals[1] || vals[0] || '0%', target, isY)
        ];
        
        const rx = expandRound(xVals, false);
        const ry = expandRound(yVals, true);
        
        const pts = [];
        const addArc = (cx, cy, radiusX, radiusY, startAngle, endAngle) => {
          const steps = Math.max(3, Math.ceil(numPoints / 4));
          for (let i = 0; i < steps; i++) {
            const theta = startAngle + (endAngle - startAngle) * (i / (steps - 1));
            let x = cx + radiusX * Math.cos(theta);
            let y = cy + radiusY * Math.sin(theta);
            pts.push(`${Math.round(x * 1000) / 1000}% ${Math.round(y * 1000) / 1000}%`);
          }
        };
        
        addArc(l + rx[0], t + ry[0], rx[0], ry[0], Math.PI, 1.5 * Math.PI); // TL
        addArc(100 - r - rx[1], t + ry[1], rx[1], ry[1], 1.5 * Math.PI, 2 * Math.PI); // TR
        addArc(100 - r - rx[2], 100 - b - ry[2], rx[2], ry[2], 0, 0.5 * Math.PI); // BR
        addArc(l + rx[3], 100 - b - ry[3], rx[3], ry[3], 0.5 * Math.PI, Math.PI); // BL
        
        return `polygon(${pts.join(', ')})`;
      }
      
      return `polygon(${l}% ${t}%, ${100 - r}% ${t}%, ${100 - r}% ${100 - b}%, ${l}% ${100 - b}%)`;
    }
  }

  if (shapeStr.startsWith('rect')) {
    const inner = shapeStr.substring(shapeStr.indexOf('(') + 1, shapeStr.lastIndexOf(')'));
    let argsStr = inner;
    let roundStr = '';
    const roundIdx = inner.lastIndexOf(' round ');
    if (roundIdx !== -1) {
      argsStr = inner.substring(0, roundIdx);
      roundStr = inner.substring(roundIdx + 7);
    }
    
    const vals = argsStr.trim().replace(/,/g, ' ').split(/\s+(?![^(]*\))/);
    if (vals.length >= 4) {
      const t = resolveCSSLength(vals[0] || '0%', target, true);
      const r = resolveCSSLength(vals[1] || '100%', target, false);
      const b = resolveCSSLength(vals[2] || '100%', target, true);
      const l = resolveCSSLength(vals[3] || '0%', target, false);
      
      if (roundStr) {
        const halves = roundStr.split('/');
        const xVals = halves[0].trim().split(/\s+(?![^(]*\))/);
        const yVals = (halves[1] || halves[0]).trim().split(/\s+(?![^(]*\))/);
        
        const expandRound = (vals, isY) => [
          resolveCSSLength(vals[0] || '0%', target, isY),
          resolveCSSLength(vals[1] || vals[0] || '0%', target, isY),
          resolveCSSLength(vals[2] || vals[0] || '0%', target, isY),
          resolveCSSLength(vals[3] || vals[1] || vals[0] || '0%', target, isY)
        ];
        
        const rx = expandRound(xVals, false);
        const ry = expandRound(yVals, true);
        
        const pts = [];
        const addArc = (cx, cy, radiusX, radiusY, startAngle, endAngle) => {
          const steps = Math.max(3, Math.ceil(numPoints / 4));
          for (let i = 0; i < steps; i++) {
            const theta = startAngle + (endAngle - startAngle) * (i / (steps - 1));
            let x = cx + radiusX * Math.cos(theta);
            let y = cy + radiusY * Math.sin(theta);
            pts.push(`${Math.round(x * 1000) / 1000}% ${Math.round(y * 1000) / 1000}%`);
          }
        };
        
        addArc(l + rx[0], t + ry[0], rx[0], ry[0], Math.PI, 1.5 * Math.PI); // TL
        addArc(r - rx[1], t + ry[1], rx[1], ry[1], 1.5 * Math.PI, 2 * Math.PI); // TR
        addArc(r - rx[2], b - ry[2], rx[2], ry[2], 0, 0.5 * Math.PI); // BR
        addArc(l + rx[3], b - ry[3], rx[3], ry[3], 0.5 * Math.PI, Math.PI); // BL
        
        return `polygon(${pts.join(', ')})`;
      }
      
      return `polygon(${l}% ${t}%, ${r}% ${t}%, ${r}% ${b}%, ${l}% ${b}%)`;
    }
  }

  if (shapeStr.startsWith('xywh')) {
    const match = shapeStr.match(/xywh\((.*?)(?:\s+round\s+(.*?))?\)/);
    if (match) {
      const vals = match[1].trim().replace(/,/g, ' ').split(/\s+(?![^(]*\))/);
      const x = resolveCSSLength(vals[0] || '0%', target, false);
      const y = resolveCSSLength(vals[1] || '0%', target, true);
      const wVal = resolveCSSLength(vals[2] || '100%', target, false);
      const hVal = resolveCSSLength(vals[3] || '100%', target, true);
      
      const t = y;
      const r = x + wVal;
      const b = y + hVal;
      const l = x;

      const roundStr = match[2];
      if (roundStr) {
        const halves = roundStr.split('/');
        const xVals = halves[0].trim().split(/\s+(?![^(]*\))/);
        const yVals = (halves[1] || halves[0]).trim().split(/\s+(?![^(]*\))/);
        
        const expandRound = (vals, isY) => [
          resolveCSSLength(vals[0] || '0%', target, isY),
          resolveCSSLength(vals[1] || vals[0] || '0%', target, isY),
          resolveCSSLength(vals[2] || vals[0] || '0%', target, isY),
          resolveCSSLength(vals[3] || vals[1] || vals[0] || '0%', target, isY)
        ];
        
        const rx = expandRound(xVals, false);
        const ry = expandRound(yVals, true);
        
        const innerW = Math.max(0, r - l);
        const innerH = Math.max(0, b - t);
        for (let i = 0; i < 4; i++) {
          rx[i] = Math.min(rx[i], innerW / 2);
          ry[i] = Math.min(ry[i], innerH / 2);
        }

        const pts = [];
        const cornerPoints = Math.max(3, Math.ceil(numPoints / 4));
        
        const addArc = (cx, cy, radiusX, radiusY, startA, endA) => {
          for (let i = 0; i < cornerPoints; i++) {
            const theta = startA + (endA - startA) * (i / (cornerPoints - 1));
            const x = cx + radiusX * Math.cos(theta);
            const y = cy + radiusY * Math.sin(theta);
            pts.push(`${Math.round(x*1000)/1000}% ${Math.round(y*1000)/1000}%`);
          }
        };

        addArc(l + rx[0], t + ry[0], rx[0], ry[0], Math.PI, 1.5 * Math.PI); // TL
        addArc(r - rx[1], t + ry[1], rx[1], ry[1], 1.5 * Math.PI, 2 * Math.PI); // TR
        addArc(r - rx[2], b - ry[2], rx[2], ry[2], 0, 0.5 * Math.PI); // BR
        addArc(l + rx[3], b - ry[3], rx[3], ry[3], 0.5 * Math.PI, Math.PI); // BL
        
        return `polygon(${pts.join(', ')})`;
      }
      
      return `polygon(${l}% ${t}%, ${r}% ${t}%, ${r}% ${b}%, ${l}% ${b}%)`;
    }
  }

  if (shapeStr.startsWith('circle') || shapeStr.startsWith('ellipse')) {
    const isCircle = shapeStr.startsWith('circle');
    const match = shapeStr.match(/(?:circle|ellipse)\((.*?)(?:\s+at\s+(.*?))?\)/);
    if (match) {
      let rStr = (match[1] || '').trim();
      let posStr = (match[2] || '50% 50%').trim().split(' ');
      let cxStr = posStr[0] || '50%';
      let cyStr = posStr[1] || cxStr;

      if (!rStr || rStr.includes('at')) rStr = 'closest-side';

      let cx = resolveCSSLength(cxStr, target, false);
      let cy = resolveCSSLength(cyStr, target, true);

      let pxRadiusX, pxRadiusY;
      
      const cxPx = cx / 100 * w;
      const cyPx = cy / 100 * h;

      if (isCircle) {
        let rPx;
        if (rStr === 'closest-side') {
          rPx = Math.min(cxPx, w - cxPx, cyPx, h - cyPx);
        } else if (rStr === 'farthest-side') {
          rPx = Math.max(cxPx, w - cxPx, cyPx, h - cyPx);
        } else if (rStr.endsWith('%')) {
          const ref = Math.sqrt(w * w + h * h) / Math.sqrt(2);
          rPx = parseFloat(rStr) / 100 * ref;
        } else {
          rPx = resolveCSSLength(rStr, target, false) / 100 * w;
        }
        pxRadiusX = rPx;
        pxRadiusY = rPx;
      } else {
        const rVals = rStr.split(' ');
        let rxStr = rVals[0] || 'closest-side';
        let ryStr = rVals[1] || rxStr;

        if (rxStr === 'closest-side') pxRadiusX = Math.min(cxPx, w - cxPx);
        else if (rxStr === 'farthest-side') pxRadiusX = Math.max(cxPx, w - cxPx);
        else if (rxStr.endsWith('%')) pxRadiusX = parseFloat(rxStr) / 100 * w;
        else pxRadiusX = resolveCSSLength(rxStr, target, false) / 100 * w;

        if (ryStr === 'closest-side') pxRadiusY = Math.min(cyPx, h - cyPx);
        else if (ryStr === 'farthest-side') pxRadiusY = Math.max(cyPx, h - cyPx);
        else if (ryStr.endsWith('%')) pxRadiusY = parseFloat(ryStr) / 100 * h;
        else pxRadiusY = resolveCSSLength(ryStr, target, true) / 100 * h;
      }

      let rx = pxRadiusX / w * 100;
      let ry = pxRadiusY / h * 100;

      let points = [];
      const steps = Math.max(12, numPoints);
      for (let i = 0; i < steps; i++) {
        const theta = (i / steps) * 2 * Math.PI - (Math.PI / 2);
        let x = cx + rx * Math.cos(theta);
        let y = cy + ry * Math.sin(theta);
        points.push(`${Math.round(x * 1000) / 1000}% ${Math.round(y * 1000) / 1000}%`);
      }
      return `polygon(${points.join(', ')})`;
    }
  }

  if (shapeStr.startsWith('path')) {
    const match = shapeStr.match(/path\(['"]?(.*?)['"]?\)/);
    if (match) {
      const d = match[1];
      const doc = getOwnerDocument(target);
      const svgPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      svgPath.setAttribute('d', d);
      const totalLen = svgPath.getTotalLength() || 0;
      
      const pts = [];
      const steps = Math.max(3, numPoints);
      const width = target && target.offsetWidth ? target.offsetWidth : 100;
      const height = target && target.offsetHeight ? target.offsetHeight : 100;
      
      for (let i = 0; i < steps; i++) {
        const pt = svgPath.getPointAtLength(totalLen * (i / (steps - 1)));
        const px = (pt.x / width) * 100;
        const py = (pt.y / height) * 100;
        pts.push(`${Math.round(px * 1000) / 1000}% ${Math.round(py * 1000) / 1000}%`);
      }
      return `polygon(${pts.join(', ')})`;
    }
  }

  return shapeStr;
}

/**
 * Pads polygon points if lengths mismatch.
 */
function padPolygon(fromStr, toStr) {
  if (fromStr.includes('polygon') && toStr.includes('polygon')) {
    const fromMatch = fromStr.match(/polygon\((.*)\)/);
    const toMatch = toStr.match(/polygon\((.*)\)/);
    if (fromMatch && toMatch) {
     
      const fromPoints = fromMatch[1].split(',');
      const toPoints = toMatch[1].split(',');
      if (fromPoints.length < toPoints.length) {
        const lastPoint = fromPoints[fromPoints.length - 1];
        while (fromPoints.length < toPoints.length) fromPoints.push(lastPoint);
        return { fromStr: fromStr.replace(fromMatch[1], fromPoints.join(',')), toStr };
      } else if (toPoints.length < fromPoints.length) {
        const lastPoint = toPoints[toPoints.length - 1];
        while (toPoints.length < fromPoints.length) toPoints.push(lastPoint);
        return { fromStr, toStr: toStr.replace(toMatch[1], toPoints.join(',')) };
      }
    }
  }
  return { fromStr, toStr };
}

function getBoxMetrics(target, boxKeyword) {
  if (!target || !target.offsetWidth) return { x: 0, y: 0, w: 100, h: 100 };
  const win = getOwnerWindow(target);
  const style = win.getComputedStyle(target);
  const w = target.offsetWidth;
  const h = target.offsetHeight;

  const mt = parseFloat(style.marginTop) || 0;
  const mr = parseFloat(style.marginRight) || 0;
  const mb = parseFloat(style.marginBottom) || 0;
  const ml = parseFloat(style.marginLeft) || 0;

  const bt = parseFloat(style.borderTopWidth) || 0;
  const br = parseFloat(style.borderRightWidth) || 0;
  const bb = parseFloat(style.borderBottomWidth) || 0;
  const bl = parseFloat(style.borderLeftWidth) || 0;

  const pt = parseFloat(style.paddingTop) || 0;
  const pr = parseFloat(style.paddingRight) || 0;
  const pb = parseFloat(style.paddingBottom) || 0;
  const pl = parseFloat(style.paddingLeft) || 0;

  switch (boxKeyword) {
    case 'margin-box':
      return { x: -ml, y: -mt, w: w + ml + mr, h: h + mt + mb };
    case 'padding-box':
      return { x: bl, y: bt, w: w - bl - br, h: h - bt - bb };
    case 'content-box':
      return { x: bl + pl, y: bt + pt, w: w - bl - br - pl - pr, h: h - bt - bb - pt - pb };
    case 'border-box':
    case 'fill-box':
    case 'stroke-box':
    case 'view-box':
    default:
      return { x: 0, y: 0, w, h };
  }
}

function mapPolygonToPixels(polyStr, boxMetrics) {
  const match = polyStr.match(/polygon\((.*)\)/);
  if (!match) return polyStr;
  const points = match[1].split(',').map(pair => {
    const coords = pair.trim().split(/\s+/);
    if (coords.length !== 2) return pair;

    const mapCoord = (str, offset, size) => {
      let px;
      if (str.endsWith('%')) {
        px = (parseFloat(str) / 100) * size;
      } else {
        px = parseFloat(str);
      }
      return (offset + px).toFixed(3) + 'px';
    };

    const x = mapCoord(coords[0], boxMetrics.x, boxMetrics.w);
    const y = mapCoord(coords[1], boxMetrics.y, boxMetrics.h);
    return `${x} ${y}`;
  });
  return `polygon(${points.join(', ')})`;
}

/**
 * Prepares the descriptor.
 */
export function prepareClipPath(target, fromVal, toVal) {
  let fromStr = String(fromVal);
  let toStr = String(toVal);

  if (fromStr === 'none' || toStr === 'none') {
    if (fromStr === 'none') fromStr = handleNone(fromStr, toStr);
    if (toStr === 'none') toStr = handleNone(toStr, fromStr);
  }

  fromStr = getCanonical(target, fromStr);
  toStr = getCanonical(target, toStr);

  const geometryBoxes = ['margin-box', 'border-box', 'padding-box', 'content-box', 'fill-box', 'stroke-box', 'view-box'];
  const extractBox = (str) => {
    for (const box of geometryBoxes) {
      const regex = new RegExp(`\\b${box}\\b`);
      if (regex.test(str)) {
        return { box, cleanStr: str.replace(regex, '').trim() || 'inset(0%)' };
      }
    }
    return { box: '', cleanStr: str || 'none' };
  };

  const fromExtracted = extractBox(fromStr);
  const toExtracted = extractBox(toStr);
  
  const fromBox = fromExtracted.box;
  const toBox = toExtracted.box;
  fromStr = fromExtracted.cleanStr;
  toStr = toExtracted.cleanStr;

  let parsedFrom = parseClipPath(fromStr);
  let parsedTo = parseClipPath(toStr);

  const mismatchBox = fromBox !== toBox && (fromBox || toBox);

  // Cross-shape morphing: if the functional templates don't match (e.g. circle vs polygon), 
  // transpile both into standard polygons mathematically!
  if (parsedFrom.template !== parsedTo.template || mismatchBox) {
    const fromIsPoly = fromStr.startsWith('polygon');
    const toIsPoly = toStr.startsWith('polygon');
    
    // Determine the ideal point count. If one is a polygon, we match its points (or minimum 12 for smoothness).
    let targetPoints = 12;
    if (fromIsPoly) targetPoints = Math.max(12, parsedFrom.values.length / 2);
    if (toIsPoly) targetPoints = Math.max(12, parsedTo.values.length / 2);
    if (fromStr.startsWith('path(') || toStr.startsWith('path(')) targetPoints = Math.max(24, targetPoints);

    fromStr = convertToPolygon(fromStr, target, targetPoints);
    toStr = convertToPolygon(toStr, target, targetPoints);

    if (mismatchBox) {
      const fromMetrics = getBoxMetrics(target, fromBox || 'border-box');
      const toMetrics = getBoxMetrics(target, toBox || 'border-box');
      
      fromStr = mapPolygonToPixels(fromStr, fromMetrics);
      toStr = mapPolygonToPixels(toStr, toMetrics);
    }
  }

  // Pad polygons if necessary (in case they have mismatched point counts)
  const padded = padPolygon(fromStr, toStr);
  fromStr = padded.fromStr;
  toStr = padded.toStr;

  if (!mismatchBox && fromBox) {
    fromStr = `${fromStr} ${fromBox}`;
  }
  if (!mismatchBox && toBox) {
    toStr = `${toStr} ${toBox}`;
  }

  // Reparse with final structure
  parsedFrom = parseClipPath(fromStr);
  parsedTo = parseClipPath(toStr);

  if (parsedFrom.template === parsedTo.template && parsedFrom.values.length === parsedTo.values.length) {
    let needsCalc = false;
    for (let i = 0; i < parsedFrom.values.length; i++) {
      if (parsedFrom.units[i] !== parsedTo.units[i]) needsCalc = true;
    }

    return {
      type: 'clip-path',
      prop: 'clip-path',
      template: parsedTo.template,
      from: parsedFrom.values,
      fromUnits: parsedFrom.units,
      to: parsedTo.values,
      toUnits: parsedTo.units,
      needsCalc,
      originalToValue: String(toVal)
    };
  }

  // Fallback to snap if structural template mismatches (e.g., morphing circle to polygon failed)
  return { type: 'snap', prop: 'clip-path', from: fromStr, to: toStr };
}

/**
 * Interpolates clip-path values.
 */
export function interpolateClipPath(descriptor, t) {
  if (t >= 1) return descriptor.originalToValue;
  if (t <= 0) {
    // Reconstruct start state
    let j = 0;
    return descriptor.template.replace(/\{\}/g, () => descriptor.from[j] + descriptor.fromUnits[j++]);
  }

  let i = 0;
  return descriptor.template.replace(/\{\}/g, () => {
    const idx = i++;
    const fu = descriptor.fromUnits[idx];
    const tu = descriptor.toUnits[idx];
    const fv = descriptor.from[idx];
    const tv = descriptor.to[idx];

    if (fu === tu) {
      let v = lerp(fv, tv, t);
      v = Math.abs(v) < 0.00001 && v !== 0 ? 0 : Math.round(v * 10000) / 10000;
      return v + fu;
    } else {
      const tFormat = Number(t.toFixed(5));
      return `calc(${fv}${fu} + (${tv}${tu} - ${fv}${fu}) * ${tFormat})`;
    }
  });
}
