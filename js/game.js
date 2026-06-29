/* game.js — orquestrador principal: loop, estado, colisão, spawn, pontuação. */

import { clamp, lerp, aabb, dist2, rand, wait } from './utils.js';
import { Player, Bullet, Shark, EnemySub, Mine, Jellyfish, OxygenPickup, Diver, Boss } from './entities.js';
import { ParallaxBackground, makePhaseTheme } from './parallax.js';
import { ParticleSystem } from './particles.js';
import { PhaseManager, PHASES, PHASE_TIPS } from './phases.js';

export const STATES = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameover',
  VICTORY: 'victory',
  PHASE_TRANSITION: 'transition',
};

export class Game {
  constructor(canvas, input, audio, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.audio = audio;
    this.ui = ui;

    this.width = 0;
    this.height = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.state = STATES.MENU;
    this.previousState = null;

    this.player = null;
    this.enemies = [];
    this.pickups = [];
    this.divers = [];
    this.bullets = [];
    this.particles = new ParticleSystem(800, 'medium');

    this.phaseIndex = 0;
    this.phaseManager = new PhaseManager(this);
    this.background = null;

    this.surfaceLine = 0;
    this.scrollX = 0;
    this.scrollSpeed = 130;
    this.shake = 0;
    this.shakeDecay = 3;

    this.transitionTimer = 0;
    this.transitionDuration = 2.5;

    this.lastTime = 0;
    this.accumulator = 0;
    this.fixedDt = 1 / 60;
    this.maxFrameDt = 0.1;
    this.fps = 60;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.fpsTimer = 0;

    this.transitionMessage = '';

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Recalcula superfície (relativa à tela)
    this.surfaceLine = h * 0.18;
    if (this.background) {
      this.background.resize(w, h);
    }
  }

  bounds() {
    return { maxX: this.width, maxY: this.height };
  }

  /** === ESTADO === */

  startNewGame() {
    this.player = new Player(80, this.height * 0.5, this);
    this.player.lives = 3;
    this.player.score = 0;
    this.player.rescued = 0;
    this.enemies = [];
    this.pickups = [];
    this.divers = [];
    this.bullets = [];
    this.particles.clear();
    this.phaseIndex = 0;
    this._loadPhase(0);
    this.state = STATES.PLAYING;
    this.ui.showHud(true);
    this.ui.hideOverlay();
    this.audio.startMusic();
    this.audio.startAmbient();
    this.transitionMessage = `FASE 1: ${PHASES[0].name}`;
    this._showTransition();
  }

  startPhase(index) {
    this.phaseIndex = index;
    this._loadPhase(index);
    this.state = STATES.PLAYING;
    this.ui.showHud(true);
    this.ui.hideOverlay();
    this.audio.startMusic();
    this.transitionMessage = `FASE ${index + 1}: ${PHASES[index].name}`;
    this._showTransition();
  }

  _loadPhase(index) {
    const theme = makePhaseTheme(index, this.particles.qualityMul > 0.7 ? 'high' : 'medium');
    if (!this.background) this.background = new ParallaxBackground(theme, this.width, this.height);
    else this.background = new ParallaxBackground(theme, this.width, this.height);
    this.phaseManager.load(index);
    this.scrollSpeed = PHASES[index].scrollSpeed;
    this.enemies = [];
    this.pickups = [];
    this.divers = [];
    this.bullets = [];
    // Mantém player
    if (this.player) {
      this.player.reset(80, this.height * 0.5);
      this.player.health = Math.min(this.player.health + 1, this.player.maxHealth);
    }
  }

  restartPhase() {
    this._loadPhase(this.phaseIndex);
    this.state = STATES.PLAYING;
    this.ui.hideOverlay();
    this.ui.showHud(true);
  }

  restartGame() {
    this.startNewGame();
  }

  goToMenu() {
    this.state = STATES.MENU;
    this.ui.showHud(false);
    this.ui.showMenu();
    this.audio.stopMusic();
  }

  exitToMenu() {
    this.goToMenu();
  }

  pause() {
    if (this.state === STATES.PLAYING) {
      this.previousState = this.state;
      this.state = STATES.PAUSED;
      this.ui.togglePause(true);
      this.audio.suspend();
    }
  }

  resume() {
    if (this.state === STATES.PAUSED) {
      this.state = STATES.PLAYING;
      this.ui.togglePause(false);
      this.audio.resume();
      this.lastTime = performance.now();
    }
  }

  _showTransition() {
    this.state = STATES.PHASE_TRANSITION;
    this.transitionTimer = this.transitionDuration;
  }

  _advancePhase() {
    if (this.phaseIndex + 1 < PHASES.length) {
      this.phaseIndex++;
      this.ui.completedPhases.add(this.phaseIndex - 1);
      if (this.phaseIndex + 1 > this.ui.unlockedPhases) this.ui.unlockedPhases = this.phaseIndex + 1;
      this._loadPhase(this.phaseIndex);
      this.transitionMessage = `FASE ${this.phaseIndex + 1}: ${PHASES[this.phaseIndex].name}`;
      this._showTransition();
    } else {
      // Vitória total
      this._victory();
    }
  }

