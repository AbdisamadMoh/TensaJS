import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Scatter / Particle Explosion Effect
 * Assembles text by pulling characters in from a chaotic randomized transform cloud.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function scatter(target, config = {}) {
  const type = config.type || 'chars';
  const split = TextSlicer.split(target, { type });
  const elements = type === 'chars' ? split.chars : (type === 'lines' ? split.lines : split.words);

  if (!elements || elements.length === 0) {
    return new Timeline();
  }

  const spreadX = config.spreadX || 250;
  const spreadY = config.spreadY || 250;
  const rotationRange = config.rotation !== undefined ? config.rotation : 180;
  const startScale = config.scale !== undefined ? config.scale : 0.5;

  // 1. Initial State (Random cloud distribution)
  elements.forEach(el => {
    Tween.apply(el, {
      x: (Math.random() - 0.5) * spreadX,
      y: (Math.random() - 0.5) * spreadY,
      rotation: (Math.random() - 0.5) * rotationRange,
      scale: startScale,
      opacity: 0
    });
  });

  // Extract custom parameters
  const { 
    type: _type, spreadX: _sx, spreadY: _sy, rotation, scale, revertOnComplete, onElementStart, ...tweenProps 
  } = config;

  // 2. Build Timeline
  const tl = new Timeline();

  const toVars = {
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    opacity: 1,
    duration: config.duration || 1.2,
    ease: config.ease || 'quart.out',
    stagger: config.stagger !== undefined ? config.stagger : { amount: 0.6, from: 'random' },
    ...tweenProps
  };

  tl.animate(elements, toVars);

  // 3. Optional Granular Events
  if (config.onElementStart) {
    const staggerVal = typeof toVars.stagger === 'number' ? toVars.stagger : 0.05;
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
