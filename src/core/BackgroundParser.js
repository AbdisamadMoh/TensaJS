
/**
 * Tokenizes a CSS string safely, respecting parentheses and quotes.
 * Splits by whitespace or commas only when not inside a function or string.
 * @param {string} str 
 * @returns {Array<string>} The list of tokens. Commas are returned as distinct tokens.
 */
export function tokenize(str) {
  if (!str) return [];
  
  const tokens = [];
  let currentToken = '';
  
  let depth = 0;
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    // String toggles
    if ((char === '"' || char === "'") && (i === 0 || str[i-1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (stringChar === char) {
        inString = false;
        stringChar = '';
      }
    }
    
    // Depth tracking (only outside strings)
    if (!inString) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
    }
    
    // Splitting logic
    if (depth === 0 && !inString) {
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        if (currentToken.trim().length > 0) {
          tokens.push(currentToken.trim());
          currentToken = '';
        }
        continue;
      } else if (char === ',') {
        if (currentToken.trim().length > 0) {
          tokens.push(currentToken.trim());
        }
        tokens.push(',');
        currentToken = '';
        continue;
      } else if (char === '/') {
        if (currentToken.trim().length > 0) {
          tokens.push(currentToken.trim());
        }
        tokens.push('/');
        currentToken = '';
        continue;
      }
    }
    
    currentToken += char;
  }
  
  if (currentToken.trim().length > 0) {
    tokens.push(currentToken.trim());
  }
  
  return tokens;
}

/**
 * Groups flat tokens into background layers separated by top-level commas.
 */
export function splitLayers(tokens) {
  const layers = [];
  let currentLayer = [];
  
  for (const token of tokens) {
    if (token === ',') {
      layers.push(currentLayer);
      currentLayer = [];
    } else {
      currentLayer.push(token);
    }
  }
  
  if (currentLayer.length > 0) {
    layers.push(currentLayer);
  }
  
  return layers;
}

/**
 * Parses a single background layer's tokens into its constituent semantic parts.
 */
export function parseLayer(layerTokens) {
  const layer = {
    image: null,
    position: [],
    size: [],
    repeat: [],
    attachment: null,
    origin: null,
    clip: null,
    color: null,
    unclassified: [] // For math/numbers/misc
  };

  let parsingSize = false;

  for (let i = 0; i < layerTokens.length; i++) {
    const token = layerTokens[i];
    const lower = token.toLowerCase();

    // 1. Functions (Images/Gradients/Paints/Cross-fades)
    if (
      lower.startsWith('url(') || 
      lower.includes('-gradient(') || 
      lower.startsWith('cross-fade(') || 
      lower.startsWith('image-set(') || 
      lower.startsWith('paint(')
    ) {
      layer.image = token;
      continue;
    }

    // 2. Global Keywords
    if (lower === 'none' && !layer.image) {
      layer.image = 'none';
      continue;
    }

    // 3. Slash marker for Size
    if (token === '/') {
      parsingSize = true;
      continue;
    }
    
    if (token.startsWith('/')) {
      parsingSize = true;
      const remainder = token.substring(1);
      if (remainder) layerTokens.splice(i + 1, 0, remainder);
      continue;
    }

    // 4. Repeat
    if (['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round'].includes(lower)) {
      layer.repeat.push(token);
      continue;
    }

    // 5. Attachment
    if (['scroll', 'fixed', 'local'].includes(lower)) {
      layer.attachment = token;
      continue;
    }

    // 6. Box models (Origin / Clip)
    if (lower.endsWith('-box')) {
      if (!layer.origin) layer.origin = token;
      else if (!layer.clip) layer.clip = token;
      continue;
    }

    // 7. Colors
    // If it's a hex, rgba, hsl, color keyword, var(), or currentColor, but NOT calc()
    if (
      lower.startsWith('#') || 
      lower.startsWith('rgb') || 
      lower.startsWith('hsl') || 
      lower.startsWith('var(') ||
      lower === 'transparent' || 
      lower === 'currentcolor' ||
      // Cheap fallback for named colors: just assume if it has no numbers/functions it might be a color
      (!lower.includes('(') && !/[0-9]/.test(lower) && ['top','bottom','left','right','center','auto','cover','contain'].indexOf(lower) === -1)
    ) {
      // It's likely the color (usually only valid on the last layer, but we just parse it)
      layer.color = token;
      continue;
    }

    // 8. Positioning and Size Keywords/Numbers
    if (parsingSize) {
      layer.size.push(token);
    } else {
      // Center, top, left, calc(), 10px, 50%
      layer.position.push(token);
    }
  }

  return layer;
}

/**
 * Main entry point: takes a raw CSS string and returns an array of parsed layer objects.
 */
export function parseBackground(str) {
  const tokens = tokenize(str);
  const layerTokenGroups = splitLayers(tokens);
  return layerTokenGroups.map(parseLayer);
}
