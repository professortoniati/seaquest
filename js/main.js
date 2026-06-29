/* main.js — entry point: inicializa subsistemas e expõe o jogo. */

import { Game } from './game.js';
import { InputManager } from './input.js';
import { AudioManager } from './audio.js';
import { UIManager, bindGlobals } from './ui.js';

function bootstrap() {
  const canvas = document.getElementById('game-canvas');
  const audio = new AudioManager();
  const input = new InputManager(canvas);
  const game = new Game(canvas, input, audio, null);
  const ui = new UIManager(game);
  game.ui = ui;
  bindGlobals(audio, game);
  ui.applySettings();

  // Pausa via botão HUD
  document.getElementById('btn-pause').addEventListener('click', () => {
    game.pause();
  });

  // Fullscreen
  const fsBtn = document.getElementById('btn-fullscreen');
  fsBtn.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (e) { /* ignore */ }
  });

  // Inicializa áudio no primeiro gesto
  const startAudio = () => {
    audio.init();
    audio.resume();
    window.removeEventListener('pointerdown', startAudio);
    window.removeEventListener('keydown', startAudio);
    window.removeEventListener('touchstart', startAudio);
  };
  window.addEventListener('pointerdown', startAudio);
  window.addEventListener('keydown', startAudio);
  window.addEventListener('touchstart', startAudio);

  // Inicia loop
  game.start();

  // Expor para debug
  window.__game = game;

  // Previne scroll/zoom no mobile
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('orientationchange', () => setTimeout(() => game._resize?.(), 200));

  console.log('%c🌊 SeaQuest Remake loaded', 'color:#06d6a0;font-weight:bold;font-size:14px');
  console.log('%cSet __game in console to inspect.', 'color:#8aa3c4');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
