import { INK } from '../art/palette.js';
import { rng } from '../engine/math.js';
import { P, groundFromView } from '../engine/projection.js';
import { T } from './gen.js';

// Terreno isométrico com altura, gerado sob demanda e pintado em chunks de vista (512 px).
export { T };
export const HL = 30; // altura de um nível
export const CHUNK = 512;
export const BG = '#0b110c';
export const WATER_Z = -0.55 * HL;

// cores como '#rrggbb' ou 'rgb(r,g,b)'
function rgbOf(c) {
  if (c[0] === '#') { const p = parseInt(c.slice(1), 16); return [(p >> 16) & 255, (p >> 8) & 255, p & 255]; }
  return c.slice(4, -1).split(',').map(Number);
}
const css = (v) => `rgb(${v.map((x) => Math.max(0, Math.min(255, Math.round(x)))).join(',')})`;
const mix = (a, b, t) => { const pa = rgbOf(a), pb = rgbOf(b); return css(pa.map((x, k) => x * (1 - t) + pb[k] * t)); };
const shade = (c, k) => css(rgbOf(c).map((x) => x * k));

export function tileTopZ(gen, i, j) {
  const h = gen.h(i, j);
  return h < 0 ? WATER_Z : h * HL;
}

function quad(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
  ctx.closePath();
}

