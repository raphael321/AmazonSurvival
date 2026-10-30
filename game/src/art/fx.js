import { INK, PAL } from './palette.js';
import { shaded } from './ink.js';

// Coração chapado (domar). s = escala.
export function drawHeart(ctx, x, y, s = 1, filled = true) {
  const path = (g) => {
    g.moveTo(x, y + 5 * s);
    g.bezierCurveTo(x - 9 * s, y - 1 * s, x - 5 * s, y - 8 * s, x, y - 3.5 * s);
    g.bezierCurveTo(x + 5 * s, y - 8 * s, x + 9 * s, y - 1 * s, x, y + 5 * s);
    g.closePath();
  };
  if (filled) shaded(ctx, path, PAL.fire, { off: 1.2 * s, ink: 1.6 });
  else {
    ctx.beginPath();
    path(ctx);
    ctx.fillStyle = 'rgba(29,26,18,0.45)';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

// Textos e ícones que sobem e somem (em coordenadas de vista).
export class Popups {
  constructor() {
    this.items = [];
  }
  add(x, y, text, opts = {}) {
    this.items.push({ x, y, text, t: 0, life: opts.life || 1.4, heart: opts.heart || false, color: opts.color || PAL.ui.text });
  }
  update(dt) {
    for (const p of this.items) p.t += dt;
    this.items = this.items.filter((p) => p.t < p.life);
  }
  draw(ctx) {
    for (const p of this.items) {
      const k = p.t / p.life;
      const y = p.y - 26 * Math.sqrt(k);
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      if (p.heart) drawHeart(ctx, p.x, y, 1.4 + Math.sin(Math.min(1, k * 4) * Math.PI) * 0.4);
      if (p.text) {
        ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = INK;
        ctx.strokeText(p.text, p.x, y - (p.heart ? 14 : 0));
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, y - (p.heart ? 14 : 0));
      }
    }
    ctx.globalAlpha = 1;
  }
}
