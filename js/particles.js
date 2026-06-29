/* particles.js — sistema de partículas: bolhas, explosões, faíscas, ondulações. */

import { rand, lerp, hsl, Pool, aabb } from './utils.js';

/** Classe base de partícula. */
class Particle {
  constructor() { this.alive = false; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; }
  __reset(x, y, vx, vy, life, opts = {}) {
    this.alive = true;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.size = opts.size ?? rand(2, 6);
    this.color = opts.color ?? '255,255,255';
    this.alpha = opts.alpha ?? 1;
    this.fade = opts.fade ?? 1; // multiplicador de fade
    this.gravity = opts.gravity ?? 0;
    this.drag = opts.drag ?? 0.98;
    this.grow = opts.grow ?? 0;
    this.rotation = 0;
    this.rotationSpeed = opts.rotationSpeed ?? 0;
    this.type = opts.type ?? 'circle';
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.alive = false; return; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.vx *= Math.pow(this.drag, dt * 60);
    this.vy *= Math.pow(this.drag, dt * 60);
    this.size += this.grow * dt;
    if (this.rotationSpeed) this.rotation += this.rotationSpeed * dt;
  }
  draw(ctx) {
    const a = this.alpha * (this.life / this.maxLife) * this.fade;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.translate(this.x, this.y);
    if (this.rotation) ctx.rotate(this.rotation);
    ctx.fillStyle = `rgba(${this.color},1)`;
    if (this.type === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.1, this.size), 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'spark') {
      ctx.fillRect(-this.size, -this.size * 0.3, this.size * 2, this.size * 0.6);
    } else if (this.type === 'ring') {
      ctx.strokeStyle = `rgba(${this.color},1)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.size, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.type === 'square') {
      ctx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
    } else if (this.type === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? this.size : this.size * 0.5;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Gerenciador de partículas. */
export class ParticleSystem {
  constructor(capacity = 600, quality = 'medium') {
    this.pool = new Pool(() => new Particle(), capacity);
    this.capacity = capacity;
    this.qualityMul = quality === 'high' ? 1 : quality === 'low' ? 0.4 : 0.7;
  }
  setQuality(q) { this.qualityMul = q === 'high' ? 1 : q === 'low' ? 0.4 : 0.7; }

  emit(x, y, count, opts) {
    const n = Math.max(1, Math.floor(count * this.qualityMul));
    for (let i = 0; i < n; i++) {
      const p = this.pool.acquire();
      const a = opts.angle ?? rand(0, Math.PI * 2);
      const sp = opts.speed ?? rand(20, 120);
      const vx = Math.cos(a) * sp + (opts.vx ?? 0);
      const vy = Math.sin(a) * sp + (opts.vy ?? 0);
      const life = opts.life ?? rand(0.4, 1.0);
      p.__reset(x, y, vx, vy, life, {
        size: opts.size ?? rand(2, 6),
        color: opts.color ?? '255,255,255',
        alpha: opts.alpha ?? 1,
        gravity: opts.gravity ?? 0,
        drag: opts.drag ?? 0.97,
        grow: opts.grow ?? 0,
        rotationSpeed: opts.rotationSpeed ?? 0,
        type: opts.type ?? 'circle',
        fade: 1,
      });
    }
  }

  /** Explosão típica: faíscas + anel + fumaça. */
  explode(x, y, scale = 1, palette = null) {
    const colors = palette ?? ['255,180,60','255,90,40','255,255,200','220,90,40'];
    // Faíscas
    for (let i = 0; i < 18 * scale; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 280) * scale;
      this.emit(x, y, 1, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.4, 0.9),
        size: rand(2, 4),
        color: pick(colors),
        gravity: 80,
        drag: 0.92,
        type: 'spark',
      });
    }
    // Anéis de choque
    this.emit(x, y, 2, {
      size: 4, color: '255,220,120', life: 0.55,
      gravity: 0, drag: 1, grow: 140 * scale, type: 'ring', alpha: 0.7,
    });
    // Fumaça
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      this.emit(x, y, 1, {
        vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 20,
        life: rand(0.8, 1.6),
        size: rand(4, 8),
        color: '60,60,70', gravity: -10, drag: 0.94, type: 'circle',
      });
    }
  }

  /** Bolha que sobe. */
  bubble(x, y, size = 4) {
    this.emit(x, y, 1, {
      vx: rand(-8, 8), vy: rand(-50, -25),
      life: rand(0.8, 1.8),
      size: rand(2, size),
      color: '180,230,255',
      drag: 0.99, type: 'circle',
    });
  }

  /** Faísca curta (colisão). */
  spark(x, y, color = '255,255,200') {
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, 160);
      this.emit(x, y, 1, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.2, 0.5),
        size: rand(1, 3),
        color, gravity: 100, drag: 0.92, type: 'spark',
      });
    }
  }

  /** Estrelas de coleta. */
  collect(x, y, color = '255,230,120') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const sp = 90;
      this.emit(x, y, 1, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5, size: 2.5, color, gravity: 0, drag: 0.94, type: 'star',
      });
    }
  }

  /** Splash ao emergir. */
  splash(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + rand(-Math.PI / 2.2, Math.PI / 2.2);
      const sp = rand(60, 200);
      this.emit(x, y, 1, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.4, 0.8),
        size: rand(2, 5),
        color: '200,240,255',
        gravity: 240, drag: 0.97, type: 'circle',
      });
    }
    this.emit(x, y, 1, { size: 5, color: '180,220,255', life: 0.4, grow: 120, type: 'ring', alpha: 0.7 });
  }

  update(dt) {
    for (const p of this.pool.active()) p.update(dt);
    // Libera mortos
    for (let i = this.pool.busy.length - 1; i >= 0; i--) {
      if (!this.pool.busy[i].alive) this.pool.release(this.pool.busy[i]);
    }
  }

  draw(ctx) {
    for (const p of this.pool.active()) p.draw(ctx);
  }

  clear() { this.pool.clear(); }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
