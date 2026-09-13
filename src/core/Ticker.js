/**
 * Tensa Ticker - RAF-based, high-precision animation loop
 * Manages all active tween updates via a single requestAnimationFrame loop.
 * Supports timeScale, delta-time correction, and page-visibility throttling.
 */

const noop = () => {};

class Ticker {
  constructor() {
    this._listeners = new Set();
    this._rafId = null;
    this._lastTime = 0;
    this._timeScale = 1;
    this._running = false;
    this._frameTime = 0;
    this._deltaRatio = 1;
    this._fps = 60;
    this._targetFps = 0;      // 0 means unthrottled
    this._fpsInterval = 0;
    this._lagThreshold = 500; // ms - clamp huge deltas (tab was in background)
    this._adjustedLag = 33;   // treat large lags as this many ms

    this._tick = this._tick.bind(this);

    // Pause ticker when tab is hidden, resume when visible
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this._lastTime = 0; // reset so we don't get huge delta on resume
          this._lastProcessedTime = 0;
          if (this._listeners.size > 0) this.wake();
        }
      });
    }
  }

  /** Add a listener function called each frame with (time, deltaTime, frame) */
  add(fn) {
    this._listeners.add(fn);
    this.wake();
    return () => this.remove(fn);
  }

  /** Remove a listener */
  remove(fn) {
    this._listeners.delete(fn);
    if (this._listeners.size === 0) this.sleep();
  }

  /** Start the RAF loop */
  wake() {
    if (this._running || this._listeners.size === 0) return;
    this._running = true;
    this._rafId = requestAnimationFrame(this._tick);
  }

  /** Stop the RAF loop */
  sleep() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Remove all active tweens from the ticker and pause */
  stopAll() {
    this._listeners.clear();
    this.sleep();
  }

  /** Get/set global timeScale (0.5 = half speed, 2 = double speed) */
  get timeScale() { return this._timeScale; }
  set timeScale(v) { this._timeScale = v; }

  /** Get/set target FPS (0 for unthrottled) */
  get targetFps() { return this._targetFps; }
  set targetFps(fps) {
    this._targetFps = fps;
    this._fpsInterval = fps > 0 ? 1000 / fps : 0;
  }

  /** Get current FPS (rolling average) */
  get fps() { return this._running ? this._fps : 0; }

  /** Get last recorded scaled timestamp */
  get time() { 
    return (this._running ? this._frameTime : (this._frameTime || performance.now())) * this._timeScale; 
  }

  /** Get real current physical clock timestamp scaled by timeScale */
  get now() {
    return performance.now() * this._timeScale;
  }

  _tick(timestamp) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._tick);

    // Delta time in milliseconds, clamped to prevent huge jumps
    let delta = this._lastTime ? timestamp - this._lastTime : 16.67;
    this._lastTime = timestamp;

    if (delta > this._lagThreshold) delta = this._adjustedLag;

    if (this._targetFps > 0) {
      this._accumulatedTime = (this._accumulatedTime || 0) + delta;
      
      // 2ms tolerance to prevent skipping when native matches target
      if (this._accumulatedTime < this._fpsInterval - 2) {
        return; // Skip frame
      }
      
      // Prevent spiral of death if tab was backgrounded
      if (this._accumulatedTime > this._fpsInterval * 5) {
        this._accumulatedTime = this._fpsInterval;
      }
      
      const intervals = Math.floor((this._accumulatedTime + 2) / this._fpsInterval);
      this._accumulatedTime -= intervals * this._fpsInterval;
    }

    // Calculate FPS based on physical time between rendered frames
    let realDelta = this._lastProcessedTime ? timestamp - this._lastProcessedTime : 16.67;
    this._lastProcessedTime = timestamp;
    if (realDelta > this._lagThreshold) realDelta = this._adjustedLag;
    
    this._fps = Math.round(1000 / realDelta);

    if (this._frameTime === 0) {
      this._frameTime = timestamp;
    } else {
      this._frameTime += realDelta;
    }

    const scaledDelta = realDelta * this._timeScale;
    const scaledTime = this._frameTime * this._timeScale;

    this._listeners.forEach(fn => fn(scaledTime, scaledDelta, timestamp));
  }

  /** Manually advance time by a fixed step (for testing / server-side) */
  tick(time, delta = 16.67) {
    this._frameTime = time / this._timeScale;
    this._listeners.forEach(fn => fn(time, delta, time));
  }
}

// Singleton ticker
export const ticker = new Ticker();
export default ticker;
