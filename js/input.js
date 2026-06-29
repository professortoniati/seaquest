/* input.js — teclado + touch + joystick virtual; emite estado normalizado. */

import { clamp } from './utils.js';

/**
 * Estado de input exposto ao jogo:
 *  - moveX: -1..1 (esquerda/direita)
 *  - moveY: -1..1 (cima/baixo)
 *  - fire: bool (pressionado)
 *  - pause: bool (borda de subida)
 *  - start, restart, etc: bool (bordas)
 */
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.moveX = 0;
    this.moveY = 0;
    this.fire = false;
    this._fireEdge = false;     // borda de subida para auto-fire
    this._firePrev = false;
    this.pause = false;
    this.actionEdges = new Map(); // 'start' -> bool (true uma vez por press)
    this.joystickActive = false;
    this.joystickTouchId = null;
    this.fireTouchId = null;

    this._bindKeyboard();
    this._bindTouch();
  }

  /** Lê borda de uma ação e limpa. */
  consume(action) {
    const v = !!this.actionEdges.get(action);
    if (v) this.actionEdges.set(action, false);
    return v;
  }

  _setEdge(name, val = true) {
    this.actionEdges.set(name, val);
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
      if (k === 'p' || k === 'escape') {
        if (!this.keys.has('pause')) this._setEdge('pause', true);
        this.keys.add('pause');
      }
      if (k === 'enter') {
        if (!this.keys.has('enter')) this._setEdge('enter', true);
        this.keys.add('enter');
      }
      this.keys.add(k);
      this._updateAxesFromKeys();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'p' || k === 'escape') this.keys.delete('pause');
      if (k === 'enter') this.keys.delete('enter');
      this._updateAxesFromKeys();
    });
    window.addEventListener('blur', () => { this.keys.clear(); this._updateAxesFromKeys(); });
  }

  _updateAxesFromKeys() {
    let mx = 0, my = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) mx -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) mx += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) my -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) my += 1;
    // Normaliza diagonais
    if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071; }
    // Se joystick está ativo, sobrescreve
    if (!this.joystickActive) {
      this.moveX = mx;
      this.moveY = my;
    }
    this.fire = this.keys.has(' ') || this.keys.has('space');
  }

  _bindTouch() {
    const c = this.canvas;
    const getPos = (t) => {
      const r = c.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };

    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this._handleTouchStart(t, getPos(t));
    }, { passive: false });

    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this._handleTouchMove(t, getPos(t));
    }, { passive: false });

    c.addEventListener('touchend', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this._handleTouchEnd(t);
    }, { passive: false });

    c.addEventListener('touchcancel', (e) => {
      for (const t of e.changedTouches) this._handleTouchEnd(t);
    });

    // Suporta mouse também para teste em desktop
    let mouseDown = false;
    c.addEventListener('mousedown', (e) => {
      mouseDown = true;
      this._handleTouchStart({ identifier: 'mouse', clientX: e.clientX, clientY: e.clientY },
        { x: e.clientX, y: e.clientY });
    });
    c.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      this._handleTouchMove({ identifier: 'mouse', clientX: e.clientX, clientY: e.clientY },
        { x: e.clientX, y: e.clientY });
    });
    c.addEventListener('mouseup', (e) => {
      mouseDown = false;
      this._handleTouchEnd({ identifier: 'mouse' });
    });
  }

  _handleTouchStart(t, pos) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Lado esquerdo = joystick, direito = fire
    if (pos.x < w * 0.45 && this.joystickTouchId === null) {
      this.joystickTouchId = t.identifier;
      this.joystickActive = true;
      this._updateJoystick(pos);
    } else if (pos.x >= w * 0.45 && this.fireTouchId === null) {
      this.fireTouchId = t.identifier;
      this.fire = true;
    } else if (pos.x >= w * 0.45 && pos.y < h * 0.15) {
      // Toque no topo: pausa
      this._setEdge('pause', true);
    }
  }

  _handleTouchMove(t, pos) {
    if (t.identifier === this.joystickTouchId) this._updateJoystick(pos);
  }

  _handleTouchEnd(t) {
    if (t.identifier === this.joystickTouchId) {
      this.joystickTouchId = null;
      this.joystickActive = false;
      this.moveX = 0;
      this.moveY = 0;
    }
    if (t.identifier === this.fireTouchId) {
      this.fireTouchId = null;
      this.fire = false;
    }
  }

  _updateJoystick(pos) {
    const stick = document.getElementById('joystick-stick');
    const base = document.getElementById('joystick');
    if (!base || !stick) return;
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const maxR = r.width / 2 - 28;
    let dx = pos.x - cx;
    let dy = pos.y - cy;
    const d = Math.hypot(dx, dy);
    if (d > maxR) { dx = dx / d * maxR; dy = dy / d * maxR; }
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.moveX = clamp(dx / maxR, -1, 1);
    this.moveY = clamp(dy / maxR, -1, 1);
  }

  /** Atualiza a cada frame; detecta borda de fire. */
  update() {
    if (this.fire && !this._firePrev) this._fireEdge = true;
    else this._fireEdge = false;
    this._firePrev = this.fire;
    if (this.keys.has('pause')) { this.pause = true; this.keys.delete('pause'); }
    else this.pause = false;
  }

  /** Borda de fire (true uma vez por tiro). */
  fireEdge() { return this._fireEdge; }
}
