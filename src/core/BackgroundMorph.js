import { parseBackground } from './BackgroundParser.js';
import { parseGradient, buildGradient, parseComplexString, buildComplexString, lerp, parseValue } from './UnitParser.js';
import { parseColor, isColor } from './ColorParser.js';
import { getOwnerDocument, getOwnerWindow, getMeasurementHost } from './TargetResolver.js';

// Convert keyword aliases to percentages
function normalizePosition(p) {
  if (!p) return null;
  const l = p.toLowerCase();
  if (l === 'center') return '50%';
  if (l === 'top' || l === 'left') return '0%';
  if (l === 'bottom' || l === 'right') return '100%';
  return p;
}

function getBrowserNormalized(prop, valStr, target) {
  let outStr = valStr;
  const doc = getOwnerDocument(target);
  if (doc) {
    const dummy = doc.createElement('div');
    const host = getMeasurementHost(target);
    if (host) {
      dummy.style.display = 'none';
      host.appendChild(dummy);
      dummy.style[prop] = valStr;
      const computed = getOwnerWindow(target).getComputedStyle(dummy)[prop];
      if (computed) outStr = computed;
      host.removeChild(dummy);
    }
  }
  return outStr;
}

function processLayerAST(ast, prop, target) {
  const image = ast.image;
  const isGradient = image && image.includes('-gradient(');
  const parsedG = isGradient ? parseGradient(image) : null;
  if (parsedG && parsedG.prefix) {
    parsedG.parsedPrefix = parseComplexString(parsedG.prefix, target, prop);
  }
  
  // Complex string template for positions to parse units
  const posStr = ast.position.map(normalizePosition).join(' ');
  const sizeStr = ast.size.map(normalizePosition).join(' ');
  
  const parsedPos = posStr ? parseComplexString(posStr, target, prop) : null;
  const parsedSize = sizeStr ? parseComplexString(sizeStr, target, prop) : null;
  
  const parsedColor = ast.color ? parseColor(ast.color) : null;
  
  return { 
    ast, 
    isGradient, 
    parsedG, 
    parsedPos, 
    parsedSize, 
    parsedColor 
  };
}

export function prepareBackground(prop, toVal, fromVal, target) {
  let toStr = String(toVal);
  let fromStr = fromVal != null ? String(fromVal) : getOwnerWindow(target).getComputedStyle(target)[prop];

  toStr = getBrowserNormalized(prop, toStr, target);
  fromStr = getBrowserNormalized(prop, fromStr, target);

  const toAST = parseBackground(toStr);
  const fromAST = parseBackground(fromStr);

  const toMeta = toAST.map(ast => processLayerAST(ast, prop, target));
  const fromMeta = fromAST.map(ast => processLayerAST(ast, prop, target));

  const layerDescriptors = [];
  const matchedFromIndices = new Set();

  for (let i = 0; i < toMeta.length; i++) {
    const toL = toMeta[i];
    let matchIdx = -1;

    // 1. Exact structural match (gradient vs gradient, image vs image)
    for (let j = 0; j < fromMeta.length; j++) {
      if (matchedFromIndices.has(j)) continue;
      const fromL = fromMeta[j];
      
      if (toL.parsedG && fromL.parsedG && toL.parsedG.type === fromL.parsedG.type) {
        matchIdx = j;
        break;
      } else if (!toL.parsedG && !fromL.parsedG && toL.ast.image === fromL.ast.image) {
        matchIdx = j;
        break;
      }
    }

    // 2. Fallback (any unmatched layer to any unmatched layer)
    if (matchIdx === -1) {
      for (let j = 0; j < fromMeta.length; j++) {
        if (matchedFromIndices.has(j)) continue;
        matchIdx = j;
        break;
      }
    }

    let fromL = null;
    if (matchIdx !== -1) {
      matchedFromIndices.add(matchIdx);
      fromL = fromMeta[matchIdx];
    }

    layerDescriptors.push({
      toL,
      fromL
    });
  }

  // Preserve unmatched from layers so they don't instantly snap out
  const unmatchedFromLayers = [];
  for (let j = 0; j < fromMeta.length; j++) {
    if (!matchedFromIndices.has(j)) {
      unmatchedFromLayers.push(fromMeta[j].ast);
    }
  }

  return {
    type: 'background-layers',
    prop,
    layers: layerDescriptors,
    originalToValue: String(toVal),
    unmatchedFrom: unmatchedFromLayers
  };
}

