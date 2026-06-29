/* parallax.js — fundo multi-camada com parallax, raios de luz, ondulações. */

import { rand, hsl } from './utils.js';

/** Uma camada de fundo parallax (pre-renderizada em canvas offscreen). */
class BackgroundLayer {
  constructor(width, height, speed, drawFn) {
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.offset = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    drawFn(this.ctx, width, height);
  }
  update(dt, scrollSpeed) {
    this.offset = (this.offset + scrollSpeed * this.speed * dt) % this.width;
  }
  draw(ctx) {
    // Tile horizontal
    ctx.drawImage(this.canvas, -this.offset, 0);
    ctx.drawImage(this.canvas, -this.offset + this.width, 0);
  }
}

/** Gerenciador de parallax para uma fase. */
export class ParallaxBackground {
  constructor(theme, width, height) {
    this.width = width;
    this.height = height;
    this.theme = theme;
    this.layers = [];
    this.time = 0;
    this.surfaceWave = rand(0, Math.PI * 2);
    this._buildLayers(theme);
  }

  resize(w, h) {
    this.width = w; this.height = h;
    this.layers = [];
    this._buildLayers(this.theme);
  }

  _buildLayers(theme) {
    const W = this.width, H = this.height;
    // 1. Gradiente profundo (estático, speed 0)
    this.layers.push(new BackgroundLayer(W, H, 0, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      // Tons conforme tema
      const palette = this.theme.palette;
      g.addColorStop(0, palette.surfaceTop);
      g.addColorStop(0.18, palette.surfaceBottom);
      g.addColorStop(0.4, palette.midTop);
      g.addColorStop(1, palette.deep);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Vinheta
      const vg = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.3, w/2, h/2, Math.max(w,h)*0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }));

    // 2. Raios de luz (mais lentos)
    this.layers.push(new BackgroundLayer(W, H, 0.08, (ctx, w, h) => {
      this._drawLightRays(ctx, w, h, theme);
    }));

    // 3. Detalhes distantes (recifes / silhuetas)
    this.layers.push(new BackgroundLayer(W, H, 0.15, (ctx, w, h) => {
      this._drawFarSilhouettes(ctx, w, h, theme);
    }));

    // 4. Detalhes médios
    this.layers.push(new BackgroundLayer(W, H, 0.35, (ctx, w, h) => {
      this._drawMidDetails(ctx, w, h, theme);
    }));

    // 5. Partículas distantes (plâncton)
    this.layers.push(new BackgroundLayer(W, H, 0.5, (ctx, w, h) => {
      this._drawPlankton(ctx, w, h, theme);
    }));

    // 6. Camada de plantas / corais próximos
    this.layers.push(new BackgroundLayer(W, H, 0.7, (ctx, w, h) => {
      this._drawNearPlants(ctx, w, h, theme);
    }));

