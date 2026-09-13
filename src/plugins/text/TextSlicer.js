
import { isElementLike, isNodeListLike } from '../../core/TargetResolver.js';

export class TextSlicer {
  /**
   * @param {string|Element|NodeList} target
   * @param {Object} [config]
   * @param {string|string[]} [config.type='chars,words'] - 'chars' | 'words' | 'lines' (comma-separated or array)
   * @param {string} [config.charsClass='ax-char']
   * @param {string} [config.wordsClass='ax-word']
   * @param {string} [config.linesClass='ax-line']
   * @param {boolean} [config.aria=true] - preserve accessibility with aria-label
   */
  constructor(target, config = {}) {
    this.config = {
      type:        config.type || 'chars,words',
      charsClass:  config.charsClass || 'ax-char',
      wordsClass:  config.wordsClass || 'ax-word',
      linesClass:  config.linesClass || 'ax-line',
      aria:        config.aria !== false,
    };

    // Parse type flags
    const types = Array.isArray(this.config.type)
      ? this.config.type
      : this.config.type.split(',').map(s => s.trim());

    this._doChars = types.includes('chars');
    this._doWords = types.includes('words');
    this._doLines = types.includes('lines');

    // Resolve elements
    this.elements = this._resolveElements(target);
    this._originals = new Map();

    // Result arrays
    this.chars  = [];
    this.words  = [];
    this.lines  = [];

    this._split();
  }

  _resolveElements(target) {
    if (typeof target === 'string') {
      return Array.from(document.querySelectorAll(target));
    }
    if (isElementLike(target)) return [target];
    if (isNodeListLike(target)) {
      return Array.from(target);
    }
    if (Array.isArray(target)) {
      return target.flatMap(t => this._resolveElements(t));
    }
    return [];
  }

  _split() {
    for (const el of this.elements) {
      // If it was already split by a previous instance, revert that instance first
      if (el._tensajsTextSlicer) {
        el._tensajsTextSlicer.revert();
      }

      // Store original HTML for revert
      this._originals.set(el, el.innerHTML);
      el._tensajsTextSlicer = this;

      // Add aria-label for accessibility
      if (this.config.aria && !el.getAttribute('aria-label')) {
        el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
        // Hide the split content from screen readers
        el.setAttribute('aria-hidden', 'true');
      }

      // Step 1: Walk the DOM and replace text nodes safely
      this._textSliceNodes(el);

      // Step 2: Line detection and wrapping
      if (this._doLines) {
        this._detectLines(el);
      }
    }
  }

  _textSliceNodes(el) {
    // Collect text nodes first to avoid mutating while walking
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    for (const textNode of textNodes) {
      // Skip empty or pure-whitespace nodes if they don't contribute to layout
      if (textNode.parentNode && textNode.nodeValue.trim() !== '') {
        this._processTextNode(textNode);
      }
    }
  }

  _processTextNode(textNode) {
    const text = textNode.nodeValue;
    const doc = textNode.ownerDocument;
    const fragment = doc.createDocumentFragment();

    // Split by words, preserving whitespace
    const parts = text.split(/(\s+)/);

    for (const part of parts) {
      if (!part) continue;

      if (/^\s+$/.test(part)) {
        // It's whitespace, just append as a text node so layout spacing is preserved
        fragment.appendChild(doc.createTextNode(part));
      } else {
        // It's a word
        let wordParent = fragment;
        let wordSpan = null;

        if (this._doWords || this._doLines) {
          // If we need words or lines, we must wrap in a word span
          wordSpan = doc.createElement('span');
          wordSpan.className = this.config.wordsClass;
          wordSpan.style.cssText = 'display:inline-block;white-space:nowrap;will-change:transform,opacity;backface-visibility:hidden;';
          this.words.push(wordSpan);
          wordParent = wordSpan;
          fragment.appendChild(wordSpan);
        }

        if (this._doChars) {
          // Split characters safely taking into account surrogate pairs (emoji)
          const chars = [...part];
          for (const char of chars) {
            const charSpan = doc.createElement('span');
            charSpan.className = this.config.charsClass;
            charSpan.style.cssText = 'display:inline-block;will-change:transform,opacity;backface-visibility:hidden;';
            charSpan.textContent = char;
            wordParent.appendChild(charSpan);
            this.chars.push(charSpan);
          }
        } else {
          wordParent.textContent = part;
        }
      }
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  _detectLines(el) {
    // We use words to detect lines. If words aren't requested, we fall back to chars.
    const elementsToGroup = (this._doWords || this._doLines) ? this.words : this.chars;
    if (!elementsToGroup.length) return;

    const lineMap = new Map();
    let lastTop = null;
    let lineIndex = 0;

    elementsToGroup.forEach(item => {
      const top = item.getBoundingClientRect().top;
      // Use 3px tolerance for sub-pixel rendering differences
      if (lastTop === null || Math.abs(top - lastTop) > 3) {
        lineIndex++;
        lastTop = top;
      }
      if (!lineMap.has(lineIndex)) lineMap.set(lineIndex, []);
      lineMap.get(lineIndex).push(item);
    });

    // Wrap each line in a span
    // Note: Grouping lines pulls elements out of their original nested DOM containers
    const lineSpans = [];
    lineMap.forEach((lineItems) => {
      const lineSpan = el.ownerDocument.createElement('span');
      lineSpan.className = this.config.linesClass;
      lineSpan.style.cssText = 'display:block;overflow:hidden;';

      const firstItem = lineItems[0];
      firstItem.parentNode.insertBefore(lineSpan, firstItem);

      lineItems.forEach((item, i) => {
        // Grab original whitespace to prevent layout shifts
        const next = item.nextSibling;
        let ws = null;
        if (next && next.nodeType === 3 && /^[\s\n]+$/.test(next.nodeValue)) {
          ws = next;
        }

        lineSpan.appendChild(item);
        
        if (ws) {
          lineSpan.appendChild(ws);
        } else if (i < lineItems.length - 1 && this._doWords) {
          lineSpan.appendChild(el.ownerDocument.createTextNode(' '));
        }
      });

      lineSpans.push(lineSpan);
    });

    // Clean up <br> tags to prevent double spacing since lines are now block elements
    el.querySelectorAll('br').forEach(br => br.style.display = 'none');

    this.lines = lineSpans;
  }

  /**
   * Restore original HTML and clean up all split elements.
   */
  revert() {
    for (const [el, originalHTML] of this._originals) {
      el.innerHTML = originalHTML;
      if (this.config.aria) {
        el.removeAttribute('aria-label');
        el.removeAttribute('aria-hidden');
      }
      delete el._tensajsTextSlicer;
    }
    this.chars  = [];
    this.words  = [];
    this.lines  = [];
    this._originals.clear();
    return this;
  }

  static split(target, config) {
    return new TextSlicer(target, config);
  }
}

export default TextSlicer;
