import { P } from '../engine/projection.js';

// Luz por quadro: só raios de sol e poeira (a luz/sombra do chão e dos objetos é assada).
// As clareiras vêm do gerador, então funcionam no mundo infinito.

export class Lighting {
  constructor(world) {
    this.world = world;
    this.on = { shafts: true, dust: true };
    this.motes = [];
    for (let k = 0; k < 90; k++) this.motes.push({ s: Math.random(), o: Math.random() * 10, k });
  }

  // raio de sol pré-pintado uma vez (inclinado: luz do topo-esquerda)
  shaftSprite() {
    if (this._shaft) return this._shaft;
    const W = 520, H = 640;
    const c = document.createElement('canvas');
    c.width = W / 2;
    c.height = H / 2;
    const g = c.getContext('2d');
    g.scale(0.5, 0.5);
    const top = [70, 0], bot = [400, 620], w = 110;
    const gr = g.createLinearGradient(top[0], top[1], bot[0], bot[1]);
    gr.addColorStop(0, 'rgba(247,220,154,0)');
    gr.addColorStop(0.55, 'rgba(247,220,154,0.14)');
    gr.addColorStop(0.85, 'rgba(247,220,154,0.1)');
    gr.addColorStop(1, 'rgba(247,220,154,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(top[0] - w * 0.9, top[1]);
    g.lineTo(top[0] + w * 0.9, top[1]);
    g.lineTo(bot[0] + w * 0.6, bot[1]);
    g.lineTo(bot[0] - w * 0.6, bot[1]);
    g.closePath();
    g.fill();
    this._shaft = { c, W, H, ax: 400, ay: 620 };
    return this._shaft;
  }

  apply(ctx, view, t, rect) {
    const spots = this.world.gen.spotsNear(...rect);
    const vis = [];
    for (const s of spots) {
      const v = P([s.x, s.y, 0]);
      if (v[0] < view.x0 - 200 || v[0] > view.x1 + 500 || v[1] < view.y0 || v[1] > view.y1 + 700) continue;
      vis.push({ s, v });
    }
    if (this.on.shafts) {
      const sp = this.shaftSprite();
      for (const { s, v } of vis) {
        const sc = s.r / 220;
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 0.6 + s.x * 0.001);
        ctx.drawImage(sp.c, v[0] - sp.ax * sc, v[1] - sp.ay * sc, sp.W * sc, sp.H * sc);
      }
      ctx.globalAlpha = 1;
    }
    if (this.on.dust && vis.length) {
      ctx.fillStyle = '#f7dc9a';
      for (const m of this.motes) {
        const { s, v } = vis[m.k % vis.length];
        const sc = s.r / 220;
        const life = (t * 0.05 + m.o) % 1;
        const x = v[0] - 330 * sc * (1 - life) * m.s + Math.sin(t * 0.7 + m.o * 5) * 18 + (m.o - 5) * 8;
        const y = v[1] - 620 * sc * (1 - life) * m.s + Math.cos(t * 0.5 + m.o * 3) * 10;
        if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
        ctx.globalAlpha = Math.sin(life * Math.PI) * (0.5 + 0.5 * Math.sin(t * 3 + m.o * 9));
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }
}

// Vinheta escura nas bordas da tela (cacheada por tamanho de tela).
let vig = null;
export function drawVignette(ctx, sw, sh) {
  if (!vig || vig.w !== sw || vig.h !== sh) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(sw / 2);
    c.height = Math.ceil(sh / 2);
    const g = c.getContext('2d');
    const R = Math.hypot(c.width, c.height) / 2;
    const gr = g.createRadialGradient(c.width / 2, c.height / 2, R * 0.45, c.width / 2, c.height / 2, R);
    gr.addColorStop(0, 'rgba(8,12,8,0)');
    gr.addColorStop(1, 'rgba(8,12,8,0.72)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    vig = { c, w: sw, h: sh };
  }
  ctx.drawImage(vig.c, 0, 0, sw, sh);
}
