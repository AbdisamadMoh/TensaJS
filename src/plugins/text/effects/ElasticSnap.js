import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Elastic Snap Effect
 * Stretches characters and snaps them back using an elastic ease.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function elasticSnap(target, config = {}) {
  const split = TextSlicer.split(target, { type: 'chars' });
  
  if (!split.chars || split.chars.length === 0) {
    return new Timeline();
  }

  // 1. Initial State
  Tween.apply(split.chars, { 
    scaleX: config.stretchX || 0.5,
    scaleY: config.stretchY || 1.5,
    opacity: 0,
    y: config.y || 20
  });

  // Extract specific config properties
  const { onCharStart, revertOnComplete, stretchX, stretchY, ...tweenProps } = config;

  // 2. Build Timeline
  const tl = new Timeline();
  
  tl.animate(split.chars, {
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    y: 0,
    duration: 1,
    ease: 'elastic.out(1, 0.4)',
    stagger: 0.03,
    ...tweenProps
  });

  // 3. Optional Granular Events
  if (config.onCharStart) {
    split.chars.forEach((el, i) => {
      // Absolute time from timeline start, matching each element's own stagger delay
      tl.add(() => config.onCharStart(el, i), (config.stagger ?? 0.03) * i);
    });
  }

  // 4. Cleanup on complete
  if (config.revertOnComplete) {
    const originalComplete = tl.onComplete;
    tl.onComplete = () => {
      split.revert();
      if (originalComplete) originalComplete();
    };
  }

  return tl;
}
