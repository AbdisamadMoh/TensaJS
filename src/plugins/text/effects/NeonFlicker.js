import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Neon Flicker Effect
 * Simulates a faulty neon sign turning on with staggered irregular flickers.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function neonFlicker(target, config = {}) {
  const type = config.type || 'chars';
  const split = TextSlicer.split(target, { type });
  const elements = type === 'chars' ? split.chars : (type === 'lines' ? split.lines : split.words);

  if (!elements || elements.length === 0) {
    return new Timeline();
  }

  const color = config.color || '#ff0055';
  const dimShadow = `0 0 2px rgba(255, 0, 85, 0.2)`;
  const glowShadow = `0 0 4px #fff, 0 0 10px ${color}, 0 0 20px ${color}, 0 0 30px ${color}`;

  // 1. Initial State (Dim/Off)
  Tween.apply(elements, {
    opacity: config.dimOpacity !== undefined ? config.dimOpacity : 0.2,
    textShadow: dimShadow
  });

  // 2. Build Timeline
  const tl = new Timeline();
  const flickerCount = config.flickers || 6;
  const flickerDuration = config.flickerDuration || 0.08;
  const staggerVal = config.stagger !== undefined ? config.stagger : 0.08;

  elements.forEach((el, index) => {
    const baseDelay = index * staggerVal;
    let time = baseDelay;

    for (let f = 0; f < flickerCount; f++) {
      const isOn = Math.random() > 0.4;
      const op = isOn ? 1 : (config.dimOpacity !== undefined ? config.dimOpacity : 0.2);
      const shadow = isOn ? glowShadow : dimShadow;
      const dur = flickerDuration * (0.8 + Math.random() * 0.4);

      tl.animate(el, {
        opacity: op,
        textShadow: shadow,
        duration: dur,
        ease: 'none'
      }, time);

      time += dur;
    }

    // Final Stable "ON" State
    tl.animate(el, {
      opacity: 1,
      textShadow: glowShadow,
      duration: config.duration || 0.4,
      ease: config.ease || 'quad.out'
    }, time);
  });

  // 3. Cleanup on complete
  if (config.revertOnComplete) {
    const originalComplete = tl.onComplete;
    tl.onComplete = () => {
      split.revert();
      if (originalComplete) originalComplete();
    };
  }

  return tl;
}