// Face lateral (barranco): camadas de terra, raízes penduradas, contorno de tinta.
function paintFace(ctx, a, b, ztop, zbot, side, r, isWater) {
  const A = P([a[0], a[1], ztop]), B = P([b[0], b[1], ztop]);
  const Bd = P([b[0], b[1], zbot]), Ad = P([a[0], a[1], zbot]);
  const lit = side === 'south'; // face baixo-esquerda recebe a luz do topo-esquerda
  const base = isWater ? (lit ? '#5d4a30' : '#41331f') : lit ? '#7a5a38' : '#4f3a25';
  quad(ctx, [A, B, Bd, Ad]);
  ctx.fillStyle = base;
  ctx.fill();
  const depth = ztop - zbot;
  ctx.lineWidth = 1.4;
  const layers = Math.max(1, Math.round(depth / 11));
  for (let k = 1; k <= layers; k++) {
    const z = ztop - depth * (k / (layers + 0.6)) - r() * 3;
    const p = P([a[0], a[1], z]), q = P([b[0], b[1], z]);
    ctx.strokeStyle = k % 2 ? shade(base, 0.72) : shade(base, 1.18);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const t = r(), z = ztop - r() * depth * 0.8 - 4;
    const p = P([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z]);
    ctx.fillStyle = shade(base, 1.35);
    ctx.beginPath();
    ctx.ellipse(p[0], p[1], 2.6, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!isWater) {
    ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      if (r() < 0.45) continue;
      const t = 0.15 + r() * 0.7, len = Math.min(depth * 0.8, 10 + r() * 22);
      const p = P([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ztop - 1]);
      for (const [w, c] of [[3, INK], [1.5, '#5a4128']]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.quadraticCurveTo(p[0] + (r() - 0.5) * 8, p[1] + len * 0.5, p[0] + (r() - 0.5) * 6, p[1] + len);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(A[0], A[1]);
  ctx.lineTo(B[0], B[1]);
  ctx.stroke();
}

const LEAF = ['#8a6239', '#a97c4a', '#6b4a2e', '#9a7a3a', '#7d5a2c'];

function leaf(ctx, x, y, a, s, col) {
  // transformação direta (sem save/restore): é a pincelada mais repetida do chão
  const m = ctx.getTransform();
  const c = Math.cos(a), n = Math.sin(a);
  ctx.transform(c, n, -n, c, x, y);
  ctx.fillStyle = 'rgba(29,22,14,0.55)';
  ctx.beginPath();
  ctx.ellipse(0.8, 1, 4.2 * s, 1.9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-4.4 * s, 0);
  ctx.quadraticCurveTo(0, -2.4 * s, 4.4 * s, 0);
  ctx.quadraticCurveTo(0, 2.4 * s, -4.4 * s, 0);
  ctx.fill();
  ctx.setTransform(m);
}

function fern(ctx, x, y, s, r) {
  const fronds = 5 + Math.floor(r() * 3);
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    for (let k = 0; k < fronds; k++) {
      const a = -Math.PI / 2 + (k / (fronds - 1) - 0.5) * 2.6;
      const L = (12 + (k % 3) * 3) * s;
      const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L * 0.75;
      ctx.strokeStyle = pass ? (k % 2 ? '#4a7a3e' : '#5f8f48') : '#16301f';
      ctx.lineWidth = pass ? 2 : 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5 - 4 * s, ex, ey);
      ctx.stroke();
    }
  }
}

function tileDecor(ctx, i, j, z, r, kind) {
  const x0 = i * T, y0 = j * T;
  const at = (u, v) => P([x0 + u * T, y0 + v * T, z]);
  if (kind === 'forest') {
    for (let k = 0; k < 5; k++) {
      const p = at(0.1 + r() * 0.8, 0.1 + r() * 0.8);
      leaf(ctx, p[0], p[1], r() * 3, 0.9, '#3a2c1c');
    }
    return;
  }
  if (r() < 0.35) {
    const p = at(0.2 + r() * 0.6, 0.2 + r() * 0.6);
    const rx = 10 + r() * 14;
    ctx.fillStyle = '#2f4a2c';
    ctx.beginPath();
    ctx.ellipse(p[0] + 1.5, p[1] + 1.5, rx, rx * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = kind === 'mound' ? '#5a7a40' : '#4a6a38';
    ctx.beginPath();
    ctx.ellipse(p[0], p[1], rx * 0.9, rx * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const n = 4 + Math.floor(r() * 7);
  for (let k = 0; k < n; k++) {
    const p = at(0.05 + r() * 0.9, 0.05 + r() * 0.9);
    leaf(ctx, p[0], p[1], r() * Math.PI, 0.7 + r() * 0.5, LEAF[Math.floor(r() * LEAF.length)]);
  }
  if (r() < 0.12) {
    const p = at(0.1, 0.2 + r() * 0.6), q = at(0.9, 0.2 + r() * 0.6);
    ctx.lineCap = 'round';
    for (const [w, c] of [[5.5, INK], [3.2, '#6b5233'], [1.2, '#8f7450']]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.quadraticCurveTo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 6, q[0], q[1]);
      ctx.stroke();
    }
  }
  if (r() < 0.22) {
    const p = at(0.2 + r() * 0.6, 0.2 + r() * 0.6);
    fern(ctx, p[0], p[1], 0.8 + r() * 0.5, r);
  }
  if (r() < 0.15) {
    const p = at(0.2 + r() * 0.6, 0.2 + r() * 0.6);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(p[0], p[1], 4.2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#857f68';
    ctx.beginPath();
    ctx.ellipse(p[0] - 0.4, p[1] - 0.6, 3.3, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintTile(ctx, gen, i, j, seed) {
  const h = gen.h(i, j);
  const r = rng((i * 92821) ^ (j * 68917) ^ (seed * 131));
  const x0 = i * T, y0 = j * T, x1 = x0 + T, y1 = y0 + T;
  const z = tileTopZ(gen, i, j);
  const water = h < 0;

  // faces visíveis (leste e sul) onde o vizinho é mais baixo
  const ze = tileTopZ(gen, i + 1, j), zs = tileTopZ(gen, i, j + 1);
  if (zs < z) paintFace(ctx, [x0, y1], [x1, y1], z, zs, 'south', r, water);
  if (ze < z) paintFace(ctx, [x1, y1], [x1, y0], z, ze, 'east', r, water);

  const top = [P([x0, y0, z]), P([x1, y0, z]), P([x1, y1, z]), P([x0, y1, z])];
  const forest = !water && gen.isForest(i, j);
  let col;
  if (water) col = mix('#8a6a3a', '#4a3a22', gen.deep(i, j));
  else if (forest) col = mix('#2b3524', '#3a4630', r());
  else if (h > 0) col = mix(h > 1 ? '#6b7a48' : '#5f7444', '#6d7c48', r());
  else col = mix(mix('#6e5634', '#4d6238', (gen.reliefAt(i * 0.6, j * 0.6) + 1) / 2), '#000000', r() * 0.08);
  quad(ctx, top);
  ctx.fillStyle = col;
  ctx.fill();
  // mesma cor no traço: fecha a fresta de antialiasing entre tiles vizinhos
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (!water) {
    ctx.strokeStyle = 'rgba(20,16,10,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (water) {
    // sombra do barranco sobre a água
    const n = gen.h(i, j - 1) >= 0, w = gen.h(i - 1, j) >= 0;
    if (n || w) {
      ctx.save();
      quad(ctx, top);
      ctx.clip();
      ctx.fillStyle = 'rgba(30,22,12,0.35)';
      if (n) { quad(ctx, [top[0], top[1], P([x1, y0 + 18, z]), P([x0, y0 + 18, z])]); ctx.fill(); }
      if (w) { quad(ctx, [top[0], P([x0 + 18, y0, z]), P([x0 + 18, y1, z]), top[3]]); ctx.fill(); }
      ctx.restore();
    }
    return;
  }
  tileDecor(ctx, i, j, z, r, forest ? 'forest' : h > 0 ? 'mound' : 'floor');
  if (zs < z || ze < z) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(244,234,210,0.18)';
    ctx.beginPath();
    if (zs < z) { const a = P([x0, y1 - 2, z]), b = P([x1, y1 - 2, z]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    if (ze < z) { const a = P([x1 - 2, y1, z]), b = P([x1 - 2, y0, z]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
  }
}

// Luz assada no chunk: grade de amostras da função de luz, ampliada com filtro bilinear.
const LGRID = 16;
function bakeLight(ctx, gen, cx, cy, spots, props) {
  const n = LGRID + 1;
  const lc = document.createElement('canvas');
  lc.width = n;
  lc.height = n;
  const gc = document.createElement('canvas');
  gc.width = n;
  gc.height = n;
  const li = new ImageData(n, n), gi = new ImageData(n, n);
  const step = CHUNK / LGRID;
  for (let v = 0; v < n; v++)
    for (let u = 0; u < n; u++) {
      const [x, y] = groundFromView(cx + u * step, cy + v * step);
      const { L, sun } = gen.lightAt(x, y, spots);
      const k = (v * n + u) * 4;
      li.data[k] = Math.min(255, L * 255);
      li.data[k + 1] = Math.min(255, L * 250);
      li.data[k + 2] = Math.min(255, L * 226);
      li.data[k + 3] = 255;
      gi.data[k] = 242;
      gi.data[k + 1] = 196;
      gi.data[k + 2] = 107;
      gi.data[k + 3] = Math.round(sun * 0.42 * 255);
    }
  lc.getContext('2d').putImageData(li, 0, 0);
  gc.getContext('2d').putImageData(gi, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  // cada amostra fica no centro da sua célula: amostras de borda são iguais nos dois chunks vizinhos
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(lc, cx - step / 2, cy - step / 2, n * step, n * step);
  // sombra das copas grandes (samaúma)
  for (const p of props) {
    if (!p.canopy || p.canopy < 200) continue;
    const v = P([p.x, p.y, 0]);
    const rx = p.canopy * 1.25, ry = p.canopy * 0.75;
    ctx.save();
    ctx.translate(v[0] + p.canopy * 0.3, v[1] + p.canopy * 0.12);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(90,100,80,0.55)');
    g.addColorStop(1, 'rgba(90,100,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(gc, cx - step / 2, cy - step / 2, n * step, n * step);
  ctx.restore();
}

// Pinta um chunk de vista. Os tiles que caem nele saem da projeção inversa dos cantos.
// É um gerador: pausa a cada faixa diagonal de tiles para o streaming dividir o trabalho
// entre vários quadros. O valor final (return) é o canvas pronto.
export function* chunkPainter(world, ix, iy, rs) {
  const gen = world.gen;
  const cx = ix * CHUNK, cy = iy * CHUNK;
  const c = document.createElement('canvas');
  c.width = Math.ceil(CHUNK * rs);
  c.height = Math.ceil(CHUNK * rs);
  const ctx = c.getContext('2d');
  ctx.scale(rs, rs);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = BG;
  ctx.fillRect(cx, cy, CHUNK, CHUNK);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, CHUNK, CHUNK);
  ctx.clip();

  // faixa de vista que pode afetar o chunk: tiles altos sobem ~60px, faces descem ~70px
  const vx0 = cx - 60, vx1 = cx + CHUNK + 60, vy0 = cy - 90, vy1 = cy + CHUNK + 90;
  const corners = [[vx0, vy0], [vx1, vy0], [vx1, vy1], [vx0, vy1]].map(([x, y]) => groundFromView(x, y));
  const i0 = Math.floor(Math.min(...corners.map((p) => p[0])) / T), i1 = Math.floor(Math.max(...corners.map((p) => p[0])) / T);
  const j0 = Math.floor(Math.min(...corners.map((p) => p[1])) / T), j1 = Math.floor(Math.max(...corners.map((p) => p[1])) / T);
  const seed = gen.p.seed | 0;
  for (let s = i0 + j0; s <= i1 + j1; s++) {
    for (let i = Math.max(i0, s - j1); i <= Math.min(i1, s - j0); i++) {
      const j = s - i;
      const v = P([(i + 0.5) * T, (j + 0.5) * T, 0]);
      if (v[0] < vx0 || v[0] > vx1 || v[1] < vy0 || v[1] > vy1 + 60) continue;
      paintTile(ctx, gen, i, j, seed);
    }
    yield;
  }

  // sombras de contato e luz
  const [gx0, gy0] = groundFromView(cx, cy), [gx1, gy1] = groundFromView(cx + CHUNK, cy + CHUNK);
  const ga = groundFromView(cx + CHUNK, cy), gb = groundFromView(cx, cy + CHUNK);
  const wx0 = Math.min(gx0, gx1, ga[0], gb[0]) - 400, wx1 = Math.max(gx0, gx1, ga[0], gb[0]) + 400;
  const wy0 = Math.min(gy0, gy1, ga[1], gb[1]) - 400, wy1 = Math.max(gy0, gy1, ga[1], gb[1]) + 400;
  const props = world.propsIn(wx0, wy0, wx1, wy1);
  for (const p of props) {
    const v = P([p.x, p.y, 0]);
    const s = p.shadow || 20;
    ctx.fillStyle = 'rgba(12,16,8,0.32)';
    ctx.beginPath();
    ctx.ellipse(v[0] + s * 0.35, v[1] + s * 0.18, s, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  yield;
  bakeLight(ctx, gen, cx, cy, gen.spotsNear(wx0, wy0, wx1, wy1), props);
  ctx.restore();
  return c;
}

export function paintTerrainChunk(world, ix, iy, rs) {
  const it = chunkPainter(world, ix, iy, rs);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

// brilho animado da água: só os tiles de rio visíveis
export function drawWater(ctx, gen, view, t) {
  const corners = [[view.x0, view.y0], [view.x1, view.y0], [view.x1, view.y1], [view.x0, view.y1]].map(([x, y]) => groundFromView(x, y));
  const i0 = Math.floor(Math.min(...corners.map((p) => p[0])) / T), i1 = Math.floor(Math.max(...corners.map((p) => p[0])) / T);
  const j0 = Math.floor(Math.min(...corners.map((p) => p[1])) / T), j1 = Math.floor(Math.max(...corners.map((p) => p[1])) / T);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#e8c98a';
  ctx.lineWidth = 2;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      if (gen.h(i, j) >= 0) continue;
      const c = P([(i + 0.5) * T, (j + 0.5) * T, WATER_Z]);
      if (c[0] < view.x0 - 60 || c[0] > view.x1 + 60 || c[1] < view.y0 - 40 || c[1] > view.y1 + 40) continue;
      for (let k = 0; k < 3; k++) {
        const ph = Math.sin(i * 12.9898 + j * 78.233 + k * 3.1) * 43758.5453;
        const fr = ph - Math.floor(ph);
        const u = (t * 0.12 + fr) % 1;
        const v = 0.2 + ((fr * 7) % 0.6);
        const a = P([(i + u * 0.8) * T, (j + v) * T, WATER_Z]);
        const b = P([(i + u * 0.8) * T + 10 + fr * 14, (j + v) * T, WATER_Z]);
        ctx.globalAlpha = (0.45 + 0.4 * Math.sin(t * 1.6 + fr * 30)) * Math.sin(u * Math.PI);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
  ctx.globalAlpha = 1;
}
