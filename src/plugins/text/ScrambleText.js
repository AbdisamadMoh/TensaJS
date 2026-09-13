/**
 * Tensa ScrambleText Plugin
 * 
 * Animates text by scrambling the characters randomly before settling on the final text.
 */

import { registerPropertyPlugin } from '../../core/CSSPlugin.js';

const CHAR_SETS = {
  upperCase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowerCase: "abcdefghijklmnopqrstuvwxyz",
  upperAndLowerCase: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  punctuation: "!@#$%^&*()_+-=[]{}|;':,./<>?",
  all: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;':,./<>?",
  hiragana: "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん",
  katakana: "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン",
  cyrillic: "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя",
  arabic: "ابتثجحخدذرزسشصضطظعغفقكلمنهوي",
  korean: "가나다라마바사아자차카타파하",
  chinese: "的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经"
};

export const ScrambleTextPlugin = {
  name: 'scrambleText',
  
  prepare(target, prop, fromVal, toVal) {
    if (prop !== 'scrambleText') return null;

    const originalText = target.textContent || "";
    let newText = originalText;
    let charsOption = "upperCase";
    let revealDelay = 0;
    let speed = 1;
    let delimiter = "";

    if (typeof toVal === 'object' && toVal !== null) {
      newText = toVal.text !== undefined ? String(toVal.text) : originalText;
      charsOption = toVal.chars || "upperCase";
      revealDelay = toVal.revealDelay || 0;
      speed = toVal.speed || 1;
      delimiter = toVal.delimiter || "";
    } else if (typeof toVal === 'string') {
      newText = toVal;
    }

    const chars = CHAR_SETS[charsOption] || charsOption;

    return {
      type: 'plugin',
      prop: 'scrambleText',
      originalText,
      newText,
      chars,
      revealDelay,
      speed,
      delimiter,
      lengthTween: {
        start: originalText.length,
        change: newText.length - originalText.length
      },
      lastProgress: 0,
      lastScrambleStr: originalText
    };
  },

  render(target, descriptor, t) {
    const data = descriptor;
    
    // Fast path edges
    if (t === 1) {
      target.textContent = data.newText;
      return;
    }
    if (t === 0) {
      target.textContent = data.originalText;
      return;
    }

    // Only scramble if speed threshold is met, or at edges
    if (Math.abs(t - data.lastProgress) < (0.02 / data.speed)) {
      target.textContent = data.lastScrambleStr;
      return;
    }
    data.lastProgress = t;

    // Current length of the string
    const currentLength = Math.round(data.lengthTween.start + data.lengthTween.change * t);
    
    // How many characters have settled (been revealed)
    let settledRatio = 0;
    if (t > data.revealDelay) {
      settledRatio = (t - data.revealDelay) / (1 - data.revealDelay);
    }
    
    const settledLength = Math.floor(currentLength * settledRatio);
    
    let result = "";
    const targetArr = data.delimiter === "" ? Array.from(data.newText) : data.newText.split(data.delimiter);
    const charLen = data.chars.length;

    for (let i = 0; i < currentLength; i++) {
      if (i < settledLength) {
        // Settled character
        result += targetArr[i] || "";
      } else {
        // Scrambling character
        if (targetArr[i] === " " || targetArr[i] === "\n") {
           result += targetArr[i];
        } else {
           result += data.chars[Math.floor(Math.random() * charLen)];
        }
      }
      if (i < currentLength - 1 && data.delimiter !== "") {
        result += data.delimiter;
      }
    }

    data.lastScrambleStr = result;
    target.textContent = result;
  }
};

registerPropertyPlugin('scrambleText', ScrambleTextPlugin);