  _gameOver() {
    this.state = STATES.GAME_OVER;
    this.ui.showGameOver(this.player.score, this.phaseIndex + 1, this.player.rescued);
    this.ui.showHud(false);
    this.audio.stopMusic();
    this.audio.playGameOver();
  }

  _victory() {
    this.state = STATES.VICTORY;
    this.ui.showVictory(this.player.score, this.player.rescued);
    this.ui.showHud(false);
    this.audio.stopMusic();
    this.audio.playVictory();
  }

  /** === LOOP PRINCIPAL === */
  loop = (now) => {
    requestAnimationFrame(this.loop);
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > this.maxFrameDt) dt = this.maxFrameDt;

    // FPS counter
    this.fpsAccum += dt;
    this.fpsFrames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.fpsTimer = 0;
      this.ui.updateFps(this.fps);
    }

    // Atualiza input mesmo em estados não-jogáveis (para tratar pause/unpause via teclado)
    this.input.update();
    if (this.state === STATES.PLAYING && (this.input.consume('pause') || this.input.pause)) {
      this.pause();
    }

    if (this.state === STATES.PAUSED) {
      // Permite despausar via teclado
      if (this.input.consume('pause') || this.input.consume('enter') || this.input.pause) {
        this.resume();
      }
      this._render();
      return;
    }
    if (this.state === STATES.MENU || this.state === STATES.GAME_OVER || this.state === STATES.VICTORY) {
      this._render();
      return;
    }

    if (this.state === STATES.PHASE_TRANSITION) {
      this.transitionTimer -= dt;
      // Continua atualizando fundo e player parado
      this.background.update(dt, 0);
      if (this.player) this.player.update(dt * 0.3);
      this.particles.update(dt);
      this._render();
      if (this.transitionTimer <= 0) {
        this.state = STATES.PLAYING;
      }
      return;
    }

    // PLAYING
    this._update(dt);
    this._render();
  };

  _update(dt) {
    // Player update
    this.player.update(dt);

    // Oxigênio chegou a zero e matou player
    if (this.player.dead && this.player._dieProcessed !== true) {
      this.player._dieProcessed = true;
      this._handlePlayerDeath();
    }

    // Camera shake decai
    this.shake = Math.max(0, this.shake - this.shakeDecay * dt);

    // Spawns da fase
    this.phaseManager.update(dt, this.enemies, this.pickups, this.divers, this.bullets);

    // Update inimigos
    for (const e of this.enemies) {
      e.update(dt);
      if (e.shoot) e.shoot(this.player, this.bullets);
    }
    for (const p of this.pickups) p.update(dt);
    for (const d of this.divers) d.update(dt);
    for (const b of this.bullets) {
      b.world = this; // injetar para trail particles
      b.update(dt);
    }

    // Colisões
    this._handleCollisions();

    // Limpeza
    this._cleanup();

    // Score por tempo
    this.player.score += Math.floor(dt * 5);

    // Boss derrotado?
    if (this.phaseManager.bossActive) {
      const aliveBoss = this.enemies.some(e => e instanceof Boss && e.alive);
      if (!aliveBoss && !this.phaseManager.phaseCompleted) {
        this.phaseManager.notifyBossDefeated();
      }
    }

    // Fase concluída?
    if (this.phaseManager.ended) {
      this._advancePhase();
    }

    // Player saiu da tela horizontalmente? Perde vida
    if (this.player.x > this.width + 50) {
      // Permitido: ele pode ficar na direita para coletar pickups
    }

    // HUD update
    this.ui.updateHud();
  }

  _handlePlayerDeath() {
    setTimeout(() => {
      this.player.lives -= 1;
      if (this.player.lives <= 0) {
        this._gameOver();
        return;
      }
      // Respawn
      this.player.reset(80, this.height * 0.5);
      this.player.invuln = 2.5;
      // Limpa projéteis inimigos próximos
      this.bullets = this.bullets.filter(b => b.faction !== 'enemy');
    }, 1200);
  }

  _handleCollisions() {
    const p = this.player;
    // Bullets do player x inimigos
    for (const b of this.bullets) {
      if (!b.alive || b.faction !== 'player') continue;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (aabb(b.hitbox, e.hitbox)) {
          e.hit(1);
          b.alive = false;
          this.particles.spark(b.cx, b.cy, '255,255,180');
          this.audio.playHit();
          if (!e.alive) {
            this._onEnemyKilled(e);
          }
        }
      }
    }
    // Bullets inimigas x player
    for (const b of this.bullets) {
      if (!b.alive || b.faction !== 'enemy') continue;
      if (aabb(b.hitbox, p.hitbox)) {
        b.alive = false;
        p.takeDamage(1);
        this.particles.spark(b.cx, b.cy, '255,140,140');
      }
    }
    // Inimigos x player (contato)
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (aabb(e.hitbox, p.hitbox)) {
        if (e instanceof Mine) {
          // Mina explode
          this.particles.explode(e.cx, e.cy, 1.6);
          this.audio.playExplosion();
          e.alive = false;
          p.takeDamage(2);
          this.shake = Math.min(1.2, this.shake + 0.8);
        } else if (e instanceof Jellyfish) {
          // Dano leve, empurra
          p.takeDamage(0.4);
          e.alive = false;
          this.particles.spark(e.cx, e.cy, '220,160,255');
        } else {
          p.takeDamage(1);
          e.alive = false;
          this._onEnemyKilled(e);
        }
      }
    }
    // Pickups
    for (const o of this.pickups) {
      if (!o.alive) continue;
      if (aabb(o.hitbox, p.hitbox)) {
        o.alive = false;
        if (o instanceof OxygenPickup) {
          p.oxygen = clamp(p.oxygen + 40, 0, p.maxOxygen);
          this.audio.playOxygen();
          this.particles.collect(o.cx, o.cy, '120,255,180');
          p.score += 30;
        }
      }
    }
    // Mergulhadores
    for (const d of this.divers) {
      if (!d.alive) continue;
      if (aabb(d.hitbox, p.hitbox)) {
        d.alive = false;
        p.rescued += 1;
        p.score += 50;
        this.audio.playRescue();
        this.particles.collect(d.cx, d.cy, '255,230,120');
        // Splash de bolhas
        for (let i = 0; i < 8; i++) this.particles.bubble(d.x + rand(0, d.w), d.y + rand(0, d.h), 4);
      }
    }
    // Resgate na superfície: bônus
    if (p.rescued > 0 && p.y < this.surfaceLine + 10) {
      // Apenas um "resgate" simbólico — mas o resgate real é contato
    }
  }

  _onEnemyKilled(e) {
    let baseScore = e.scoreValue || 100;
    if (e instanceof Boss) {
      baseScore = 5000;
      this.audio.playExplosion();
      this.particles.explode(e.cx, e.cy, 3, ['255,180,60','255,90,40','255,255,200']);
      this.shake = Math.min(1.5, this.shake + 1.0);
    } else {
      this.particles.explode(e.cx, e.cy, 1, ['255,200,80','255,90,40','255,255,200']);
    }
    this.player.score += baseScore;
    // Combo flash
    this.particles.collect(e.cx, e.cy, '255,230,120');
  }

  _cleanup() {
    const isAlive = (o) => o.alive;
    this.enemies = this.enemies.filter(isAlive);
    this.pickups = this.pickups.filter(isAlive);
    this.divers = this.divers.filter(isAlive);
    this.bullets = this.bullets.filter(isAlive);
  }

  /** === RENDER === */
  _render() {
    const ctx = this.ctx;
    const w = this.width, h = this.height;

    // Camera shake
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake * 12;
      sy = (Math.random() - 0.5) * this.shake * 12;
    }
    ctx.save();
    ctx.translate(sx, sy);

    // Fundo
    if (this.background) {
      this.background.draw(ctx);
      this.background.drawSurface(ctx, w, h);
    } else {
      ctx.fillStyle = '#001020';
      ctx.fillRect(0, 0, w, h);
    }

    // Linha de superfície animada (corte)
    if (this.background) {
      this._drawSurfaceLine(ctx, w);
    }

    // Entidades
    // Ordem: pickups, divers, enemies, player, bullets
    for (const p of this.pickups) p.draw(ctx);
    for (const d of this.divers) d.draw(ctx);
    for (const e of this.enemies) e.draw(ctx);
    if (this.player && !this.player.dead) this.player.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);

    // Partículas
    this.particles.draw(ctx);

    // Overlay de transição de fase
    if (this.state === STATES.PHASE_TRANSITION) {
      const t = clamp(1 - this.transitionTimer / this.transitionDuration, 0, 1);
      // fade in/out
      let alpha;
      if (t < 0.3) alpha = t / 0.3;
      else if (t < 0.7) alpha = 1;
      else alpha = (1 - t) / 0.3;
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.55})`;
      ctx.fillRect(0, 0, w, h);
      if (alpha > 0.05) {
        ctx.fillStyle = `rgba(255,209,102,${alpha})`;
        ctx.font = 'bold 36px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.transitionMessage, w / 2, h / 2);
        // Dica
        ctx.fillStyle = `rgba(200,220,255,${alpha * 0.7})`;
        ctx.font = '16px Trebuchet MS';
        ctx.fillText(PHASE_TIPS[this.phaseIndex] || '', w / 2, h / 2 + 36);
      }
    }

    // Pause overlay (sobre o jogo)
    if (this.state === STATES.PAUSED) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  _drawSurfaceLine(ctx, w) {
    const t = this.background.time;
    const sy = this.surfaceLine;
    // Linha animada
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const yo = sy + Math.sin((x + t * 80) * 0.05) * 2.4;
      if (x === 0) ctx.moveTo(x, yo); else ctx.lineTo(x, yo);
    }
    ctx.stroke();
    // Espuma
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const yo = sy + 6 + Math.sin((x + t * 60) * 0.04) * 2;
      if (x === 0) ctx.moveTo(x, yo); else ctx.lineTo(x, yo);
    }
    ctx.stroke();
  }

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }
}
