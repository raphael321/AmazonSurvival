import { P } from '../engine/projection.js';

// Iluminação estilo Dunloc/Hades: o cenário fica na penumbra da mata e a luz cai em
// poças quentes onde a copa abre. Tudo pré-calculado em canvas de baixa resolução.
// Gradientes aqui são LUZ, não estilo de forma (as formas continuam chapadas).

const LM_SCALE = 0.25;

export class Lighting {
  constructor(world) {
    this.world = world;
    this.b = world.viewBounds;
    this.build();
    this.motes = [];
    for (let k = 0; k < 70; k++) this.motes.push({ s: Math.random(), o: Math.random() * 10, spot: k % world.sunSpots.length });
  }

  build() {
    const { world, b } = this;
    const w = Math.ceil((b.x1 - b.x0) * LM_SCALE), h = Math.ceil((b.y1 - b.y0) * LM_SCALE);
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.scale(LM_SCALE, LM_SCALE);
      g.translate(-b.x0, -b.y0);
      return [c, g];
    };
    const radial = (g, x, y, rx, ry, c0, c1) => {
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, c0);
      gr.addColorStop(1, c1);
      g.fillStyle = gr;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    };

    // multiplicação: penumbra geral, sombra sob as copas e na borda da mata
    const [lm, lg] = mk();
    lg.fillStyle = '#c9c4ad';
    lg.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    for (const p of world.props) {
      if (!p.canopy) continue;
      const v = P([p.x, p.y, 0]);
      radial(lg, v[0] + p.canopy * 0.3, v[1] + p.canopy * 0.12, p.canopy * 1.25, p.canopy * 0.75, 'rgba(90,100,80,0.55)', 'rgba(90,100,80,0)');
    }
    for (const s of world.sunSpots) {
      const v = P([s.x, s.y, 0]);
      radial(lg, v[0], v[1], s.r, s.r * 0.6, 'rgba(255,250,235,1)', 'rgba(255,250,235,0)');
    }
    this.lightMap = lm;

    // brilho somado (tela): calor dourado nas poças de sol
    const [gm, gg] = mk();
    for (const s of world.sunSpots) {
      const v = P([s.x, s.y, 0]);
      radial(gg, v[0], v[1], s.r * 0.8, s.r * 0.48, 'rgba(242,196,107,0.42)', 'rgba(242,196,107,0)');
    }
    this.glowMap = gm;
    // o brilho só aquece o chão (estático): é assado nos chunks, não custa nada por quadro
    // luz e sombra são estáticas: assadas no chão e nos sprites (custo zero por quadro)
    world.bakeLight = (ctx) => {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(lm, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(gm, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.restore();
    };
    const data = lg.getImageData(0, 0, lm.width, lm.height).data;
    world.lightAt = (x, y) => {
      const v = P([x, y, 0]);
      const px = Math.max(0, Math.min(lm.width - 1, Math.round((v[0] - b.x0) * LM_SCALE)));
      const py = Math.max(0, Math.min(lm.height - 1, Math.round((v[1] - b.y0) * LM_SCALE)));
      const k = (py * lm.width + px) * 4;
      return [data[k], data[k + 1], data[k + 2]];
    };
  }

  // sombra/penumbra por cima de tudo que foi desenhado no mundo
  apply(ctx, view, t) {
    const b = this.b;
    const on = this.on || (this.on = { shafts: true, dust: true });
    ctx.save();
    if (on.shafts) this.shafts(ctx, view, t);
    if (on.dust) this.dust(ctx, view, t);
    ctx.restore();
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

  shafts(ctx, view, t) {
    const sp = this.shaftSprite();
    for (const [k, s] of this.world.sunSpots.entries()) {
      const v = P([s.x, s.y, 0]);
      if (v[0] < view.x0 - 200 || v[0] > view.x1 + 500 || v[1] < view.y0 || v[1] > view.y1 + 700) continue;
      const sc = s.r / 220;
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 0.6 + k * 1.7);
      ctx.drawImage(sp.c, v[0] - sp.ax * sc, v[1] - sp.ay * sc, sp.W * sc, sp.H * sc);
    }
    ctx.globalAlpha = 1;
  }

  // poeira/pólen flutuando dentro dos raios de luz
  dust(ctx, view, t) {
    const spots = this.world.sunSpots;
    ctx.fillStyle = '#f7dc9a';
    for (const m of this.motes) {
      const s = spots[m.spot];
      const v = P([s.x, s.y, 0]);
      const life = (t * 0.05 + m.o) % 1;
      const x = v[0] - 330 * (1 - life) * m.s + Math.sin(t * 0.7 + m.o * 5) * 18 + (m.o - 5) * 8;
      const y = v[1] - 620 * (1 - life) * m.s + Math.cos(t * 0.5 + m.o * 3) * 10;
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
      ctx.globalAlpha = Math.sin(life * Math.PI) * (0.5 + 0.5 * Math.sin(t * 3 + m.o * 9));
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
}

// Vinheta escura nas bordas da tela (cacheada por tamanho de tela).
let vig = null;
export function drawVignette(ctx, sw, sh, dpr) {
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
