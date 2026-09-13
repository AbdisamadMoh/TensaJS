import { Timeline } from '../../../core/Timeline.js';
import { getOwnerDocument, getOwnerWindow } from '../../../core/TargetResolver.js';

/**
 * Matrix Rain Effect (Digital Rain)
 * Renders falling vertical streams of random characters inside a canvas context, driven by the Tensa loop.
 * 
 * @param {string|Element} target 
 * @param {Object} config 
 * @returns {import('../../../core/Timeline.js').Timeline}
 */
export function matrixRain(target, config = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) {
    return new Timeline();
  }

  const win = getOwnerWindow(el);

  // 1. Setup absolute canvas overlay
  const canvas = getOwnerDocument(el).createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = config.zIndex || '1';

  // Ensure parent has position to hold absolute child
  if (win.getComputedStyle(el).position === 'static') {
    el.style.position = 'relative';
  }
  el.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  
  let width = canvas.width = el.offsetWidth || win.innerWidth;
  let height = canvas.height = el.offsetHeight || win.innerHeight;

  const handleResize = () => {
    width = canvas.width = el.offsetWidth || win.innerWidth;
    height = canvas.height = el.offsetHeight || win.innerHeight;
  };
  win.addEventListener('resize', handleResize);

  const fontSize = config.fontSize || 14;
  const columns = Math.floor(width / fontSize);
  const drops = Array(columns).fill(0);
  
  const chars = (config.chars || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$+-*/=<>%!').split('');
  const color = config.color || '#00ff33';

  const tl = new Timeline({ repeat: config.repeat !== undefined ? config.repeat : -1 });

  const progressObj = { progress: 0 };
  let lastProgress = 0;
  const expectedFramesPerLoop = (config.duration || 5) * 60;
  
  tl.animate(progressObj, {
    progress: 1,
    duration: config.duration || 5,
    ease: 'none',
    onUpdate: () => {
      let currentProgress = progressObj.progress;
      let deltaProgress = currentProgress - lastProgress;
      
      // Handle loop wrapping
      if (deltaProgress < -0.5) deltaProgress += 1;
      else if (deltaProgress > 0.5) deltaProgress -= 1;
      
      lastProgress = currentProgress;

      // Do nothing if effectively paused (avoids fading out to black while paused)
      if (Math.abs(deltaProgress) < 0.00001) return;

      const step = deltaProgress * expectedFramesPerLoop;

      // Draw faded black layer to create visual trail effect
      ctx.fillStyle = `rgba(0, 0, 0, ${config.fadeAmount || 0.05})`;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = color;
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        ctx.fillText(char, x, y);

        if (step > 0) {
          if (y > height && Math.random() > 0.975) {
            drops[i] = 0;
          }
        } else {
          if (y < 0 && Math.random() > 0.975) {
            drops[i] = height / fontSize + 1;
          }
        }
        drops[i] += step;
      }
    }
  });

  // 3. Attach cleanup listener directly to timeline kill
  const originalKill = tl.kill;
  tl.kill = () => {
    win.removeEventListener('resize', handleResize);
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    if (originalKill) originalKill.call(tl);
  };

  return tl;
}
