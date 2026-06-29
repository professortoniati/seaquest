/* audio.js — Web Audio API: síntese procedural para todos os efeitos,
   com fallback para arquivos .mp3 carregados sob demanda. */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicVolume = 0.6;
    this.sfxVolume = 0.8;
    this.enabled = true;
    this._musicNodes = null;
    this._musicPlaying = false;
    this._ambientStarted = false;
    this._pendingMusic = false;
    this._pendingAmbient = false;
  }

  /** Inicializa AudioContext (deve ser chamado após gesto do usuário). */
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);
      // Reproduz qualquer coisa pendente
      if (this._pendingMusic) { this._pendingMusic = false; this.startMusic(); }
      if (this._pendingAmbient) { this._pendingAmbient = false; this.startAmbient(); }
    } catch (e) {
      console.warn('[Audio] AudioContext indisponível:', e);
    }
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = v;
  }
  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  /** ========== SFX ========== */

  /** Tiro (torpedo) — sweep descendente curto. */
  playShoot() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.15);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.16);
  }

  /** Explosão — ruído filtrado + tom grave. */
  playExplosion() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Ruído branco
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    const gN = this.ctx.createGain();
    gN.gain.setValueAtTime(0.6, t);
    gN.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    noise.connect(filter).connect(gN).connect(this.sfxGain);
    noise.start(t); noise.stop(t + 0.5);
    // Sub boom
    const osc = this.ctx.createOscillator();
    const gO = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    gO.gain.setValueAtTime(0.0001, t);
    gO.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    gO.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gO).connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.5);
  }

  /** Resgate de mergulhador — arpejo ascendente. */
  playRescue() {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const start = t0 + i * 0.07;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(g).connect(this.sfxGain);
      osc.start(start); osc.stop(start + 0.2);
    });
  }

  /** Coleta de oxigênio — whoosh rápido. */
  playOxygen() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.32);
  }

  /** Game over — sequência descendente. */
  playGameOver() {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    [392, 329.6, 261.6, 196].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const start = t0 + i * 0.22;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.3, start + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(g).connect(this.sfxGain);
      osc.start(start); osc.stop(start + 0.55);
    });
  }

  /** Vitória — fanfarra curta. */
  playVictory() {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const start = t0 + i * 0.13;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(g).connect(this.sfxGain);
      osc.start(start); osc.stop(start + 0.45);
    });
  }

  /** Hit no player. */
  playHit() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.27);
  }

  /** Bolha. */
  playBubble() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220 + Math.random() * 200, t);
    osc.frequency.exponentialRampToValueAtTime(440 + Math.random() * 200, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.1);
  }

  /** ========== MÚSICA DE FUNDO — loop simples sintetizado ========== */
  startMusic() {
    if (!this.enabled) return;
    if (!this.ctx) { this._pendingMusic = true; return; }
    if (this._musicPlaying) return;
    this._musicPlaying = true;
    this._playMusicLoop();
  }
  stopMusic() {
    this._musicPlaying = false;
    if (this._musicNodes) {
      try { this._musicNodes.osc.stop(); } catch {}
      this._musicNodes = null;
    }
  }
  _playMusicLoop() {
    if (!this._musicPlaying || !this.ctx) return;
    // Notas em Am (A menor)
    const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
    const bass  = [55, 65.41, 73.42, 82.41];
    const t0 = this.ctx.currentTime + 0.05;
    const dur = 8; // 8 segundos de loop
    const bpm = 96;
    const step = 60 / bpm / 2; // colcheias
    const steps = Math.floor(dur / step);

    // Lead synth
    const lead = this.ctx.createOscillator();
    const leadG = this.ctx.createGain();
    lead.type = 'triangle';
    leadG.gain.value = 0.0;
    lead.connect(leadG).connect(this.musicGain);

    // Bass
    const bassOsc = this.ctx.createOscillator();
    const bassG = this.ctx.createGain();
    bassOsc.type = 'sawtooth';
    const bassFilt = this.ctx.createBiquadFilter();
    bassFilt.type = 'lowpass';
    bassFilt.frequency.value = 600;
    bassG.gain.value = 0.0;
    bassOsc.connect(bassFilt).connect(bassG).connect(this.musicGain);

    // Pattern aleatório simples
    let prevNote = scale[0];
    for (let i = 0; i < steps; i++) {
      const t = t0 + i * step;
      if (i % 2 === 0) {
        const note = scale[Math.floor(Math.random() * scale.length)];
        lead.frequency.setValueAtTime(note, t);
        leadG.gain.setValueAtTime(0.0, t);
        leadG.gain.linearRampToValueAtTime(0.12, t + 0.02);
        leadG.gain.linearRampToValueAtTime(0.0, t + step * 0.9);
        prevNote = note;
      }
      if (i % 8 === 0) {
        const bnote = bass[Math.floor(Math.random() * bass.length)];
        bassOsc.frequency.setValueAtTime(bnote, t);
        bassG.gain.setValueAtTime(0.0, t);
        bassG.gain.linearRampToValueAtTime(0.15, t + 0.02);
        bassG.gain.linearRampToValueAtTime(0.0, t + step * 7);
      }
    }

    lead.start(t0); bassOsc.start(t0);
    lead.stop(t0 + dur + 0.1); bassOsc.stop(t0 + dur + 0.1);
    this._musicNodes = { osc: lead, bass: bassOsc };

    // Reagenda próximo loop
    setTimeout(() => this._playMusicLoop(), (dur - 0.2) * 1000);
  }

  /** Ambiente oceânico — ruído rosa com modulação. */
  startAmbient() {
    if (!this.enabled) return;
    if (!this.ctx) { this._pendingAmbient = true; return; }
    if (this._ambientStarted) return;
    this._ambientStarted = true;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 4, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i=0;i<d.length;i++) {
      const w = Math.random()*2-1;
      b0 = 0.99886*b0 + w*0.0555179;
      b1 = 0.99332*b1 + w*0.0750759;
      b2 = 0.96900*b2 + w*0.1538520;
      b3 = 0.86650*b3 + w*0.3104856;
      b4 = 0.55000*b4 + w*0.5329522;
      b5 = -0.7616*b5 - w*0.0168980;
      d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;
      b6 = w*0.115926;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 400;
    const g = this.ctx.createGain();
    g.gain.value = 0.06;
    // LFO para modular
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.frequency.value = 0.15;
    lfoG.gain.value = 80;
    lfo.connect(lfoG).connect(filt.frequency);
    src.connect(filt).connect(g).connect(this.sfxGain);
    src.start(); lfo.start();
  }
}
