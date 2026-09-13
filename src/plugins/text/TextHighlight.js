/**
 * Tensa TextHighlight Plugin
 * 
 * Creates a "marker" or "underline" drawing effect behind text by 
 * automatically setting up a linear-gradient background and animating
 * the background-size property.
 * 
 * Usage:
 * Tensa.animate(element, { 
 *   textHighlight: { color: 'var(--pink)', type: 'marker' }
 * });
 */

import { registerPropertyPlugin } from '../../core/CSSPlugin.js';

export const TextHighlightPlugin = {
  name: 'textHighlight',

  prepare(target, prop, fromVal, toVal) {
    if (prop !== 'textHighlight') return null;

    // Parse config
    let config = {
      color: '#ffd93d',
      type: 'marker', // 'marker' or 'underline'
      height: null,
      offset: null
    };

    if (typeof toVal === 'string') {
      config.color = toVal;
    } else if (typeof toVal === 'object' && toVal !== null) {
      config = { ...config, ...toVal };
    }

    // Determine sizes based on type
    let height = config.height;
    let position = '0% 100%'; // left bottom by default

    if (config.type === 'underline') {
      height = height || '3px';
      position = `0% ${config.offset || '100%'}`;
    } else {
      // marker
      height = height || '40%';
      position = `0% ${config.offset || '85%'}`;
    }

    // Setup base styles for the highlight
    target.style.backgroundImage = `linear-gradient(to right, ${config.color}, ${config.color})`;
    target.style.backgroundRepeat = 'no-repeat';
    target.style.backgroundPosition = position;
    
    // Set initial size to 0% width
    target.style.backgroundSize = `0% ${height}`;

    return {
      type: 'plugin',
      prop: 'textHighlight',
      height: height
    };
  },

  render(target, descriptor, t) {
    // Interpolate width from 0% to 100%
    const width = (t * 100).toFixed(2);
    target.style.backgroundSize = `${width}% ${descriptor.height}`;
  }
};

registerPropertyPlugin('textHighlight', TextHighlightPlugin);
