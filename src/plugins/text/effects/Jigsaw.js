import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Jigsaw Reveal Effect
 * Characters fly in from random coordinates and rotations to lock into place.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function jigsaw(target, config = {}) {
  const split = TextSlicer.split(target, { type: 'chars' });
  
  if (!split.chars || split.chars.length === 0) {
    return new Timeline();
  }

  // 1. Generate random initial states and apply them
  const spreadX = config.spreadX || 200;
  const spreadY = config.spreadY || 200;
  const rotRange = config.rotation || 180;
  
  // Note: Instead of using `Tween.animateFrom` which computes on the fly,
  // we explicitly set the random values instantly via `Tween.apply` so we can
  // animate them to exactly 0 in the timeline.
  
  split.chars.forEach(char => {
    Tween.apply(char, {
      x: (Math.random() - 0.5) * spreadX,
      y: (Math.random() - 0.5) * spreadY,
      rotation: (Math.random() - 0.5) * rotRange,
      opacity: 0,
      scale: config.scale !== undefined ? config.scale : Math.random() * 0.5 + 0.5
    });
  });

  // Extract specific config properties (alias variables to avoid redeclaration error)
  const { onCharStart, revertOnComplete, spreadX: _sx, spreadY: _sy, rotation, scale, ...tweenProps } = config;

  // 2. Build Timeline
  const tl = new Timeline();
  
  tl.animate(split.chars, {
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    scale: 1,
    duration: 1.2,
    ease: 'back.out(1.2)',
    stagger: { amount: 0.8, from: 'random' },
    ...tweenProps
  });

  // 3. Optional Granular Events
  if (config.onCharStart) {
    // If stagger is complex (like object), manually computing timing is tricky, 
    // so we omit granular events if stagger is not a simple number, or we just stagger linearly.
    const staggerNum = typeof config.stagger === 'number' ? config.stagger : 0.05;
    split.chars.forEach((el, i) => {
      // Absolute time from timeline start, matching each element's own stagger delay
      tl.add(() => config.onCharStart(el, i), staggerNum * i);
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
