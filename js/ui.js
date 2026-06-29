/* ui.js — gerencia HUD, overlays e navegação entre telas. */

import { pad } from './utils.js';

const $ = (id) => document.getElementById(id);

export class UIManager {
  constructor(game) {
    this.game = game;
    this.hud = $('hud');
    this.overlay = $('overlay');
    this.mobile = $('mobile-controls');
    this.fpsEl = $('hud-fps');
    this.scoreEl = $('hud-score');
    this.phaseEl = $('hud-phase');
    this.livesEl = $('hud-lives');
    this.oxygenEl = $('hud-oxygen');
    this.rescuedEl = $('hud-rescued');
    this.showFps = false;
    this.settings = {
      musicVolume: 60,
      sfxVolume: 80,
      particles: 'medium',
    };
    this.unlockedPhases = 1;
    this.completedPhases = new Set();
    this._bindActions();
    this._bindSettings();
    this._detectMobile();
  }

  _detectMobile() {
    const isMobile = /Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
    this.isMobile = isMobile;
  }

  showScreen(name) {
    // Esconde todas
    this.overlay.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const target = $('screen-' + name);
    if (target) target.classList.remove('hidden');
    this.overlay.style.display = 'flex';
  }

  hideOverlay() {
    this.overlay.style.display = 'none';
  }

  showHud(show) {
    this.hud.hidden = !show;
    if (this.isMobile) {
      this.mobile.hidden = !show;
    }
    $('btn-fullscreen').hidden = !show;
  }

  togglePause(show) {
    if (show) this.showScreen('pause');
    else this.hideOverlay();
  }

  showMenu() { this.showScreen('menu'); }
  showGameOver(score, phase, rescued) {
    $('go-score').textContent = pad(score, 6);
    $('go-phase').textContent = phase;
    $('go-rescued').textContent = rescued;
    this.showScreen('gameover');
  }
  showVictory(score, rescued) {
    $('vic-score').textContent = pad(score, 6);
    $('vic-rescued').textContent = rescued;
    this.showScreen('victory');
    // Marca fases como completas
    this.unlockedPhases = 3;
    this.completedPhases.add(2);
  }
  showPhaseSelect() {
    this._renderPhaseGrid();
    this.showScreen('phases');
  }

  _renderPhaseGrid() {
    const grid = $('phase-grid');
    grid.innerHTML = '';
    const titles = ['ÁGUAS RASAS', 'PROFUNDIDADE', 'ABISMO'];
    for (let i = 0; i < 3; i++) {
      const unlocked = i < this.unlockedPhases;
      const stars = this.completedPhases.has(i) ? '★★★' : (unlocked ? '☆' : '🔒');
      const card = document.createElement('div');
      card.className = 'phase-card' + (unlocked ? '' : ' locked');
      card.innerHTML = `
        <div class="phase-card-num">${i + 1}</div>
        <div class="phase-card-name">${titles[i]}</div>
        <div class="phase-card-stars">${stars}</div>
      `;
      if (unlocked) {
        card.addEventListener('click', () => {
          this.game.startPhase(i);
          this.hideOverlay();
        });
      }
      grid.appendChild(card);
    }
  }

  updateHud() {
    const p = this.game.player;
    if (!p) return;
    this.scoreEl.textContent = pad(p.score, 6);
    this.phaseEl.textContent = this.game.phaseIndex + 1;
    this.livesEl.textContent = Math.max(0, Math.ceil(p.health));
    this.oxygenEl.style.width = `${Math.max(0, p.oxygen)}%`;
    // Cor da barra de O2
    if (p.oxygen < 25) this.oxygenEl.style.background = 'linear-gradient(90deg, #ef476f, #ff8090)';
    else if (p.oxygen < 50) this.oxygenEl.style.background = 'linear-gradient(90deg, #ffd166, #ef476f)';
    else this.oxygenEl.style.background = 'linear-gradient(90deg, #06d6a0, #ffd166)';
    this.rescuedEl.textContent = p.rescued;
  }

  updateFps(fps) {
    if (this.showFps) this.fpsEl.textContent = `FPS: ${fps}`;
    else this.fpsEl.textContent = '';
  }

  _bindActions() {
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      this._dispatch(action);
    });
  }

  _dispatch(action) {
    const g = this.game;
    switch (action) {
      case 'start': g.startNewGame(); break;
      case 'tutorial': this.showScreen('tutorial'); break;
      case 'settings': this.showScreen('settings'); break;
      case 'credits': this.showScreen('credits'); break;
      case 'menu': g.goToMenu(); break;
      case 'back': this.showScreen('menu'); break;
      case 'resume': g.resume(); break;
      case 'restart': g.restartGame(); break;
      case 'restart-phase': g.restartPhase(); break;
      case 'exit': g.exitToMenu(); break;
    }
  }

  _bindSettings() {
    const music = $('set-music');
    const sfx = $('set-sfx');
    const fps = $('set-fps');
    const particles = $('set-particles');
    music.addEventListener('input', () => {
      this.settings.musicVolume = +music.value;
      g_audio.setMusicVolume(this.settings.musicVolume / 100);
    });
    sfx.addEventListener('input', () => {
      this.settings.sfxVolume = +sfx.value;
      g_audio.setSfxVolume(this.settings.sfxVolume / 100);
    });
    fps.addEventListener('change', () => {
      this.showFps = fps.checked;
    });
    particles.addEventListener('change', () => {
      this.settings.particles = particles.value;
      g_game.particles.setQuality(this.settings.particles);
    });
  }

  applySettings() {
    g_audio.setMusicVolume(this.settings.musicVolume / 100);
    g_audio.setSfxVolume(this.settings.sfxVolume / 100);
    g_game.particles.setQuality(this.settings.particles);
  }
}

// refs globais (acessadas por bindSettings)
let g_audio, g_game;
export function bindGlobals(audio, game) { g_audio = audio; g_game = game; }
