
import ticker from './Ticker.js';

export const PlayState = {
  IDLE:      'idle',
  PLAYING:   'playing',
  PAUSED:    'paused',
  COMPLETED: 'completed',
  REVERSED:  'reversed',
};

export class Playable {
  constructor() {
    this._state     = PlayState.IDLE;
    this._time      = 0;      // current time within this playable (seconds)
    this._duration  = 0;      // total duration (seconds)
    this._timeScale = 1;      // local time scale multiplier
    this._paused    = true;
    this._reversed  = false;
    this._repeat    = 0;      // -1 = infinite
    this._repeatCount = 0;
    this._yoyo      = false;
    this._repeatDelay = 0;
    this._labels    = {};     // label name -> time
    this._id        = null;   // optional id

    // Callbacks
    this.onStart           = null;
    this.onUpdate          = null;
    this.onComplete        = null;
    this.onRepeat          = null;
    this.onReverseComplete = null;

    this._started = false;
  }

  // Getters / Setters

  get duration() { return this._duration; }

  get totalDuration() {
    if (this._repeat === -1) return Infinity;
    return this._duration * (this._repeat + 1) + this._repeatDelay * this._repeat;
  }

  get time() { return this._time; }
  set time(v) { this.seek(v); }

  get progress() {
    return this._duration === 0 ? 1 : this._time / this._duration;
  }
  set progress(v) { this.seek(v * this._duration); }

  get timeScale() { return this._timeScale; }
  set timeScale(v) {
    this._timeScale = Math.max(0.001, v);
  }

  get repeat() { return this._repeat; }
  get repeatCount() { return this._repeatCount; }
  get repeatDelay() { return this._repeatDelay; }
  get yoyo() { return this._yoyo; }
  get delay() { return this._delay; }
  get ease() { return this._ease; }
  get id() { return this._id; }
  get labels() { return { ...this._labels }; }
  get state() { return this._state; }

  get paused() { return this._paused; }
  get isReversed() { return this._reversed; }
  get isCompleted() { return this._state === PlayState.COMPLETED; }
  get isActive() { return this._state === PlayState.PLAYING; }

  // Playback Controls

  /** Start / resume playback forward */
  play(from=null) {
    if (from != null) this.seek(from);
    this._reversed = false;
    this._paused = false;
    this._state = PlayState.PLAYING;
    this._onPlay();
    return this;
  }

  /** Pause at current position */
  pause(atTime=null) {
    if (atTime != null) this.seek(atTime);
    this._paused = true;
    this._state = PlayState.PAUSED;
    this._onPause();
    return this;
  }

  /** Resume from current position */
  resume() {
    this._paused = false;
    this._state = PlayState.PLAYING;
    return this;
  }

  /** Reverse playback direction */
  reverse(from=null) {
    if (from != null) this.seek(from);
    this._reversed = true;
    this._paused = false;
    this._state = PlayState.PLAYING;
    return this;
  }

  /** Seek to a specific time (seconds) or label string */
  seek(timeOrLabel) {
    const t = typeof timeOrLabel === 'string'
      ? (this._labels && this._labels[timeOrLabel] || 0)
      : timeOrLabel;
    this._time = Math.max(0, Math.min(t, this._duration));
    
    // Adjust ticker start time if playing
    if (this._tickerRemove && this._startTime !== null) {
      const now = ticker.time;
      const elapsed = this._time + this._delay;
      this._startTime = now - (elapsed * 1000) / this._timeScale;
    }
    
    this._render(this._time);
    return this;
  }

  /** Restart from beginning */
  restart(includeDelay = false) {
    this._repeatCount = 0;
    this._started = false;
    return this.play(includeDelay ? -this._delay : 0);
  }

  /**
   * Invalidate - re-reads live start values on next render.
   * Useful when DOM has changed since animation was created.
   */
  invalidate() {
    this._started = false;
    return this;
  }

  /** Kill this animation (remove from ticker) */
  kill() {
    this._paused = true;
    this._state = PlayState.IDLE;
    this._onKill();
    return this;
  }

  /** Toggle between play and pause */
  toggle() {
    return this._paused ? this.play() : this.pause();
  }

  /** Jump forward by `sec` seconds from the current position */
  forward(sec = 0.5) {
    return this.seek(this._time + sec);
  }

  /** Jump backward by `sec` seconds from the current position */
  backward(sec = 0.5) {
    return this.seek(Math.max(0, this._time - sec));
  }

  // Labels

  addLabel(name, time) {
    this._labels[name] = time;
    return this;
  }

  getLabels() {
    return { ...this._labels };
  }

  // Overridable hooks (implemented by subclasses)

  _render(time) { /* implemented by Tween/Timeline */ }
  _onPlay()     { /* hook */ }
  _onPause()    { /* hook */ }
  _onKill()     { /* hook */ }

  // Event dispatch helpers

  _fireCallback(name, ...args) {
    if (typeof this[name] === 'function') {
      this[name].call(this, ...args);
    }
  }
}

export default Playable;