    // 7. Embaçado perto (foreground blur)
    this.layers.push(new BackgroundLayer(W, H, 1.1, (ctx, w, h) => {
      this._drawForeground(ctx, w, h, theme);
    }));
  }

  _drawLightRays(ctx, w, h, theme) {
    const rays = theme.lightRays ?? 5;
    for (let i = 0; i < rays; i++) {
      const x = ((i + 0.5) / rays) * w + rand(-w*0.05, w*0.05);
      const y0 = 0;
      const y1 = h * rand(0.5, 0.95);
      const grad = ctx.createLinearGradient(x, y0, x, y1);
      grad.addColorStop(0, 'rgba(255,250,220,0.18)');
      grad.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - 30, y0);
      ctx.lineTo(x + 30, y0);
      ctx.lineTo(x + 100 + rand(0, 60), y1);
      ctx.lineTo(x - 100 - rand(0, 60), y1);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawFarSilhouettes(ctx, w, h, theme) {
    ctx.fillStyle = theme.palette.silhouetteFar;
    // Montanhas submarinas / cânions
    const segs = 12;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= segs; i++) {
      const x = (i / segs) * w;
      const baseY = h * 0.65;
      const y = baseY + Math.sin(i * 1.3 + theme.seed) * h * 0.08 + rand(-10, 10);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }

  _drawMidDetails(ctx, w, h, theme) {
    ctx.fillStyle = theme.palette.silhouetteMid;
    const segs = 14;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= segs; i++) {
      const x = (i / segs) * w;
      const y = h * 0.78 + Math.sin(i * 0.7 + theme.seed * 2) * h * 0.04;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Corais / rochas pontuais
    for (let i = 0; i < 8; i++) {
      const x = rand(0, w);
      const y = h * rand(0.78, 0.95);
      this._drawCoral(ctx, x, y, rand(0.6, 1.2), theme.palette.coral);
    }
  }

  _drawCoral(ctx, x, y, scale, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    // Tronco
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-3, -18);
    ctx.lineTo(3, -18);
    ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fill();
    // Ramos
    for (let i = 0; i < 3; i++) {
      const ax = (i - 1) * 6;
      ctx.beginPath();
      ctx.moveTo(ax - 2, -16);
      ctx.lineTo(ax - 1, -28 - rand(0, 6));
      ctx.lineTo(ax + 1, -28 - rand(0, 6));
      ctx.lineTo(ax + 2, -16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawPlankton(ctx, w, h, theme) {
    const count = theme.quality === 'low' ? 30 : 70;
    ctx.fillStyle = theme.palette.plankton;
    for (let i = 0; i < count; i++) {
      const x = rand(0, w);
      const y = rand(0, h);
      ctx.fillRect(x, y, 1, 1);
    }
    // Algumas bolhas grandes difusas
    for (let i = 0; i < 6; i++) {
      const x = rand(0, w);
      const y = rand(h * 0.3, h);
      const r = rand(2, 5);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawNearPlants(ctx, w, h, theme) {
    ctx.strokeStyle = theme.palette.plant;
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const x = rand(0, w);
      const baseY = h;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      let y = baseY;
      let sway = rand(0, Math.PI * 2);
      while (y > h * 0.65) {
        sway += rand(-0.4, 0.4);
        const xo = Math.sin(sway) * 6;
        ctx.lineTo(x + xo, y);
        y -= rand(6, 14);
      }
      ctx.stroke();
    }
    // Plantas mais detalhadas
    for (let i = 0; i < 6; i++) {
      const x = rand(0, w);
      const baseY = h;
      ctx.fillStyle = theme.palette.plant;
      ctx.beginPath();
      ctx.moveTo(x - 3, baseY);
      ctx.quadraticCurveTo(x - 8, baseY - 30, x, baseY - 60);
      ctx.quadraticCurveTo(x + 8, baseY - 30, x + 3, baseY);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawForeground(ctx, w, h, theme) {
    // Borrão sutil de partículas grandes
    for (let i = 0; i < 12; i++) {
      const x = rand(0, w);
      const y = rand(0, h);
      const r = rand(20, 50);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.025)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  /** Desenha superfície da água (faixa superior). */
  drawSurface(ctx, w, h) {
    const t = this.time;
    ctx.save();
    // Linha de superfície
    const surfaceY = h * 0.18;
    ctx.fillStyle = this.theme.palette.surfaceTop;
    ctx.fillRect(0, 0, w, surfaceY + 4);
    // Ondulações
    ctx.strokeStyle = this.theme.palette.surfaceLine;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const yo = surfaceY + i * 3;
      for (let x = 0; x <= w; x += 8) {
        const y = yo + Math.sin((x + t * 80 + i * 40) * 0.04) * 1.6;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Brilho solar
    const sunX = w * 0.7 + Math.sin(t * 0.2) * w * 0.05;
    const sunR = 40;
    const sg = ctx.createRadialGradient(sunX, 10, 0, sunX, 10, sunR);
    sg.addColorStop(0, 'rgba(255,250,200,0.7)');
    sg.addColorStop(1, 'rgba(255,250,200,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - sunR, 10 - sunR, sunR * 2, sunR * 2);
    ctx.restore();
  }

  update(dt, scrollSpeed) {
    this.time += dt;
    for (const l of this.layers) l.update(dt, scrollSpeed);
  }

  draw(ctx) {
    for (const l of this.layers) l.draw(ctx);
  }
}

/** Paletas para cada fase. */
export const PHASE_PALETTES = {
  1: {
    surfaceTop:    '#5cc9ff',
    surfaceBottom: '#2a8fd6',
    surfaceLine:   '#ffffff',
    midTop:        '#1d5f8a',
    deep:          '#021726',
    silhouetteFar: 'rgba(2,30,50,0.55)',
    silhouetteMid: 'rgba(1,20,40,0.7)',
    coral:         '#5fb7c9',
    plankton:      'rgba(180,220,255,0.5)',
    plant:         '#0a4d3a',
    quality: 'high',
    lightRays: 6,
    seed: 1.3,
  },
  2: {
    surfaceTop:    '#3a8fc4',
    surfaceBottom: '#1c5d8e',
    surfaceLine:   '#bfe6ff',
    midTop:        '#0e3a5e',
    deep:          '#001220',
    silhouetteFar: 'rgba(1,18,30,0.65)',
    silhouetteMid: 'rgba(0,12,22,0.75)',
    coral:         '#3e7a85',
    plankton:      'rgba(160,200,240,0.4)',
    plant:         '#072f23',
    quality: 'high',
    lightRays: 4,
    seed: 2.7,
  },
  3: {
    surfaceTop:    '#1e547d',
    surfaceBottom: '#0e2e4b',
    surfaceLine:   '#88c4ee',
    midTop:        '#06182a',
    deep:          '#000408',
    silhouetteFar: 'rgba(0,8,16,0.85)',
    silhouetteMid: 'rgba(0,4,10,0.95)',
    coral:         '#2a4a55',
    plankton:      'rgba(120,180,230,0.35)',
    plant:         '#031a14',
    quality: 'high',
    lightRays: 3,
    seed: 4.1,
  },
};

export function makePhaseTheme(phaseIndex, quality) {
  const pal = { ...PHASE_PALETTES[Math.min(3, phaseIndex + 1)] || PHASE_PALETTES[3] };
  pal.quality = quality;
  return { palette: pal, lightRays: pal.lightRays, seed: pal.seed, quality };
}
