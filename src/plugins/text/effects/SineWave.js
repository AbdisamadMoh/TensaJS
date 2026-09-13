import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Sine Wave / Wiggle Effect
 * Spans float up and down continuously like a wave.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function sineWave(target, config = {}) {
  const type = config.type || 'chars';
  const split = TextSlicer.split(target, { type });
  const elements = type === 'chars' ? split.chars : (type === 'lines' ? split.lines : split.words);

  if (!elements || elements.length === 0) {
    return new Timeline();
  }

  // 1. Initial State (Offset)
  const amplitude = config.amplitude !== undefined ? config.amplitude : 10;
  
  Tween.apply(elements, {
    y: -amplitude
  });

  // Extract custom parameters
  const { 
    type: _type, amplitude: _amp, revertOnComplete, onElementStart, ...tweenProps 
  } = config;

  // 2. Build Timeline
  const tl = new Timeline();

  tl.animate(elements, {
    y: amplitude,
    duration: config.duration || 1,
    ease: config.ease || 'sine.inOut',
    stagger: config.stagger !== undefined ? config.stagger : 0.05,
    repeat: config.repeat !== undefined ? config.repeat : -1,
    yoyo: config.yoyo !== false,
    ...tweenProps
  });

  // 3. Optional Granular Events
  if (config.onElementStart) {
    const staggerVal = config.stagger !== undefined ? config.stagger : 0.05;
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
