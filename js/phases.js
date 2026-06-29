/* phases.js — definições de cada fase: spawns, duração, dificuldade, chefão. */

import { rand, randInt } from './utils.js';
import { Shark, EnemySub, Mine, Jellyfish, OxygenPickup, Diver, Boss } from './entities.js';

export class PhaseManager {
  constructor(world) {
    this.world = world;
    this.phaseIndex = 0;
    this.elapsed = 0;
    this.duration = 90; // segundos
    this.spawnTimer = 0;
    this.pickupTimer = 0;
    this.diverTimer = 0;
    this.bossSpawned = false;
    this.bossActive = false;
    this.ended = false;
    this.phaseCompleted = false;
  }

  load(index) {
    this.phaseIndex = index;
    this.elapsed = 0;
    this.spawnTimer = 2;
    this.pickupTimer = 6;
    this.diverTimer = 4;
    this.bossSpawned = false;
    this.bossActive = false;
    this.ended = false;
    this.phaseCompleted = false;

    // Configs por fase
    const cfg = PHASES[index] || PHASES[0];
    this.duration = cfg.duration;
    this.difficulty = cfg.difficulty;
    this.scrollSpeed = cfg.scrollSpeed;
  }

  update(dt, enemies, pickups, divers, bullets) {
    this.elapsed += dt;
    this.spawnTimer -= dt;
    this.pickupTimer -= dt;
    this.diverTimer -= dt;

    if (!this.bossActive && this.elapsed < this.duration) {
      // Spawns contínuos
      if (this.spawnTimer <= 0) this._spawnEnemyWave(enemies);
      if (this.pickupTimer <= 0) this._spawnPickup(pickups);
      if (this.diverTimer <= 0) this._spawnDivers(divers);
    } else if (!this.bossSpawned && this.elapsed >= this.duration) {
      this._spawnBoss(enemies);
      this.bossSpawned = true;
      this.bossActive = true;
    }

    // Verifica conclusão
    if (this.bossActive && this.phaseCompleted) {
      this.ended = true;
    } else if (this.elapsed > this.duration + 30) {
      // Timeout do boss
      this.ended = true;
    }
  }

  notifyBossDefeated() {
    if (this.bossActive) this.phaseCompleted = true;
  }

  _spawnEnemyWave(enemies) {
    const cfg = PHASES[this.phaseIndex] || PHASES[0];
    const x = this.world.width + 100;
    const d = this.difficulty;
    // Probabilidades
    const r = Math.random();
    if (r < 0.45) {
      // 1-2 tubarões
      const n = randInt(1, 1 + Math.floor(d));
      for (let i = 0; i < n; i++) {
        const y = rand(this.world.surfaceLine + 80, this.world.bounds().maxY - 60);
        const sp = cfg.scrollSpeed + rand(40, 120);
        enemies.push(new Shark(x + i * 70, y, sp));
      }
    } else if (r < 0.7) {
      // Submarino inimigo
      const y = rand(this.world.surfaceLine + 100, this.world.bounds().maxY - 100);
      enemies.push(new EnemySub(x, y, cfg.scrollSpeed * 0.8 + 30));
    } else if (r < 0.85) {
      // Mina
      const y = rand(this.world.surfaceLine + 60, this.world.bounds().maxY - 60);
      enemies.push(new Mine(x, y));
    } else {
      // Água-viva (mais em fases profundas)
      const y = rand(this.world.surfaceLine + 80, this.world.bounds().maxY - 80);
      enemies.push(new Jellyfish(x, y));
    }
    this.spawnTimer = rand(0.7, 2.0) / (1 + d * 0.2);
  }

  _spawnPickup(pickups) {
    const x = this.world.width + 60;
    const y = rand(this.world.surfaceLine + 80, this.world.bounds().maxY - 80);
    pickups.push(new OxygenPickup(x, y));
    this.pickupTimer = rand(8, 14);
  }

  _spawnDivers(divers) {
    const cfg = PHASES[this.phaseIndex] || PHASES[0];
    const count = randInt(1, Math.min(3, 1 + cfg.difficulty));
    for (let i = 0; i < count; i++) {
      const y = rand(this.world.surfaceLine + 30, this.world.surfaceLine + 200);
      const d = new Diver(this.world.width * 0.7 + i * 30, y);
      divers.push(d);
    }
    this.diverTimer = rand(2.5, 5.5);
  }

  _spawnBoss(enemies) {
    const y = this.world.bounds().maxY * 0.55;
    const boss = new Boss(this.world.width + 100, y);
    enemies.push(boss);
    this.world.audio.playVictory?.(); // toque aviso seria melhor
  }
}

export const PHASES = [
  {
    name: 'ÁGUAS RASA',
    duration: 70,
    difficulty: 1,
    scrollSpeed: 130,
    description: 'Recifes tropicais — perigo moderado.',
  },
  {
    name: 'PROFUNDIDADE',
    duration: 80,
    difficulty: 2,
    scrollSpeed: 170,
    description: 'Zona crepuscular — cuidado com submarinos.',
  },
  {
    name: 'ABISMO',
    duration: 90,
    difficulty: 3,
    scrollSpeed: 210,
    description: 'Escuridão total — apenas os mais bravos.',
  },
];

export const PHASE_TIPS = [
  'DICA: Tubarões circulam em padrões sinusoidais.',
  'DICA: Submarinos inimigos disparam torpedos — desvie!',
  'DICA: O₂ recupera quando o casco rompe a superfície.',
  'DICA: Mergulhadores valem pontos extras.',
];
