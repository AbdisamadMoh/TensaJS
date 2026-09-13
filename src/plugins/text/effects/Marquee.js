import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Kinetic Marquee Effect (Infinite Scroll)
 * Duplicates element contents and sets up a seamless horizontal looping translate.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function marquee(target, config = {}) {
  const elements = typeof target === 'string' ? document.querySelectorAll(target) : (target.length !== undefined ? target : [target]);
  
  if (!elements || elements.length === 0) {
    return new Timeline();
  }

  const tl = new Timeline();
  const speed = config.speed || 50; // pixels per second
  const direction = config.direction || 'left'; // left or right

  elements.forEach(el => {
    // 1. Prepare DOM
    const contentHtml = el.innerHTML;
    el.innerHTML = '';
    
    el.style.overflow = 'hidden';
    el.style.whiteSpace = 'nowrap';
    
    const wrapper = el.ownerDocument.createElement('div');
    wrapper.style.display = 'inline-flex';
    wrapper.style.whiteSpace = 'nowrap';
    wrapper.style.width = 'max-content';
    
    const clone1 = el.ownerDocument.createElement('div');
    clone1.style.display = 'inline-block';
    clone1.innerHTML = contentHtml;

    const clone2 = el.ownerDocument.createElement('div');
    clone2.style.display = 'inline-block';
    clone2.innerHTML = contentHtml;

    wrapper.appendChild(clone1);
    wrapper.appendChild(clone2);
    el.appendChild(wrapper);

    // 2. Measure and Set Initial State
    // Request layout measurement (best effort synchronously or with layout width)
    const cloneWidth = clone1.offsetWidth || el.offsetWidth || 400;
    const dur = config.duration || (cloneWidth / speed);

    const startX = direction === 'right' ? -cloneWidth : 0;
    const endX = direction === 'right' ? 0 : -cloneWidth;

    Tween.apply(wrapper, { x: startX });

    // Extract custom settings
    const { speed: _s, direction: _d, duration: _dur, ...tweenProps } = config;

    // 3. Loop translation
    tl.animate(wrapper, {
      x: endX,
      duration: dur,
      ease: 'none',
      repeat: -1,
      ...tweenProps
    }, 0);
  });

  return tl;
}
