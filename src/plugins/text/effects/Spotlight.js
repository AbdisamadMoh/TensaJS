import { Tween } from '../../../core/Tween.js';
import { Timeline } from '../../../core/Timeline.js';

/**
 * Spotlight Reveal Effect
 * Sweeps a radial gradient mask across the text container.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function spotlight(target, config = {}) {
  const elements = typeof target === 'string' ? document.querySelectorAll(target) : (target.length !== undefined ? target : [target]);
  
  if (!elements || elements.length === 0) {
    return new Timeline();
  }

  const color = config.color || '#ffffff';
  const darkColor = config.darkColor || 'rgba(255, 255, 255, 0.15)';
  const size = config.size || '15%';
  const fadeSize = config.fadeSize || '30%';

  elements.forEach(el => {
    // 1. Initial Styles Setup
    el.style.backgroundImage = `radial-gradient(circle at var(--tensajs-spotlight-x, -50%) var(--tensajs-spotlight-y, 50%), ${color} 0%, ${color} ${size}, ${darkColor} ${fadeSize}, ${darkColor} 100%)`;
    el.style.webkitBackgroundClip = 'text';
    el.style.backgroundClip = 'text';
    el.style.webkitTextFillColor = 'transparent';
    el.style.color = 'transparent';
    
    Tween.apply(el, {
      '--tensajs-spotlight-x': '-50%',
      '--tensajs-spotlight-y': config.y !== undefined ? config.y : '50%'
    });
  });

  const tl = new Timeline();
  
  const { color: _c, darkColor: _dc, size: _sz, fadeSize: _fs, y: _y, ...tweenProps } = config;

  // 2. Animate Custom Position Property
  tl.animate(elements, {
    '--tensajs-spotlight-x': '150%',
    duration: config.duration || 1.5,
    ease: config.ease || 'quad.inOut',
    ...tweenProps
  });

  return tl;
}