function stringifyASTLayer(ast) {
  let parts = [];
  if (ast.image) parts.push(ast.image);
  
  if (ast.position.length > 0) {
    let ps = ast.position.join(' ');
    if (ast.size.length > 0) {
      ps += ' / ' + ast.size.join(' ');
    }
    parts.push(ps);
  }
  
  if (ast.repeat.length > 0) parts.push(ast.repeat.join(' '));
  if (ast.attachment) parts.push(ast.attachment);
  if (ast.origin) parts.push(ast.origin);
  if (ast.clip) parts.push(ast.clip);
  if (ast.color) parts.push(ast.color);
  if (ast.unclassified.length > 0) parts.push(ast.unclassified.join(' '));

  return parts.join(' ');
}

function interpolateMixedArray(fromArr, toArr, t, type) {
  if (!fromArr || !toArr) return null;
  
  let fA = [...fromArr];
  let tA = [...toArr];
  
  if (fA.length !== tA.length) {
    if (type === 'position') {
      if (fA.length === 1 && tA.length === 2) fA.push('50%');
      else if (tA.length === 1 && fA.length === 2) tA.push('50%');
      else return null;
    } else if (type === 'size') {
      if (fA.length === 1 && tA.length === 2) fA.push('auto');
      else if (tA.length === 1 && fA.length === 2) tA.push('auto');
      else return null;
    } else {
      return null;
    }
  }

  const out = [];
  for (let i = 0; i < fA.length; i++) {
    const fStr = normalizePosition(fA[i]);
    const tStr = normalizePosition(tA[i]);
    
    if (fStr === tStr) {
      out.push(fStr);
      continue;
    }
    
    const fVal = parseValue(fStr);
    const tVal = parseValue(tStr);
    
    // If we can't parse both (e.g keywords that aren't normalized like 'auto'), return null to trigger snap
    if (!fVal || !tVal || fVal.value === 'auto' || tVal.value === 'auto') {
      return null;
    }
    
    if (fVal.unit === tVal.unit) {
      out.push(`${lerp(fVal.value, tVal.value, t)}${fVal.unit}`);
    } else {
      // mixed units: delegate to calc() so the browser resolves layout constraints
      // e.g calc(0px + (50% - 0px) * 0.5)
      // format to 5 decimal places
      const tFormat = Number(t.toFixed(5));
      out.push(`calc(${fStr} + (${tStr} - ${fStr}) * ${tFormat})`);
    }
  }
  return out.join(' ');
}

