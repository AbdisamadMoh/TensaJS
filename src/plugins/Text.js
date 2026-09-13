/**
 * Tensa Text Plugin Suite
 *
 * Named exports (use what you need):
 *   TextSlicer           - Splits text into characters, words, and lines
 *   TextEffects          - Namespace object containing all effect helpers
 *   ScrambleTextPlugin   - Matrix-style text decoding effect
 *   NumberCounterPlugin  - Animates numbers smoothly
 *   TextGradientPlugin   - Animates CSS gradient stops over text
 *   TextHighlightPlugin  - Animate text highlights (background spans)
 *   TypewriterPlugin     - Classic typewriter reveal with blinking cursor
 *
 * Individual effect exports (atomic imports):
 *   blurReveal, clipPathReveal, elasticSnap, flip3D, glitch,
 *   jigsaw, marquee, matrixRain, neonFlicker, scatter, sineWave,
 *   slotMachine, spotlight, squeezeAndPop, textAlongPath, textSwap, unfold
 */

import { TextSlicer } from './text/TextSlicer.js';
export { TextSlicer };
export { ScrambleTextPlugin } from './text/ScrambleText.js';
export { NumberCounterPlugin } from './text/NumberCounter.js';
export { TextGradientPlugin } from './text/TextGradient.js';
export { TextHighlightPlugin } from './text/TextHighlight.js';
export { TypewriterPlugin } from './text/Typewriter.js';

import * as RawEffects from './text/effects/index.js';
import { Timeline } from '../core/Timeline.js';

function wrapEffect(fn) {
  return function(target, config = {}) {
    const {
      paused, repeat, yoyo, repeatDelay, delay,
      onStart, onUpdate, onComplete, onRepeat, onReverseComplete,
      ...effectProps
    } = config;

    const tl = fn(target, effectProps);

    if (tl instanceof Timeline) {
      if (paused !== undefined) tl._paused = paused;
      if (repeat !== undefined) tl._repeat = repeat;
      if (yoyo !== undefined) tl._yoyo = yoyo;
      if (repeatDelay !== undefined) tl._repeatDelay = repeatDelay;
      if (delay !== undefined) tl._delay = delay;
      if (onStart !== undefined) tl.onStart = onStart;
      if (onUpdate !== undefined) tl.onUpdate = onUpdate;
      if (onComplete !== undefined) {
        const origComplete = tl.onComplete;
        tl.onComplete = () => {
          if (origComplete) origComplete();
          onComplete();
        };
      }
      if (onRepeat !== undefined) tl.onRepeat = onRepeat;
      if (onReverseComplete !== undefined) tl.onReverseComplete = onReverseComplete;

      if (paused) {
        tl.pause();
      }
    }

    return tl;
  };
}

const TextEffects = {};
for (const [key, fn] of Object.entries(RawEffects)) {
  TextEffects[key] = wrapEffect(fn);
}

export { TextEffects };

// Individual named exports — mirrors the Dynamics pattern so users can
// import only what they use: `import { blurReveal } from 'tensajs/plugins/Text'`
export const blurReveal     = TextEffects.blurReveal;
export const clipPathReveal = TextEffects.clipPathReveal;
export const elasticSnap    = TextEffects.elasticSnap;
export const flip3D         = TextEffects.flip3D;
export const glitch         = TextEffects.glitch;
export const jigsaw         = TextEffects.jigsaw;
export const marquee        = TextEffects.marquee;
export const matrixRain     = TextEffects.matrixRain;
export const neonFlicker    = TextEffects.neonFlicker;
export const scatter        = TextEffects.scatter;
export const sineWave       = TextEffects.sineWave;
export const slotMachine    = TextEffects.slotMachine;
export const spotlight      = TextEffects.spotlight;
export const squeezeAndPop  = TextEffects.squeezeAndPop;
export const textAlongPath  = TextEffects.textAlongPath;
export const textSwap       = TextEffects.textSwap;
export const unfold         = TextEffects.unfold;
