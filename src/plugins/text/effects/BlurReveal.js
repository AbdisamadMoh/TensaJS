import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Blur Reveal Effect
 * Splits text and animates from a blurred, transparent state.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function blurReveal(target, config = {}) {
  const type = config.type || 'words';
  const split = TextSlicer.split(target, { type });
  const elements = type === 'chars' ? split.chars : (type === 'lines' ? split.lines : split.words);
  
  if (!elements || elements.length === 0) {
    return new Timeline(); // return empty timeline if nothing to animate
  }

  // 1. Initial State (Zero-setup styling)
  Tween.apply(elements, { 
    filter: `blur(${config.blur || 20}px)`, 
    opacity: 0,
    y: config.y || 0
  });

  // Extract specific config properties (alias type to avoid redeclaration error)
  const { onElementStart, revertOnComplete, type: _type, blur, ...tweenProps } = config;

  // 2. Build Timeline
  const tl = new Timeline();
  
  tl.animate(elements, {
    filter: 'blur(0px)',
    opacity: 1,
    y: 0,
    duration: 1,
    ease: 'cubic.out',
    stagger: 0.05,
    ...tweenProps // Spread remaining standard Tensa properties (yoyo, repeat, etc)
  });

  // 3. Optional Granular Events
  if (config.onElementStart) {
    elements.forEach((el, i) => {
      // Absolute time from timeline start, matching each element's own stagger delay
      tl.add(() => config.onElementStart(el, i), (config.stagger ?? 0.05) * i);
    });
  }

  // 4. Cleanup on complete if requested
  if (config.revertOnComplete) {
    const originalComplete = tl.onComplete;
    tl.onComplete = () => {
      split.revert();
      if (originalComplete) originalComplete();
    };
  }

  return tl;
}
