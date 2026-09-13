import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';
import { getOwnerWindow } from '../../../core/TargetResolver.js';

/**
 * 3D Flip In Effect (Split-Flap Display)
 * Rotates characters/words along a 3D axis.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function flip3D(target, config = {}) {
  const type = config.type || 'chars';
  const split = TextSlicer.split(target, { type });
  const elements = type === 'chars' ? split.chars : (type === 'lines' ? split.lines : split.words);

  if (!elements || elements.length === 0) {
    return new Timeline();
  }

  // 1. Perspective on original parent element(s)
  const parents = split.elements;
  parents.forEach(parent => {
    if (getOwnerWindow(parent).getComputedStyle(parent).perspective === 'none') {
      parent.style.perspective = config.perspective || '1000px';
    }
  });

  // 2. Initial State (Rotation, opacity)
  const axis = config.axis || 'X'; // X or Y
  const startAngle = config.rotate !== undefined ? config.rotate : -90;
  
  const initialVars = {
    opacity: config.fade !== false ? 0 : 1,
    transformStyle: 'preserve-3d',
    transformOrigin: config.transformOrigin || (axis === 'Y' ? 'center left' : 'top center')
  };
  
  if (axis === 'Y') {
    initialVars.rotateY = startAngle;
  } else {
    initialVars.rotateX = startAngle;
  }

  Tween.apply(elements, initialVars);

  // Extract custom parameters
  const { 
    type: _type, perspective, axis: _axis, rotate, fade, transformOrigin, 
    onElementStart, revertOnComplete, ...tweenProps 
  } = config;

  // 3. Build Timeline
  const tl = new Timeline();
  
  const toVars = {
    opacity: 1,
    duration: 0.8,
    ease: 'back.out(1.5)',
    stagger: 0.05,
    ...tweenProps
  };
  
  if (axis === 'Y') {
    toVars.rotateY = 0;
  } else {
    toVars.rotateX = 0;
  }

  tl.animate(elements, toVars);

  // 4. Granular Events
  if (config.onElementStart) {
    const staggerNum = typeof toVars.stagger === 'number' ? toVars.stagger : 0.05;
    elements.forEach((el, i) => {
      // Absolute time from timeline start, matching each element's own stagger delay
      tl.add(() => config.onElementStart(el, i), staggerNum * i);
    });
  }

  // 5. Cleanup
  if (config.revertOnComplete) {
    const originalComplete = tl.onComplete;
    tl.onComplete = () => {
      split.revert();
      if (originalComplete) originalComplete();
    };
  }

  return tl;
}
