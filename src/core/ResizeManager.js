/**
 * Tensa ResizeManager
 * Centralized layout awareness that broadcasts when the window is resized
 * or when the document body's layout changes.
 */

import { getOwnerWindow, isWindowLike, isDocumentLike } from './TargetResolver.js';

class ResizeManager {
  constructor() {
    this._listeners = new Set();
    
    this._observedElements = new Set(); 
    this._observedWindows = new Set(); // extra realms (e.g. an <iframe>'s contentWindow) discovered via observe()
    
    this._isListening = false;
    this._onResize = this._onResize.bind(this);
    this._rafId = null;
    this._ro = null;
  }

  add(fn) {
    this._listeners.add(fn);
    if (!this._isListening && this._listeners.size > 0) {
      this._start();
    }
    return () => this.remove(fn);
  }

  remove(fn) {
    this._listeners.delete(fn);
    if (this._listeners.size === 0 && this._isListening) {
      this._stop();
    }
  }

  _start() {
    if (typeof window === 'undefined') return;
    this._isListening = true;
    window.addEventListener('resize', this._onResize);
    this._observedWindows.forEach(win => win.addEventListener('resize', this._onResize));
    
    if (typeof ResizeObserver !== 'undefined' && typeof document !== 'undefined') {
      if (!this._ro) {
        this._ro = new ResizeObserver(this._onResize);
      }
      this._ro.observe(document.body);
      
      // attach any elements registered before the observer started
      this._observedElements.forEach(el => this._ro.observe(el));
    }
  }

  _stop() {
    if (typeof window === 'undefined') return;
    this._isListening = false;
    window.removeEventListener('resize', this._onResize);
    this._observedWindows.forEach(win => win.removeEventListener('resize', this._onResize));
    if (this._ro) {
      this._ro.disconnect();
      this._ro = null;
    }
  }

  _onResize() {
    // Debounce to next frame to prevent layout thrashing
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._listeners.forEach(fn => fn());
    });
  }

  observe(el) {
    if (!el) return;

    // A bare Window (e.g. an <iframe>'s contentWindow) - track its own 'resize' event.
    if (isWindowLike(el)) {
      const mainWindow = typeof window !== 'undefined' ? window : null;
      if (el !== mainWindow && !this._observedWindows.has(el)) {
        this._observedWindows.add(el);
        if (this._isListening) el.addEventListener('resize', this._onResize);
      }
      return;
    }
    if (isDocumentLike(el)) return;

    // Cross-realm element - also watch its owning window's 'resize' event.
    const win = getOwnerWindow(el);
    const mainWindow = typeof window !== 'undefined' ? window : null;
    if (win && win !== mainWindow && !this._observedWindows.has(win)) {
      this._observedWindows.add(win);
      if (this._isListening) win.addEventListener('resize', this._onResize);
    }

    if (win && (el === win.document || el === win.document.body)) return;
    
    // Cache it
    this._observedElements.add(el);
    
    // If the observer is already running, attach it immediately
    if (this._ro) {
      this._ro.observe(el);
    }
  }

  unobserve(el) {
    if (!el) return;

    if (isWindowLike(el)) {
      if (this._observedWindows.has(el)) {
        this._observedWindows.delete(el);
        if (this._isListening) el.removeEventListener('resize', this._onResize);
      }
      return;
    }
    if (isDocumentLike(el)) return;
    
    // Remove it from cache
    this._observedElements.delete(el);
    
    if (this._ro) {
      this._ro.unobserve(el);
    }
  }
}

export const resizeManager = new ResizeManager();
export default resizeManager;