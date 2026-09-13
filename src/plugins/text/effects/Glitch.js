import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Cyberpunk Glitch Effect
 * Rapidly scrambles clip-paths, horizontal offsets, skews, text shadows, and opacities.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function glitch(target, config = {}) {
  const type = config.type || 'chars';
  const split = TextSlicer.split(target, { type });
  const elements = type === 'chars' ? split.chars : (type === 'lines' ? split.lines : split.words);

  if (!elements || elements.length === 0) {
    return new Timeline();
  }

  // 1. Initial State Setup
  Tween.apply(elements, {
    x: 0,
    y: 0,
    skewX: 0,
    opacity: 1,
    textShadow: 'none',
    clipPath: 'inset(0% 0% 0% 0%)'
  });

  const tl = new Timeline();

  const iterations = config.iterations || 8;
  const stepDuration = config.stepDuration || 0.06;
  const intensity = config.intensity || 1;

  // 2. Build keyframe-like steps on timeline
  for (let step = 0; step < iterations; step++) {
    const isLast = step === iterations - 1;
    const timePos = step * stepDuration;

    elements.forEach((el) => {
      if (isLast) {
        // Final frame: return to clean, stable state
        tl.animate(el, {
          x: 0,
          y: 0,
          skewX: 0,
          opacity: 1,
          clipPath: 'inset(0% 0% 0% 0%)',
          textShadow: 'none',
          duration: stepDuration,
          ease: 'none'
        }, timePos);
      } else if (Math.random() > 0.4) {
        // Glitch state
        const xOffset = (Math.random() - 0.5) * 15 * intensity;
        const yOffset = (Math.random() - 0.5) * 6 * intensity;
        const skewVal = (Math.random() - 0.5) * 30 * intensity;
        const opVal = Math.random() > 0.2 ? 1 : 0.2 + Math.random() * 0.5;

        // Clip path slice
        const top = Math.floor(Math.random() * 80);
        const bottom = Math.floor(Math.random() * (100 - top));
        const clipVal = `inset(${top}% 0% ${bottom}% 0%)`;

        // RGB Split colors (customizable via color1 and color2)
        const shadowX1 = (Math.random() - 0.5) * 6 * intensity;
        const shadowX2 = (Math.random() - 0.5) * -6 * intensity;
        const shadowColor1 = config.color1 || '#ff0055';
        const shadowColor2 = config.color2 || '#00d4ff';
        const shadowVal = `${shadowX1}px 0px 0px ${shadowColor1}, ${shadowX2}px 0px 0px ${shadowColor2}`;

        tl.animate(el, {
          x: xOffset,
          y: yOffset,
          skewX: skewVal,
          opacity: opVal,
          clipPath: clipVal,
          textShadow: shadowVal,
          duration: stepDuration,
          ease: 'none'
        }, timePos);
      } else {
        // Calm state
        tl.animate(el, {
          x: 0,
          y: 0,
          skewX: 0,
          opacity: 1,
          clipPath: 'inset(0% 0% 0% 0%)',
          textShadow: 'none',
          duration: stepDuration,
          ease: 'none'
        }, timePos);
      }
    });
  }

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
