import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';
import { getOwnerWindow } from '../../../core/TargetResolver.js';

/**
 * Unfold / Origami Effect
 * Splits text into lines and folds them down.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function unfold(target, config = {}) {
  const split = TextSlicer.split(target, { type: 'lines' });
 
  if (!split.lines || split.lines.length === 0) {
    return new Timeline();
  }

  // 1. Initial State (Requires perspective on parent and transform-origin on lines)
  const elements = split.elements; // original parents
  elements.forEach(el => {
    // Inject perspective if it doesn't exist
    if (getOwnerWindow(el).getComputedStyle(el).perspective === 'none') {
      el.style.perspective = '1000px';
    }
  });

  Tween.apply(split.lines, { 
    transformOrigin: config.transformOrigin || 'top center',
    rotateX: config.rotateX || 90,
    opacity: config.fade !== false ? 0 : 1
  });

  // Extract specific config properties
  const { onLineStart, revertOnComplete, transformOrigin, rotateX, fade, ...tweenProps } = config;

  // 2. Build Timeline
  const tl = new Timeline();
  
  tl.animate(split.lines, {
    rotateX: 0,
    opacity: 1,
    duration: 1,
    ease: 'quart.out',
    stagger: 0.1,
    ...tweenProps
  });

  // 3. Optional Granular Events
  if (config.onLineStart) {
    split.lines.forEach((el, i) => {
      // Absolute time from timeline start, matching each element's own stagger delay
      tl.add(() => config.onLineStart(el, i), (config.stagger ?? 0.1) * i);
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
