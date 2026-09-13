/**
 * Tensa Typewriter Plugin
 * 
 * Animates the textContent of an element to create a typewriter effect.
 * Handles DOM text replacement cleanly during the interpolation loop.
 */

import { registerPropertyPlugin } from '../../core/CSSPlugin.js';

export const TypewriterPlugin = {
  name: 'typewriter',

  prepare(target, prop, fromVal, toVal) {
    if (prop !== 'typewriter') return null;
    // If a previous typewriter tween left a cursor wrapper, read only the
    // text node to avoid including the cursor character in the from-value.
    const originalText = target._tensajsTypeText?.nodeValue ?? target.textContent ?? "";
    let fromText = typeof fromVal !== 'undefined' && fromVal !== null ? String(fromVal) : originalText;
    let toText = String(toVal);
    let cursor = "";
    let cursorClass = "";
    let cursorStyle = "";
    let blinkWhileTyping = true;
    let cursorBlink = true;
    let delimiter = "";

    // Support object config e.g. { typewriter: { value: "...", delimiter: " ", cursor: "|" } }
    if (typeof toVal === 'object' && toVal !== null) {
      toText = String(toVal.value || "");
      if (toVal.delimiter !== undefined) {
        delimiter = String(toVal.delimiter);
      }
      if (toVal.cursor) {
        cursor = typeof toVal.cursor === 'string' ? toVal.cursor : '|';
        cursorClass = 'tensajs-cursor';
        
        const speed = toVal.cursorSpeed || 1;
        const ease = toVal.cursorEase || 'step-end';
        cursorBlink = toVal.cursorBlink !== false;
        blinkWhileTyping = toVal.blinkWhileTyping !== false;
        
        cursorStyle = `--blink-speed: ${speed}s; --blink-ease: ${ease};`;
        if (!cursorBlink) {
          cursorStyle += ' animation: none; opacity: 1;';
        }
        
        _injectCursorStyles(target.ownerDocument);
      }
    }

    // Array.from safely splits emojis / surrogate pairs if delimiter is ""
    const fromParts = delimiter === "" ? Array.from(fromText) : fromText.split(delimiter);
    const toParts = delimiter === "" ? Array.from(toText) : toText.split(delimiter);

    return {
      type: 'plugin',
      prop: 'typewriter',
      fromParts,
      toParts,
      delimiter,
      cursor,
      cursorClass,
      cursorStyle,
      blinkWhileTyping,
      cursorBlink
    };
  },

  render(target, descriptor, t) {
    const { fromParts, toParts, delimiter, cursor, cursorClass, cursorStyle, blinkWhileTyping, cursorBlink } = descriptor;
    
    // Fast path for extremes
    if (t === 1) {
      _applyText(target, toParts.join(delimiter), cursor, cursorClass, cursorStyle, false, cursorBlink);
      return;
    }
    if (t === 0) {
      _applyText(target, fromParts.join(delimiter), cursor, cursorClass, cursorStyle, false, cursorBlink);
      return;
    }

    // Linearly interpolate the total length of the string
    const currentLen = Math.round(fromParts.length + (toParts.length - fromParts.length) * t);
    
    // Determine how many characters of the NEW string should be revealed
    const newCount = Math.round(toParts.length * t);
    
    const result = [];
    
    // 1. Add the revealed new characters
    for (let i = 0; i < newCount; i++) {
      if (toParts[i] !== undefined) {
        result.push(toParts[i]);
      }
    }
    
    // 2. Pad the remainder of the string with the old characters that haven't been overwritten yet
    const remainCount = currentLen - newCount;
    for (let i = 0; i < remainCount; i++) {
      if (fromParts[newCount + i] !== undefined) {
        result.push(fromParts[newCount + i]);
      }
    }
    
    _applyText(target, result.join(delimiter), cursor, cursorClass, cursorStyle, !blinkWhileTyping, cursorBlink);
  }
};

registerPropertyPlugin('typewriter', TypewriterPlugin);

function _applyText(target, text, cursor, cursorClass, cursorStyle, isTypingSolid, cursorBlink) {
  if (!cursor) {
    target.textContent = text;
    return;
  }

  // Use an inline wrapper to prevent flexbox from splitting text and cursor into separate flex items
  let wrapper = target._tensajsTypeWrap;
  let textNode = target._tensajsTypeText;

  if (!wrapper || wrapper.parentNode !== target) {
    target.textContent = '';
    wrapper = target.ownerDocument.createElement('span');
    wrapper.style.display = 'inline';
    
    textNode = target.ownerDocument.createTextNode(text);
    wrapper.appendChild(textNode);
    
    const cursorEl = target.ownerDocument.createElement('span');
    cursorEl.className = cursorClass;
    cursorEl.textContent = cursor;
    
    // Set custom styles and animation overrides
    cursorEl.style.cssText = cursorStyle;
    if (isTypingSolid && cursorBlink) {
      cursorEl.style.animation = 'none';
      cursorEl.style.opacity = '1';
    }
    
    wrapper.appendChild(cursorEl);
    
    target.appendChild(wrapper);
    
    target._tensajsTypeWrap = wrapper;
    target._tensajsTypeText = textNode;
    target._tensajsTypeCursor = cursorEl;
  } else {
    textNode.nodeValue = text;
    
    // Update typing state for cursor blinking
    const cursorEl = target._tensajsTypeCursor;
    if (cursorEl) {
      cursorEl.style.cssText = cursorStyle;
      if (isTypingSolid && cursorBlink) {
        cursorEl.style.animation = 'none';
        cursorEl.style.opacity = '1';
      }
    }
  }
}

const cursorStyleInjectedDocs = new WeakSet();
function _injectCursorStyles(doc) {
  if (!doc || cursorStyleInjectedDocs.has(doc)) return;
  cursorStyleInjectedDocs.add(doc);
  const style = doc.createElement('style');
  style.textContent = `
    .tensajs-cursor {
      display: inline;
      font-weight: inherit;
      color: inherit;
      animation: tensajs-blink var(--blink-speed, 1s) var(--blink-ease, step-end) infinite;
    }
    @keyframes tensajs-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `;
  doc.head.appendChild(style);
}
