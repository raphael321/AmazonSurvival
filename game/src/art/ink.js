import { INK } from './palette.js';

// Pincéis base do estilo HQ: formas chapadas em 2–3 tons + contorno de tinta.
// A luz vem do topo-esquerda: a sombra fica na borda baixo-direita.

// Cápsula (membros, galhos). a, b: pontos de tela. tones: [sombra, base, luz]
export function capsule(ctx, a, b, w, tones, ink = 2) {
  ctx.lineCap = 'round';
  line(ctx, a, b, w + ink * 2, INK, 0, 0);
  line(ctx, a, b, w, tones[0], 0, 0);
  line(ctx, a, b, w * 0.7, tones[1], -w * 0.1, -w * 0.11);
  if (tones[2] && w > 5) line(ctx, a, b, w * 0.24, tones[2], -w * 0.22, -w * 0.22);
}

function line(ctx, a, b, w, color, ox, oy) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a[0] + ox, a[1] + oy);
  ctx.lineTo(b[0] + ox, b[1] + oy);
  ctx.stroke();
}

// Forma qualquer com sombreamento chapado. path(ctx) traça o caminho.
// off: deslocamento da camada base (maior = sombra mais larga)
export function shaded(ctx, path, tones, { off = 3, ink = 2, light = true } = {}) {
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = tones[0];
  ctx.fill();
  ctx.clip();
  // base: a forma deslocada para o topo-esquerda deixa a sombra na borda baixo-direita
  ctx.save();
  ctx.translate(-off, -off);
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = tones[1];
  ctx.fill();
  ctx.restore();
  // luz: faixa no topo-esquerda (forma menos ela mesma deslocada)
  if (light && tones[2]) {
    ctx.beginPath();
    path(ctx);
    ctx.save();
    ctx.translate(off * 0.6, off * 0.6);
    path(ctx);
    ctx.restore();
    ctx.fillStyle = tones[2];
    ctx.fill('evenodd');
  }
  ctx.restore();
  if (ink) {
    ctx.beginPath();
    path(ctx);
    ctx.lineJoin = 'round';
    ctx.lineWidth = ink;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

// Fecha um polígono a partir de pontos [[x,y],...]
export const poly = (pts) => (ctx) => {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
};

export const circle = (x, y, r) => (ctx) => {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
};
export const ellipse = (x, y, rx, ry, rot = 0) => (ctx) => {
  ctx.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx);
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
};

// Contorno convexo (Andrew monotone chain) de pontos 2D.
export function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// Polígono irregular "orgânico" em volta de um centro (folhas, pedras, manchas).
export function blobPts(r, cx, cy, rx, ry, n = 9, jitter = 0.25) {
  const pts = [];
  const a0 = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    const k = 1 - jitter + r() * jitter * 2;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

// Caminho suave passando pelos pontos (curvas quadráticas pelos pontos médios).
export const smooth = (pts) => (ctx) => {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    m = mid(p, q);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
};