export function applyBackground(target, prop, descriptor, t) {
  if (t >= 1) {
    target.style[prop] = descriptor.originalToValue;
    return;
  }

  const outLayers = [];

  for (const { toL, fromL } of descriptor.layers) {
    if (!fromL) {
      // Just fade in or snap if it's new
      outLayers.push(stringifyASTLayer(toL.ast));
      continue;
    }

    // Clone TO AST so we can dynamically mutate properties for the current frame
    const liveAST = JSON.parse(JSON.stringify(toL.ast));

    // Morph Image / Gradient
    if (toL.parsedG) {
      let fromG = fromL.parsedG;
      if (!fromG) {
        // Cross-fade hack: Morph from transparent
        fromG = { ...toL.parsedG, stops: toL.parsedG.stops.map(s => ({ ...s, a: 0 })) };
      } else {
        // Pad stops if mismatched
        fromG = JSON.parse(JSON.stringify(fromL.parsedG));
        while (fromG.stops.length < toL.parsedG.stops.length) {
          fromG.stops.push({ ...fromG.stops[fromG.stops.length - 1] });
        }
        while (toL.parsedG.stops.length < fromG.stops.length) {
          // Can't mutate toL permanently here, so just stop
          break; 
        }
      }

      let livePrefix = toL.parsedG.prefix;
      if (fromG.parsedPrefix && toL.parsedG.parsedPrefix && fromG.parsedPrefix.template === toL.parsedG.parsedPrefix.template) {
        const liveVals = [];
        for (let k = 0; k < fromG.parsedPrefix.values.length; k++) {
          liveVals.push(lerp(fromG.parsedPrefix.values[k], toL.parsedG.parsedPrefix.values[k], t));
        }
        livePrefix = buildComplexString(toL.parsedG.parsedPrefix.template, liveVals);
      } else if (fromG.prefix !== toL.parsedG.prefix) {
        const mixed = interpolateMixedArray([fromG.prefix], [toL.parsedG.prefix], t, 'gradient-prefix');
        livePrefix = mixed ? mixed : (t < 0.5 ? fromG.prefix : toL.parsedG.prefix);
      }

      const liveG = { type: toL.parsedG.type, prefix: livePrefix, suffix: toL.parsedG.suffix, stops: [] };
      const minLen = Math.min(fromG.stops.length, toL.parsedG.stops.length);

      for (let i = 0; i < minLen; i++) {
        const fs = fromG.stops[i];
        const ts = toL.parsedG.stops[i];
        
        let posRaw = ts.posRaw;
        if (fs.posParsed && ts.posParsed && fs.posParsed.unit === ts.posParsed.unit) {
          posRaw = `${lerp(fs.posParsed.value, ts.posParsed.value, t)}${fs.posParsed.unit}`;
        }

        liveG.stops.push({
          r: lerp(fs.r, ts.r, t),
          g: lerp(fs.g, ts.g, t),
          b: lerp(fs.b, ts.b, t),
          a: lerp(fs.a, ts.a, t),
          posRaw
        });
      }
      liveAST.image = buildGradient(liveG);
    } else {
      const isFromNone = !fromL.ast.image || fromL.ast.image === 'none';
      const isToNone = !toL.ast.image || toL.ast.image === 'none';
      
      if (isFromNone && !isToNone) liveAST.image = toL.ast.image;
      else if (isToNone && !isFromNone) liveAST.image = fromL.ast.image;
      else liveAST.image = t < 0.5 ? fromL.ast.image : toL.ast.image;
    }

    // Morph Position
    if (toL.parsedPos && fromL.parsedPos && toL.parsedPos.template === fromL.parsedPos.template) {
      const interpolated = [];
      for (let i = 0; i < fromL.parsedPos.values.length; i++) {
        interpolated.push(lerp(fromL.parsedPos.values[i], toL.parsedPos.values[i], t));
      }
      liveAST.position = [buildComplexString(toL.parsedPos.template, interpolated)];
    } else {
      // Templates don't match (e.g. 0px vs 50%), try component-wise calc()
      const mixed = interpolateMixedArray(fromL.ast.position, toL.ast.position, t, 'position');
      liveAST.position = mixed ? [mixed] : (t < 0.5 ? fromL.ast.position : toL.ast.position);
    }

    // Morph Size
    if (toL.parsedSize && fromL.parsedSize && toL.parsedSize.template === fromL.parsedSize.template) {
      const interpolated = [];
      for (let i = 0; i < fromL.parsedSize.values.length; i++) {
        interpolated.push(lerp(fromL.parsedSize.values[i], toL.parsedSize.values[i], t));
      }
      liveAST.size = [buildComplexString(toL.parsedSize.template, interpolated)];
    } else {
      // Templates don't match, try component-wise calc()
      const mixed = interpolateMixedArray(fromL.ast.size, toL.ast.size, t, 'size');
      liveAST.size = mixed ? [mixed] : (t < 0.5 ? fromL.ast.size : toL.ast.size);
    }

    // Morph Color
    if (toL.parsedColor && fromL.parsedColor) {
      const c = {
        r: Math.round(lerp(fromL.parsedColor[0], toL.parsedColor[0], t)),
        g: Math.round(lerp(fromL.parsedColor[1], toL.parsedColor[1], t)),
        b: Math.round(lerp(fromL.parsedColor[2], toL.parsedColor[2], t)),
        a: lerp(fromL.parsedColor[3], toL.parsedColor[3], t)
      };
      liveAST.color = `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
    } else {
      liveAST.color = t < 0.5 ? fromL.ast.color : toL.ast.color;
    }

    // Snap the rest
    liveAST.repeat = t < 0.5 ? fromL.ast.repeat : toL.ast.repeat;
    liveAST.attachment = t < 0.5 ? fromL.ast.attachment : toL.ast.attachment;
    liveAST.origin = t < 0.5 ? fromL.ast.origin : toL.ast.origin;
    liveAST.clip = t < 0.5 ? fromL.ast.clip : toL.ast.clip;

    outLayers.push(stringifyASTLayer(liveAST));
  }

  // Append unmatched from layers
  for (const ast of descriptor.unmatchedFrom) {
    outLayers.push(stringifyASTLayer(ast));
  }

  target.style[prop] = outLayers.join(', ');
}
