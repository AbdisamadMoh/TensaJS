import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Squeeze and Pop Effect
 * Spans drop from above, squash on hitting the ground, bounce upward stretched, then settle.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function squeezeAndPop(target, config = {}) {
  const {
    type = 'chars',
    yOffset = -100,
    squashY = 0.5,
    squashX = 1.3,
    stretchY = 1.2,
    stretchX = 0.8,
    bounceHeight = -15,
    fade = true,
    stagger: staggerVal = 0.06,
    revertOnComplete = false,
    ...timelineConfig
  } = config;

  const split = TextSlicer.split(target, { type });
  const elements = type === 'chars' ? split.chars : (type === 'lines' ? split.lines : split.words);

  if (!elements || elements.length === 0) {
    return new Timeline();
  }

  // 1. Initial State (Positioned up high, invisible)
  Tween.apply(elements, {
    y: yOffset,
    opacity: fade ? 0 : 1,
    scaleX: 1,
    scaleY: 1
  });

  // 2. Build Timeline
  const tl = new Timeline(timelineConfig);

  elements.forEach((el, index) => {
    const delay = index * staggerVal;

    // A. Drop Down
    tl.animate(el, {
      y: 0,
      opacity: 1,
      duration: 0.3,
      ease: 'cubic.in'
    }, delay);

    // B. Squash on impact
    tl.animate(el, {
      scaleY: squashY,
      scaleX: squashX,
      y: 4, // ground offset
      duration: 0.12,
      ease: 'quad.out'
    }, '+=0');

    // C. Stretch/Bounce Up
    tl.animate(el, {
      scaleY: stretchY,
      scaleX: stretchX,
      y: bounceHeight,
      duration: 0.18,
      ease: 'cubic.out'
    }, '+=0');

    // D. Settle back to normal
    tl.animate(el, {
      scaleY: 1,
      scaleX: 1,
      y: 0,
      duration: 0.25,
      ease: 'bounce.out'
    }, '+=0');
  });

  // 3. Cleanup on complete
  if (revertOnComplete) {
    const originalComplete = tl.onComplete;
    tl.onComplete = () => {
      split.revert();
      if (originalComplete) originalComplete();
    };
  }

  return tl;
}
