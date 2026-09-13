import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Slot Machine Reel Effect
 * Spins vertical columns of random letters before locking into target text characters.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function slotMachine(target, config = {}) {
  const split = TextSlicer.split(target, { type: 'chars' });
  
  if (!split.chars || split.chars.length === 0) {
    return new Timeline();
  }

  const reelLength = config.reelLength || 12;
  const pool = (config.charsPool || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ').split('');
  const tl = new Timeline();
  const staggerVal = config.stagger !== undefined ? config.stagger : 0.05;

  const wrappers = [];

  split.chars.forEach((charEl, charIdx) => {
    const targetChar = charEl.textContent;
    if (targetChar.trim() === '') return; // skip space

    // 1. Prepare vertical reel DOM
    const container = charEl.ownerDocument.createElement('span');
    container.style.display = 'inline-block';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.verticalAlign = 'bottom';
    
    const charWidth = charEl.offsetWidth || 12;
    const charHeight = charEl.offsetHeight || 20;

    container.style.width = `${charWidth}px`;
    container.style.height = `${charHeight}px`;

    const reel = charEl.ownerDocument.createElement('span');
    reel.style.display = 'inline-flex';
    reel.style.flexDirection = 'column';
    reel.style.position = 'absolute';
    reel.style.left = '0';
    reel.style.top = '0';
    
    // Populate reel: random chars followed by target char
    const reelChars = [];
    for (let i = 0; i < reelLength - 1; i++) {
      reelChars.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    reelChars.push(targetChar);

    reelChars.forEach((ch) => {
      const item = charEl.ownerDocument.createElement('span');
      item.textContent = ch;
      item.style.display = 'inline-block';
      item.style.width = `${charWidth}px`;
      item.style.height = `${charHeight}px`;
      item.style.lineHeight = `${charHeight}px`;
      item.style.textAlign = 'center';
      reel.appendChild(item);
    });

    // Replace original character node
    charEl.parentNode.replaceChild(container, charEl);
    container.appendChild(reel);
    wrappers.push({ container, original: charEl });

    const targetY = -(reelLength - 1) * charHeight;

    Tween.apply(reel, { y: 0 });

    const delay = charIdx * staggerVal;

    // Extract custom properties
    const { reelLength: _rl, charsPool: _cp, stagger: _st, revertOnComplete, ...tweenProps } = config;

    // 2. Spin animation
    tl.animate(reel, {
      y: targetY,
      duration: config.duration || 1.2,
      ease: config.ease || 'back.out(1.2)',
      ...tweenProps
    }, delay);
  });

  // 3. Optional cleanup on completion
  if (config.revertOnComplete) {
    const originalComplete = tl.onComplete;
    tl.onComplete = () => {
      wrappers.forEach(w => {
        if (w.container.parentNode) {
          w.container.parentNode.replaceChild(w.original, w.container);
        }
      });
      split.revert();
      if (originalComplete) originalComplete();
    };
  }

  return tl;
}
