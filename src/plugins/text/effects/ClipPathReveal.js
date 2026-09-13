import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Clip-Path Mask Reveal Effect
 * Reveals text units by animating CSS inset clip-paths.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function clipPathReveal(target, config = {}) {
  const type = config.type || 'words';
  const split = TextSlicer.split(target, { type });
  const elements = type === 'chars' ? split.chars : (type === 'lines' ? split.lines : split.words);

  if (!elements || elements.length === 0) {
    return new Timeline();
  }

  const direction = config.direction || 'right'; // right, left, down, up, center

  // Get initial/final clip-path strings
  let fromClip, toClip;
  if (direction === 'right') {
    fromClip = 'inset(0% 100% 0% 0%)';
    toClip = 'inset(0% 0% 0% 0%)';
  } else if (direction === 'left') {
    fromClip = 'inset(0% 0% 0% 100%)';
    toClip = 'inset(0% 0% 0% 0%)';
  } else if (direction === 'down') {
    fromClip = 'inset(0% 0% 100% 0%)';
    toClip = 'inset(0% 0% 0% 0%)';
  } else if (direction === 'up') {
    fromClip = 'inset(100% 0% 0% 0%)';
    toClip = 'inset(0% 0% 0% 0%)';
  } else { // center
    fromClip = 'inset(50% 50% 50% 50%)';
    toClip = 'inset(0% 0% 0% 0%)';
  }

  // 1. Initial State
  Tween.apply(elements, {
    clipPath: fromClip,
    opacity: config.fade !== false ? 0 : 1
  });

  // Extract custom parameters
  const { 
    type: _type, direction: _d, fade, revertOnComplete, onElementStart, ...tweenProps 
  } = config;

  // 2. Build Timeline
  const tl = new Timeline();

  tl.animate(elements, {
    clipPath: toClip,
    opacity: 1,
    duration: config.duration || 1,
    ease: config.ease || 'cubic.out',
    stagger: config.stagger !== undefined ? config.stagger : 0.08,
    ...tweenProps
  });

  // 3. Optional Granular Events
  if (config.onElementStart) {
    const staggerVal = config.stagger !== undefined ? config.stagger : 0.08;
    elements.forEach((el, i) => {
      // Absolute time from timeline start, matching each element's own stagger delay
      tl.add(() => config.onElementStart(el, i), staggerVal * i);
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
