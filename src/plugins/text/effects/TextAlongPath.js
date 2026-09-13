import { TextSlicer } from '../TextSlicer.js';
import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';
import { getOwnerWindow } from '../../../core/TargetResolver.js';
import '../../PathTransition.js'; // Ensure the property plugin registers

/**
 * Text Along Path Effect
 * Positions and animates text characters sequentially along an SVG path.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function textAlongPath(target, config = {}) {
  const targetEl = typeof target === 'string' ? document.querySelector(target) : target;
  if (targetEl && getOwnerWindow(targetEl).getComputedStyle(targetEl).position === 'static') {
    targetEl.style.position = 'relative';
  }

  const type = config.type || 'chars';
  const split = TextSlicer.split(target, { type });
  const elements = type === 'chars' ? split.chars : (type === 'lines' ? split.lines : split.words);

  if (!elements || elements.length === 0 || !config.path) {
    return new Timeline();
  }

  const path = config.path;
  const autoRotate = config.autoRotate !== false;
  const charSpacing = config.charSpacing || (elements.length > 1 ? 0.8 / (elements.length - 1) : 0.05);
  const travel = config.travel !== undefined ? config.travel : 0.2;
  const align = config.align || 'bottom';
  const tl = new Timeline();

  elements.forEach((el, i) => {
    el.style.position = 'absolute';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.margin = '0px';
    
    if (align === 'center') {
      el.style.marginTop = '-0.6em';
      el.style.marginLeft = '-0.25em';
    } else if (align === 'top') {
      el.style.marginTop = '-1.2em';
      el.style.marginLeft = '-0.25em';
    }
    
    const targetPos = i * charSpacing;
    const startPos = targetPos - travel;

    // 1. Initial State along the path coordinates
    Tween.apply(el, {
      pathTransition: {
        path,
        start: startPos,
        end: startPos,
        autoRotate
      },
      opacity: config.fade !== false ? 0 : 1
    });

    const delay = i * (config.stagger !== undefined ? config.stagger : 0.03);

    // Extract custom properties
    const { path: _p, autoRotate: _ar, charSpacing: _cs, travel: _tr, align: _al, revertOnComplete, ...tweenProps } = config;

    // 2. Animate to final position along the path
    tl.animate(el, {
      pathTransition: {
        path,
        start: targetPos,
        end: targetPos,
        autoRotate
      },
      opacity: 1,
      duration: config.duration || 1.2,
      ease: config.ease || 'cubic.out',
      ...tweenProps
    }, delay);
  });

  // 3. Cleanup
  if (config.revertOnComplete) {
    const originalComplete = tl.onComplete;
    tl.onComplete = () => {
      split.revert();
      if (originalComplete) originalComplete();
    };
  }

  return tl;
}
