/**
 * Tensa Global Configuration
 */

export const TensaConfig = {
  strictMode: false,
};

/**
 * Configure global Tensa settings.
 * @param {Object} options
 * @param {boolean} [options.strictMode] - If true, throws Error on missing targets or invalid parameters instead of silently failing.
 */
export function config(options = {}) {
  if (options.strictMode !== undefined) {
    TensaConfig.strictMode = !!options.strictMode;
  }
}

/**
 * Helper to gracefully warn or throw depending on strictMode.
 * @param {string} message 
 */
export function reportError(message) {
  if (TensaConfig.strictMode) {
    throw new Error(message);
  } else {
    console.warn(message);
  }
}
