/**
 * Tensa Responsive - Responsive animation contexts
 * 
 * Creates media-query-scoped animation contexts. When a query stops matching,
 * every tween/timeline registered with that breakpoint's context.add() is
 * killed and any cleanup function returned by the handler runs. This does
 * not restore CSS properties to their pre-animation values, a killed tween
 * simply stops updating wherever it left off.
 * 
 * Usage:
 *   const ctx = Tensa.responsive();
 *   ctx.add('(min-width: 768px)', () => {
 *     Tensa.animate('.hero', { x: 100, duration: 1 });
 *   });
 *   ctx.add('(max-width: 799px)', () => {
 *     Tensa.animate('.hero', { y: 50, duration: 0.5 });
 *   });
 */

export class ResponsiveContext {
  constructor() {
    this._conditions = new Map(); // query string → { mql, cleanup, tweens[] }
  }

  /**
   * Add a media-query-scoped animation context.
   * The callback receives a context object with .add() for registering cleanup.
   * 
   * @param {string} query - CSS media query string
   * @param {Function} handler - (context) => void | cleanup function
   */
  add(query, handler) {
    if (typeof window === 'undefined') return this;

    // Re-adding the same query would otherwise leak the previous mql listener,
    // since it's detached only via remove()/revert() on the tracked entry.
    if (this._conditions.has(query)) {
      this.remove(query);
    }

    const mql = window.matchMedia(query);

    const context = {
      _tweens: [],
      _cleanups: [],
      add(tween) {
        context._tweens.push(tween);
        return tween;
      },
      revert() {
        context._tweens.forEach(t => t?.kill?.());
        context._tweens.length = 0;
        context._cleanups.forEach(fn => fn?.());
        context._cleanups.length = 0;
      },
    };

    const listener = (e) => {
      if (e.matches) {
        // Run the handler
        const cleanup = handler(context);
        if (typeof cleanup === 'function') {
          context._cleanups.push(cleanup);
        }
      } else {
        context.revert();
      }
    };

    // Run immediately if condition already matches
    if (mql.matches) {
      const cleanup = handler(context);
      if (typeof cleanup === 'function') {
        context._cleanups.push(cleanup);
      }
    }

    mql.addEventListener('change', listener);

    this._conditions.set(query, { mql, context, listener });
    return this;
  }

  /**
   * Remove a media query condition and revert its animations.
   * @param {string} query
   */
  remove(query) {
    const entry = this._conditions.get(query);
    if (entry) {
      entry.context.revert();
      entry.mql.removeEventListener('change', entry.listener);
      this._conditions.delete(query);
    }
    return this;
  }

  /**
   * Revert and remove ALL registered conditions.
   */
  revert() {
    for (const [query] of this._conditions) {
      this.remove(query);
    }
    return this;
  }

  /**
   * Kill (alias for revert).
   */
  kill() {
    return this.revert();
  }
}

export function createResponsive() {
  return new ResponsiveContext();
}

export default createResponsive;
