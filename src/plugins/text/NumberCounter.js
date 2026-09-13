/**
 * Tensa NumberCounter Plugin
 * 
 * Animates a numeric value inside a text element (counting up or down) with custom formatting.
 * 
 * Usage:
 * Tensa.animate(element, { 
 *   count: { value: 1000, decimals: 0, prefix: "$", suffix: "", useCommas: true },
 *   duration: 2 
 * });
 */

import { registerPropertyPlugin } from '../../core/CSSPlugin.js';

export const NumberCounterPlugin = {
  name: 'count',
  
  prepare(target, prop, fromVal, toVal) {
    if (prop !== 'count') return null;

    const fromIsObj = typeof fromVal === 'object' && fromVal !== null;
    const toIsObj = typeof toVal === 'object' && toVal !== null;

    // Configuration source: prefer toVal, then fromVal
    const configSource = toIsObj ? toVal : (fromIsObj ? fromVal : {});

    let decimals = configSource.decimals !== undefined ? Math.max(0, parseInt(configSource.decimals, 10)) : 0;
    let prefix = configSource.prefix !== undefined ? configSource.prefix : "";
    let suffix = configSource.suffix !== undefined ? configSource.suffix : "";
    let useCommas = configSource.useCommas !== undefined ? !!configSource.useCommas : true;

    // Helper to extract numeric value from target's current text or property
    const extractFromTarget = () => {
      const raw = target.nodeType ? (target.textContent || "") : (target.count || "");
      const str = String(raw).replace(/,/g, '');
      const match = str.match(/-?\d+(?:\.\d+)?/);
      return match ? parseFloat(match[0]) : 0;
    };

    let startValue = 0;
    let endValue = 0;

    // Determine startValue
    if (configSource.from !== undefined) {
      startValue = parseFloat(configSource.from) || 0;
    } else if (fromIsObj && fromVal.value !== undefined) {
      startValue = parseFloat(fromVal.value) || 0;
    } else {
      startValue = extractFromTarget();
    }

    // Determine endValue
    if (configSource.to !== undefined) {
      endValue = parseFloat(configSource.to) || 0;
    } else if (toIsObj && toVal.value !== undefined) {
      endValue = parseFloat(toVal.value) || 0;
    } else if (fromIsObj && !toIsObj && fromVal.value !== undefined) {
      // It's animateFrom! toVal is garbage from CSS computed style.
      endValue = extractFromTarget();
    } else if (toIsObj && configSource.from !== undefined) {
      // It's animate with { from: X } but no to/value.
      endValue = extractFromTarget();
    } else {
      // Fallback
      endValue = parseFloat(toVal) || 0;
    }

    return {
      type: 'plugin',
      prop: 'count',
      start: startValue,
      end: endValue,
      change: endValue - startValue,
      decimals,
      prefix,
      suffix,
      useCommas
    };
  },

  render(target, descriptor, t) {
    const data = descriptor;
    
    // Calculate current value
    const currentValue = data.start + (data.change * t);
    
    // Format number to fixed decimals
    // Use Math.abs for formatting to handle negative signs properly if prefix is attached
    let isNegative = currentValue < 0;
    let absoluteValue = Math.abs(currentValue);
    
    let formatted = absoluteValue.toFixed(data.decimals);
    
    // Add commas if requested
    if (data.useCommas) {
      const parts = formatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      formatted = parts.join('.');
    }
    
    // Reattach negative sign outside of the prefix, or inside depending on preference.
    // Usually: "-$1,000"
    const sign = isNegative ? "-" : "";
    const finalString = sign + data.prefix + formatted + data.suffix;
    
    // Apply to DOM or plain object
    if (target.nodeType) {
      target.textContent = finalString;
    } else {
      target.count = finalString;
    }
  }
};

registerPropertyPlugin('count', NumberCounterPlugin);
