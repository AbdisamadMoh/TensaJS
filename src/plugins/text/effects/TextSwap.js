import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Morphing Text Effect (Character Swapping)
 * Transitions text contents by sliding mismatched old characters out and new ones in.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function textSwap(target, config = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) {
    return new Timeline();
  }

  // Read the element's intended text state (avoiding polluted DOM from previous un-reverted swaps)
  const oldText = el._tensajsTextSwapState || el.textContent || '';
  const {
    text: newTextOpt = '',
    duration = 0.6,
    stagger: staggerVal = 0.04,
    ease: easeVal = 'cubic.inOut',
    revertOnComplete = false,
    ...timelineConfig
  } = config;
  const newText = newTextOpt;
  
  // Store the target string state for subsequent swaps
  el._tensajsTextSwapState = newText;
  
  // Cache the original inline display style if it hasn't been cached yet
  if (el._tensajsOriginalDisplay === undefined) {
    el._tensajsOriginalDisplay = el.style.display;
  }

  // 1. Prepare DOM
  el.innerHTML = '';
  el.style.display = 'inline-flex';
  
  const oldChars = oldText.split('');
  const newChars = newText.split('');
  const maxLen = Math.max(oldChars.length, newChars.length);
  
  const tl = new Timeline(timelineConfig);

  const items = [];

  for (let i = 0; i < maxLen; i++) {
    const charSpan = el.ownerDocument.createElement('span');
    charSpan.style.display = 'inline-block';
    charSpan.style.position = 'relative';
    charSpan.style.overflow = 'hidden';
    
    const oldC = oldChars[i] || ' ';
    const newC = newChars[i] || ' ';
    
    const oldNode = el.ownerDocument.createElement('span');
    oldNode.textContent = oldC === ' ' ? '\u00A0' : oldC;
    oldNode.style.display = 'inline-block';
    
    const newNode = el.ownerDocument.createElement('span');
    newNode.textContent = newC === ' ' ? '\u00A0' : newC;
    newNode.style.display = 'inline-block';
    newNode.style.position = 'absolute';
    newNode.style.left = '0';
    newNode.style.top = '0';
    newNode.style.opacity = '0';

    charSpan.appendChild(oldNode);
    charSpan.appendChild(newNode);
    el.appendChild(charSpan);

    items.push({ charSpan, oldNode, newNode, oldC, newC });
  }

  // Force synchronous layout to measure character dimensions accurately
  items.forEach(item => {
    const charHeight = Math.max(item.oldNode.offsetHeight, item.newNode.offsetHeight) || 20;
    const charWidth = Math.max(item.oldNode.offsetWidth, item.newNode.offsetWidth) || 12;

    item.charSpan.style.width = `${charWidth}px`;
    item.charSpan.style.height = `${charHeight}px`;

    // Position new character below its slot initially
    Tween.apply(item.newNode, { y: charHeight });
  });

  // 2. Build Timeline sequence
  items.forEach((item, i) => {
    const delay = i * staggerVal;
    const charHeight = item.charSpan.offsetHeight || 20;

    if (item.oldC !== item.newC) {
      // Slide old character up and out
      tl.animate(item.oldNode, {
        y: -charHeight,
        opacity: 0,
        duration: duration,
        ease: easeVal
      }, delay);

      // Slide new character up and in
      tl.animate(item.newNode, {
        y: 0,
        opacity: 1,
        duration: duration,
        ease: easeVal
      }, delay);
    } else {
      // If characters are identical, show the target character instantly
      Tween.apply(item.newNode, {
        y: 0,
        opacity: 1
      });
      item.oldNode.style.display = 'none';
    }
  });

  // 3. Optional cleanup on completion
  const originalComplete = tl.onComplete;
  tl.onComplete = () => {
    if (revertOnComplete) {
      el.innerHTML = '';
      el.textContent = newText;
      el.style.display = el._tensajsOriginalDisplay !== undefined ? el._tensajsOriginalDisplay : '';
      delete el._tensajsOriginalDisplay;
      delete el._tensajsTextSwapState;
    }
    if (originalComplete) originalComplete();
  };

  return tl;
}
