/* utils.js — helpers compartilhados: rand, math, color, easing, AABB collision */

/** Random float in [min, max). */
export const rand = (min = 0, max = 1) => Math.random() * (max - min) + min;

/** Random int in [min, max]. */
export const randInt = (min, max) => Math.floor(rand(min, max + 1));

/** Pick a random element from array. */
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Clamp value between min and max. */
export const clamp = (v, min, max) => v < min ? min : v > max ? max : v;

/** Linear interpolation. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Distance squared (cheaper than sqrt for compare). */
export const dist2 = (x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy;
};

/** Euclidean distance. */
export const dist = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));

/** Angle from origin to point (radians). */
export const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

/** AABB collision between two rects {x,y,w,h}. */
export const aabb = (a, b) => {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
};

/** Convert HSL to RGB hex string. */
export const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

/** Convert hex to rgba string. */
export const rgba = (hex, alpha = 1) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Easing functions. */
export const ease = {
  inOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
};

/** Wait N ms as a promise. */
export const wait = (ms) => new Promise(r => setTimeout(r, ms));

/** Format number with leading zeros. */
export const pad = (n, len = 3) => String(n).padStart(len, '0');

/** Frame-rate independent damping: factor approaches 1, smoothing is per second. */
export const damp = (current, target, smoothing, dt) => {
  return lerp(current, target, 1 - Math.exp(-smoothing * dt));
};

/** Object pool helper. */
export class Pool {
  constructor(factory, initial = 8) {
    this.factory = factory;
    this.free = [];
    this.busy = [];
    for (let i = 0; i < initial; i++) this.free.push(this.factory());
  }
  acquire(...args) {
    const obj = this.free.length ? this.free.pop() : this.factory();
    obj.__reset?.(...args);
    this.busy.push(obj);
    return obj;
  }
  release(obj) {
    const i = this.busy.indexOf(obj);
    if (i !== -1) this.busy.splice(i, 1);
    this.free.push(obj);
  }
  forEachActive(fn) {
    for (let i = this.busy.length - 1; i >= 0; i--) fn(this.busy[i]);
  }
  active() { return this.busy; }
  clear() {
    for (const o of this.busy) this.free.push(o);
    this.busy.length = 0;
  }
}
