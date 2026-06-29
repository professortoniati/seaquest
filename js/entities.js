/* entities.js — entidade base e tipos: Player, Enemy, Bullet, Diver, Pickup, Boss. */

import { rand, clamp, lerp, aabb, dist2 } from './utils.js';

/** Entidade base com posição, velocidade, vida e hitbox. */
export class Entity {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.w = 32; this.h = 32;
    this.angle = 0;
    this.health = 1;
    this.maxHealth = 1;
    this.alive = true;
    this.age = 0;
    this.faction = 'neutral'; // 'player' | 'enemy' | 'neutral'
    this.markedForRemoval = false;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get hitbox() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  hit(damage = 1) {
    this.health -= damage;
    if (this.health <= 0) this.alive = false;
  }
  update(dt) { this.age += dt; }
  draw(ctx) { /* base não desenha */ }
}

/** Submarino do jogador com animações. */
export class Player extends Entity {
  constructor(x, y, world) {
    super(x, y);
    this.world = world;
    this.w = 96; this.h = 44;
    this.faction = 'player';
    this.health = 3;
    this.maxHealth = 3;
    this.oxygen = 100;
    this.maxOxygen = 100;
    this.oxygenDecay = 6; // % por segundo
    this.oxygenRefill = 35;
    this.lives = 3;
    this.score = 0;
    this.rescued = 0;
    this.invuln = 0;
    this.tilt = 0;
    this.enginePhase = 0;
    this.bubbleTimer = rand(0, 1);
    this.cooldown = 0;
    this.fireRate = 0.18;
    this.bullets = [];
    this.dead = false;
    this.surfaceY = 0; // atualizado pelo mundo
    this.flashTimer = 0;
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.health = this.maxHealth;
    this.oxygen = this.maxOxygen;
    this.tilt = 0;
    this.invuln = 0;
    this.dead = false;
    this.cooldown = 0;
    this._dieProcessed = false;
    this.flashTimer = 0;
  }

  update(dt) {
    super.update(dt);
    if (this.dead) return;
    this.enginePhase += dt * 18;
    this.bubbleTimer -= dt;

    // Input via world
    const speed = 360; // pixels/s
    const ix = this.world.input.moveX;
    const iy = this.world.input.moveY;
    // Aceleração suave
    const targetVx = ix * speed;
    const targetVy = iy * speed;
    const accel = 12;
    this.vx = lerp(this.vx, targetVx, 1 - Math.exp(-accel * dt));
    this.vy = lerp(this.vy, targetVy, 1 - Math.exp(-accel * dt));

    // Limites do mundo
    const lim = this.world.bounds();
    this.x = clamp(this.x + this.vx * dt, 4, lim.maxX - this.w - 4);
    // Vertical: pode sair pela superfície (linha d'água)
    const minY = Math.max(this.world.surfaceLine - 18, 4);
    const maxY = lim.maxY - this.h - 4;
    this.y = clamp(this.y + this.vy * dt, minY, maxY);

    // Inclinação durante curva
    const tiltTarget = clamp(this.vx / speed, -1, 1) * 0.18;
    this.tilt = lerp(this.tilt, tiltTarget, 1 - Math.exp(-8 * dt));

    // Tiro
    this.cooldown -= dt;
    if (this.world.input.fireEdge() && this.cooldown <= 0) {
      this.cooldown = this.fireRate;
      this._fire();
    }

    // Bolhas do motor
    if (this.bubbleTimer <= 0) {
      this.bubbleTimer = rand(0.05, 0.22);
      const bx = this.x + 4;
      const by = this.y + this.h * 0.5 + rand(-3, 3);
      this.world.particles.bubble(bx, by, 4);
      if (Math.random() < 0.25) this.world.audio.playBubble();
    }

    // Oxigênio
    // Submarino é subaquático: O2 sempre decai
    // Se está na superfície (y próximo de surfaceLine), recarrega
    const surfaceY = this.world.surfaceLine + 14;
    if (this.y + this.h * 0.5 < surfaceY) {
      this.oxygen = clamp(this.oxygen + this.oxygenRefill * dt, 0, this.maxOxygen);
    } else {
      this.oxygen -= this.oxygenDecay * dt;
      if (this.oxygen <= 0) {
        this.oxygen = 0;
        this.hit(0.05);
        if (this.health <= 0) this._die();
      }
    }

    // Invulnerabilidade
    if (this.invuln > 0) this.invuln -= dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  _fire() {
    const b = new Bullet(this.x + this.w + 6, this.y + this.h * 0.5 - 4, 720, 0, 'player');
    this.bullets.push(b);
    this.world.bullets.push(b);
    this.world.audio.playShoot();
    // Muzzle flash particles
    this.world.particles.emit(this.x + this.w, this.y + this.h * 0.5, 4, {
      vx: rand(60, 200), vy: rand(-30, 30),
      life: 0.18, size: rand(1, 3), color: '255,230,140', type: 'spark', gravity: 50,
    });
  }

  takeDamage(dmg = 1) {
    if (this.invuln > 0 || this.dead) return false;
    this.health -= dmg;
    this.invuln = 1.4;
    this.flashTimer = 0.2;
    this.world.audio.playHit();
    this.world.particles.spark(this.cx, this.cy, '255,140,140');
    this.world.shake = Math.min(1.0, this.world.shake + 0.6);
    if (this.health <= 0) this._die();
    return true;
  }

  _die() {
    if (this.dead) return;
    this.dead = true;
    this.world.particles.explode(this.cx, this.cy, 2, ['255,200,80','255,80,40','255,255,220']);
    this.world.audio.playExplosion();
    this.world.shake = Math.min(1.5, this.world.shake + 1.2);
  }

  /** Desenha o submarino em pseudo-3D com gradientes. */
  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.tilt);

    const blink = this.invuln > 0 && Math.floor(this.age * 18) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.55;
    if (this.flashTimer > 0) ctx.globalAlpha = 0.7;

    const W = this.w, H = this.h;
    const half = W / 2, halfH = H / 2;

    // ====== CORPO PRINCIPAL ======
    // Sombra inferior
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, halfH * 0.85, half * 0.9, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Casco (forma de cápsula alongada)
    const bodyGrad = ctx.createLinearGradient(0, -halfH, 0, halfH);
    bodyGrad.addColorStop(0, '#ffe28a');
    bodyGrad.addColorStop(0.35, '#f6c042');
    bodyGrad.addColorStop(0.6, '#c98621');
    bodyGrad.addColorStop(1, '#7a4e0a');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(-half + 18, -halfH);
    ctx.lineTo(half - 22, -halfH);
    ctx.lineTo(half, 0);
    ctx.lineTo(half - 22, halfH);
    ctx.lineTo(-half + 18, halfH);
    ctx.closePath();
    ctx.fill();

    // Listras horizontais
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(-half + 20, -halfH + 8, W - 44, 3);
    ctx.fillRect(-half + 20, halfH - 11, W - 44, 3);

    // Escotilha
    ctx.fillStyle = '#a86a18';
    ctx.fillRect(-10, -halfH + 4, 16, halfH * 2 - 8);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-8, -halfH + 6, 12, halfH * 2 - 12);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(-6, -halfH + 8, 8, halfH * 2 - 16);

    // Torre de comando
    ctx.fillStyle = '#8c5810';
    ctx.beginPath();
    ctx.moveTo(-22, -halfH);
    ctx.lineTo(-12, -halfH - 12);
    ctx.lineTo(8, -halfH - 12);
    ctx.lineTo(14, -halfH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe28a';
    ctx.beginPath();
    ctx.moveTo(-20, -halfH + 1);
    ctx.lineTo(-12, -halfH - 10);
    ctx.lineTo(6, -halfH - 10);
    ctx.lineTo(12, -halfH + 1);
    ctx.closePath();
    ctx.fill();
    // Janela da torre
    ctx.fillStyle = '#5cc9ff';
    ctx.fillRect(-8, -halfH - 7, 6, 4);
    ctx.fillStyle = '#a8e8ff';
    ctx.fillRect(-8, -halfH - 7, 6, 1);

    // Periscópio
    ctx.strokeStyle = '#3a2c14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -halfH - 12);
    ctx.lineTo(-4, -halfH - 24);
    ctx.moveTo(-4, -halfH - 24);
    ctx.lineTo(2, -halfH - 24);
    ctx.stroke();

    // Brilho metálico
    const glint = ctx.createLinearGradient(-half, 0, -half + 40, 0);
    glint.addColorStop(0, 'rgba(255,255,255,0.4)');
    glint.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(-half + 18, -halfH);
    ctx.lineTo(-half + 50, -halfH);
    ctx.lineTo(-half + 30, 0);
    ctx.closePath();
    ctx.fill();

    // ====== HÉLICE TRASEIRA ======
    const propX = -half - 4;
    const propY = 0;
    ctx.save();
    ctx.translate(propX, propY);
    ctx.rotate(this.enginePhase);
    ctx.fillStyle = '#5a3a0a';
    ctx.strokeStyle = '#2a1a05';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 / 3) * i);
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 14, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd166';
    ctx.fill();
    ctx.restore();

    // Luz de navegação (piscando)
    if (Math.floor(this.age * 2) % 2 === 0) {
      ctx.fillStyle = '#ff5050';
      ctx.beginPath();
      ctx.arc(-half + 10, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#90ff90';
    ctx.beginPath();
    ctx.arc(half - 6, -halfH + 8, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

/** Projétil (torpedo). */
export class Bullet extends Entity {
  constructor(x, y, vx, vy, faction) {
    super(x, y);
    this.w = 16; this.h = 8;
    this.vx = vx; this.vy = vy;
    this.faction = faction;
    this.life = 2.0;
  }
  update(dt) {
    super.update(dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
    // Trail
    if (Math.random() < 0.5) {
      this.world?.particles?.emit(this.x, this.y + this.h / 2, 1, {
        vx: -this.vx * 0.1 + rand(-10, 10), vy: rand(-10, 10),
        life: 0.3, size: rand(1, 3), color: '120,220,255', drag: 0.92, type: 'bubble',
      });
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    // Glow
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0, this.faction === 'player' ? 'rgba(120,220,255,0.6)' : 'rgba(255,80,80,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-16, -16, 32, 32);
    // Corpo do torpedo
    ctx.fillStyle = this.faction === 'player' ? '#9be8ff' : '#ff8a8a';
    ctx.fillRect(-6, -2, 12, 4);
    ctx.fillStyle = this.faction === 'player' ? '#5cc9ff' : '#cc3838';
    ctx.fillRect(4, -3, 2, 6);
    ctx.restore();
  }
}

/** Mergulhador a ser resgatado. */
export class Diver extends Entity {
  constructor(x, y) {
    super(x, y);
    this.w = 18; this.h = 22;
    this.vy = 30; // afunda lentamente
    this.scoreValue = 50;
    this.alive = true;
    this.faction = 'neutral';
    this.frame = 0;
  }
  update(dt) {
    super.update(dt);
    this.y += this.vy * dt;
    this.frame += dt * 3;
    // Limites
    if (this.y > 2000) this.alive = false;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, -4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5cc9ff';
    ctx.fillRect(-1.5, -5, 3, 2);
    // Corpo
    ctx.fillStyle = '#0a2540';
    ctx.beginPath();
    ctx.ellipse(0, 4, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nadando (braços)
    const armPhase = Math.sin(this.frame) * 3;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, 2); ctx.lineTo(-3 - armPhase, 6);
    ctx.moveTo(3, 2); ctx.lineTo(3 + armPhase, 6);
    ctx.stroke();
    // Bolhas
    if (Math.random() < 0.04) {
      this.world?.particles?.bubble(this.x + this.w/2, this.y, 3);
    }
    ctx.restore();
  }
}

/** Inimigo base — tubarões, submarinos, minas, águas-vivas. */
export class Enemy extends Entity {
  constructor(x, y, kind, hp = 1) {
    super(x, y);
    this.kind = kind;
    this.health = hp;
    this.maxHealth = hp;
    this.faction = 'enemy';
    this.dir = -1;
    this.cooldown = 0;
    this.scoreValue = 100;
    this.w = 50; this.h = 30;
    this.amplitude = 0;
    this.frequency = 1;
    this.baseY = y;
    this.phase = rand(0, Math.PI * 2);
  }
  update(dt) {
    super.update(dt);
    this.x += this.vx * dt;
    this.y = this.baseY + Math.sin(this.age * this.frequency + this.phase) * this.amplitude;
    this.cooldown -= dt;
    if (this.x < -200) this.alive = false;
  }
  shoot(target) {
    /* subclasses override */
  }
  drawHealthBar(ctx) {
    if (this.health < this.maxHealth) {
      const pct = this.health / this.maxHealth;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(this.x, this.y - 8, this.w, 4);
      ctx.fillStyle = '#ef476f';
      ctx.fillRect(this.x, this.y - 8, this.w * pct, 4);
    }
  }
  draw(ctx) { /* subclasses override */ }
}

/** Tubarão. */
export class Shark extends Enemy {
  constructor(x, y, speed = 160) {
    super(x, y, 'shark', 1);
    this.w = 64; this.h = 30;
    this.vx = -speed;
    this.scoreValue = 100;
    this.amplitude = rand(10, 40);
    this.frequency = rand(1.0, 2.2);
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.cx, this.cy);
    if (this.vx < 0) ctx.scale(-1, 1);
    // Corpo
    ctx.fillStyle = '#4a5d6e';
    ctx.beginPath();
    ctx.moveTo(-this.w / 2, 0);
    ctx.quadraticCurveTo(-this.w / 4, -this.h / 2, this.w / 2 - 8, -this.h / 3);
    ctx.lineTo(this.w / 2, 0);
    ctx.lineTo(this.w / 2 - 8, this.h / 3);
    ctx.quadraticCurveTo(-this.w / 4, this.h / 2, -this.w / 2, 0);
    ctx.closePath();
    ctx.fill();
    // Barriga branca
    ctx.fillStyle = '#dde6ee';
    ctx.beginPath();
    ctx.moveTo(-this.w / 2 + 5, 1);
    ctx.quadraticCurveTo(-this.w / 4, this.h / 4, this.w / 2 - 12, this.h / 4);
    ctx.lineTo(this.w / 2 - 4, this.h / 8);
    ctx.lineTo(-this.w / 2 + 8, this.h / 8);
    ctx.closePath();
    ctx.fill();
    // Nadadeira
    ctx.fillStyle = '#2e3d4a';
    ctx.beginPath();
    ctx.moveTo(-2, -this.h / 3);
    ctx.lineTo(2, -this.h / 1.2);
    ctx.lineTo(8, -this.h / 3);
    ctx.closePath();
    ctx.fill();
    // Cauda
    ctx.beginPath();
    ctx.moveTo(-this.w / 2 + 4, 0);
    ctx.lineTo(-this.w / 2 - 14, -this.h / 2);
    ctx.lineTo(-this.w / 2 - 6, 0);
    ctx.lineTo(-this.w / 2 - 14, this.h / 2);
    ctx.closePath();
    ctx.fill();
    // Olho
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(this.w / 3, -this.h / 8, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(this.w / 3 + 0.6, -this.h / 8, 1.4, 0, Math.PI * 2); ctx.fill();
    // Boca com dentes
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(this.w / 2 - 6, this.h / 6);
    ctx.lineTo(this.w / 2 - 1, this.h / 12);
    ctx.stroke();
    // Brilho na água
    ctx.strokeStyle = 'rgba(120,180,220,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-this.w / 4, -this.h / 2 - 2);
    ctx.lineTo(-this.w / 4 + 10, -this.h / 2 - 4);
    ctx.stroke();
    ctx.restore();
    this.drawHealthBar(ctx);
  }
}

/** Submarino inimigo — atira no jogador. */
export class EnemySub extends Enemy {
  constructor(x, y, speed = 100) {
    super(x, y, 'sub', 3);
    this.w = 88; this.h = 38;
    this.vx = -speed;
    this.scoreValue = 200;
    this.amplitude = rand(20, 60);
    this.frequency = rand(0.6, 1.4);
    this.fireRate = 1.4;
    this.cooldown = rand(0.5, 2.5);
  }
  shoot(target, bullets) {
    if (this.cooldown > 0) return;
    if (target && Math.abs(target.cy - this.cy) < 250) {
      const b = new Bullet(this.x - 8, this.y + this.h / 2 - 4, -520, 0, 'enemy');
      bullets.push(b);
      this.cooldown = this.fireRate;
      this.world?.particles?.emit(this.x - 4, this.y + this.h / 2, 3, {
        vx: -rand(40, 100), vy: rand(-20, 20),
        life: 0.18, size: rand(1, 2), color: '255,160,140', type: 'spark',
      });
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.fillStyle = '#3a2828';
    ctx.beginPath();
    ctx.moveTo(this.w / 2, 0);
    ctx.lineTo(this.w / 2 - 16, -this.h / 2);
    ctx.lineTo(-this.w / 2 + 16, -this.h / 2);
    ctx.lineTo(-this.w / 2, 0);
    ctx.lineTo(-this.w / 2 + 16, this.h / 2);
    ctx.lineTo(this.w / 2 - 16, this.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6c3838';
    ctx.beginPath();
    ctx.moveTo(this.w / 2 - 4, 0);
    ctx.lineTo(this.w / 2 - 16, -this.h / 2 + 4);
    ctx.lineTo(-this.w / 2 + 18, -this.h / 2 + 4);
    ctx.lineTo(-this.w / 2 + 4, 0);
    ctx.lineTo(-this.w / 2 + 18, this.h / 2 - 4);
    ctx.lineTo(this.w / 2 - 16, this.h / 2 - 4);
    ctx.closePath();
    ctx.fill();
    // Torre
    ctx.fillStyle = '#2a1818';
    ctx.fillRect(-12, -this.h / 2 - 10, 22, 10);
    ctx.fillStyle = '#ff5050';
    ctx.fillRect(-10, -this.h / 2 - 8, 4, 6);
    ctx.fillStyle = '#90ff90';
    ctx.fillRect(2, -this.h / 2 - 8, 4, 6);
    // Hélice
    ctx.fillStyle = '#3a2828';
    ctx.save();
    ctx.translate(this.w / 2 + 2, 0);
    ctx.rotate(this.age * 12);
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 / 3) * i);
      ctx.fillRect(-2, -8, 4, 16);
      ctx.restore();
    }
    ctx.restore();
    ctx.restore();
    this.drawHealthBar(ctx);
  }
}

/** Mina estática que explode quando próximo. */
export class Mine extends Enemy {
  constructor(x, y) {
    super(x, y, 'mine', 1);
    this.w = 30; this.h = 30;
    this.vx = -50;
    this.scoreValue = 150;
    this.amplitude = rand(0, 6);
    this.frequency = rand(0.5, 1.5);
    this.pulse = 0;
  }
  update(dt) {
    super.update(dt);
    this.pulse += dt;
  }
  draw(ctx) {
    const s = 1 + Math.sin(this.pulse * 4) * 0.06;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.scale(s, s);
    // Esfera
    const g = ctx.createRadialGradient(-4, -4, 0, 0, 0, 16);
    g.addColorStop(0, '#888');
    g.addColorStop(1, '#222');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    // Espinhos
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
      ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
      ctx.stroke();
    }
    // Brilho
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(-5, -5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Água-viva — atravessa devagar, dano de contato. */
export class Jellyfish extends Enemy {
  constructor(x, y) {
    super(x, y, 'jelly', 1);
    this.w = 36; this.h = 48;
    this.vx = -40;
    this.scoreValue = 120;
    this.amplitude = rand(20, 50);
    this.frequency = rand(0.4, 0.9);
    this.baseY = y;
    this.pulse = 0;
  }
  update(dt) {
    super.update(dt);
    this.pulse += dt * 2;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.cx, this.cy);
    const pulse = 1 + Math.sin(this.pulse) * 0.12;
    ctx.scale(pulse, 1);
    // Sino
    const g = ctx.createRadialGradient(0, -10, 0, 0, 0, 20);
    g.addColorStop(0, 'rgba(220,160,255,0.9)');
    g.addColorStop(1, 'rgba(120,60,180,0.7)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -6, 16, Math.PI, 0);
    ctx.lineTo(14, -2);
    ctx.quadraticCurveTo(0, 4, -14, -2);
    ctx.closePath();
    ctx.fill();
    // Tentáculos
    ctx.strokeStyle = 'rgba(220,160,255,0.7)';
    ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      const sx = i * 4;
      ctx.moveTo(sx, 0);
      let y = 0;
      for (let k = 0; k < 5; k++) {
        y += 6;
        const xo = Math.sin(this.age * 3 + i + k * 0.4) * 4;
        ctx.lineTo(sx + xo, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Chefão — submarino gigante. */
export class Boss extends Enemy {
  constructor(x, y) {
    super(x, y, 'boss', 30);
    this.w = 220; this.h = 90;
    this.vx = -40;
    this.scoreValue = 5000;
    this.amplitude = 30;
    this.frequency = 0.6;
    this.cooldown = 1.5;
    this.fireRate = 0.7;
    this.entered = false;
    this.entryX = 120;
  }
  update(dt) {
    if (!this.entered) {
      this.x += this.vx * dt;
      if (this.x <= this.entryX) { this.entered = true; this.vx = 0; }
    } else {
      // Oscilação suave no centro-esquerda
      this.x = this.entryX + Math.sin(this.age * 0.6) * 50;
      this.baseY = 320 + Math.sin(this.age * 0.4) * 40;
    }
    this.y = this.baseY + Math.sin(this.age * this.frequency + this.phase) * this.amplitude;
    this.cooldown -= dt;
    if (this.x < -300) this.alive = false;
  }
  shoot(target, bullets) {
    if (!this.entered || this.cooldown > 0) return;
    // Disparo em 3 direções
    const cx = this.x;
    const cy = this.y + this.h / 2;
    const angles = [-0.3, 0, 0.3];
    angles.forEach(a => {
      const sp = 380;
      const b = new Bullet(cx - 10, cy - 6, -Math.cos(a) * sp, Math.sin(a) * sp, 'enemy');
      b.w = 20; b.h = 10;
      bullets.push(b);
    });
    this.cooldown = this.fireRate;
    this.world?.particles?.emit(cx - 6, cy, 5, {
      vx: -rand(60, 140), vy: rand(-30, 30),
      life: 0.2, size: rand(1, 3), color: '255,140,120', type: 'spark',
    });
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.cx, this.cy);
    // Casco
    const g = ctx.createLinearGradient(0, -this.h/2, 0, this.h/2);
    g.addColorStop(0, '#7a2a2a');
    g.addColorStop(0.5, '#3a1010');
    g.addColorStop(1, '#1a0606');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(this.w / 2, 0);
    ctx.lineTo(this.w / 2 - 30, -this.h / 2);
    ctx.lineTo(-this.w / 2 + 30, -this.h / 2);
    ctx.lineTo(-this.w / 2, 0);
    ctx.lineTo(-this.w / 2 + 30, this.h / 2);
    ctx.lineTo(this.w / 2 - 30, this.h / 2);
    ctx.closePath();
    ctx.fill();
    // Revestimento
    ctx.fillStyle = '#5a1a1a';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(-this.w/2 + 30 + i * 38, -this.h/2 + 4, 28, this.h - 8);
    }
    // Torre
    ctx.fillStyle = '#2a0808';
    ctx.fillRect(-30, -this.h / 2 - 28, 60, 28);
    ctx.fillStyle = '#ff3030';
    ctx.fillRect(-24, -this.h / 2 - 24, 8, 20);
    ctx.fillStyle = '#30ff30';
    ctx.fillRect(-4, -this.h / 2 - 24, 8, 20);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(16, -this.h / 2 - 22, 6, 16);
    // Canhão frontal
    ctx.fillStyle = '#1a0606';
    ctx.fillRect(-this.w/2 - 28, -6, 28, 12);
    // Brilho
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(this.w / 2, 0);
    ctx.lineTo(this.w / 2 - 30, -this.h / 2);
    ctx.lineTo(this.w / 2 - 60, -this.h / 3);
    ctx.lineTo(this.w / 2 - 30, 0);
    ctx.closePath();
    ctx.fill();
    // Hélice
    ctx.save();
    ctx.translate(this.w / 2 + 4, 0);
    ctx.rotate(this.age * 14);
    ctx.fillStyle = '#3a1010';
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 / 4) * i);
      ctx.fillRect(-3, -14, 6, 28);
      ctx.restore();
    }
    ctx.restore();
    ctx.restore();
    this.drawHealthBar(ctx);
  }
}

/** Pickup de oxigênio. */
export class OxygenPickup extends Entity {
  constructor(x, y) {
    super(x, y);
    this.w = 22; this.h = 22;
    this.faction = 'neutral';
    this.scoreValue = 30;
    this.bob = rand(0, Math.PI * 2);
  }
  update(dt) {
    super.update(dt);
    this.x += this.vx * dt;
    this.vy = Math.sin(this.age * 3 + this.bob) * 8;
    this.y += this.vy * dt;
    if (this.x < -50) this.alive = false;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.cx, this.cy + Math.sin(this.age * 3 + this.bob) * 3);
    // Brilho
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
    g.addColorStop(0, 'rgba(120,255,180,0.7)');
    g.addColorStop(1, 'rgba(120,255,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-18, -18, 36, 36);
    // Cilindro O2
    ctx.fillStyle = '#06d6a0';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#003822';
    ctx.fillRect(-2, -10, 4, 4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('O₂', 0, 1);
    ctx.restore();
  }
}
