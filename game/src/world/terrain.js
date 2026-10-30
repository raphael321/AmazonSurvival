import { INK } from '../art/palette.js';
import { rng } from '../engine/math.js';
import { P } from '../engine/projection.js';

// Terreno isométrico em tiles com altura. Pintado UMA vez em chunks offscreen.
export const T = 64; // lado do tile no mundo
export const HL = 30; // altura de um nível
export const CHUNK = 512;
export const VOID = -6; // altura "fora do mapa" (abismo escuro)
export const BG = '#0b110c';

const WATER_Z = -0.55 * HL;

// mistura de cores hex
// cores como '#rrggbb' ou 'rgb(r,g,b)'
function rgbOf(c) {
  if (c[0] === '#') { const p = parseInt(c.slice(1), 16); return [(p >> 16) & 255, (p >> 8) & 255, p & 255]; }
  return c.slice(4, -1).split(',').map(Number);
}
const css = (v) => `rgb(${v.map((x) => Math.max(0, Math.min(255, Math.round(x)))).join(',')})`;
function mix(a, b, t) {
  const pa = rgbOf(a), pb = rgbOf(b);
  return css(pa.map((x, k) => x * (1 - t) + pb[k] * t));
}
function shade(c, k) {
  return css(rgbOf(c).map((x) => x * k));
}

export function tileTopZ(world, i, j) {
  const h = world.h(i, j);
  if (h === VOID) return VOID * HL;
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
  if (zbot <= VOID * HL + 1) {
    const g = ctx.createLinearGradient(0, A[1], 0, A[1] + (ztop - zbot) * 0.6);
    g.addColorStop(0, base);
    g.addColorStop(0.55, shade(base, 0.45));
    g.addColorStop(1, BG);
    ctx.fillStyle = g;
  } else ctx.fillStyle = base;
  ctx.fill();
  // estratos
  const depth = Math.min(ztop - zbot, HL * 2.2);
  ctx.lineWidth = 1.4;
  for (let k = 1; k <= 3; k++) {
    const z = ztop - depth * (k / 3.6) - r() * 3;
    const p = P([a[0], a[1], z]), q = P([b[0], b[1], z]);
    ctx.strokeStyle = k % 2 ? shade(base, 0.72) : shade(base, 1.18);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  }
  // pedrinhas na parede
  for (let k = 0; k < 3; k++) {
    const t = r(), z = ztop - r() * depth * 0.8 - 4;
    const p = P([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z]);
    ctx.fillStyle = shade(base, 1.35);
    ctx.beginPath();
    ctx.ellipse(p[0], p[1], 2.6, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // raízes penduradas
  if (!isWater) {
    ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      if (r() < 0.45) continue;
      const t = 0.15 + r() * 0.7, len = 10 + r() * 22;
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
  // contorno: borda de cima e quina
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(A[0], A[1]);
  ctx.lineTo(B[0], B[1]);
  ctx.stroke();
}

const LEAF = ['#8a6239', '#a97c4a', '#6b4a2e', '#9a7a3a', '#7d5a2c'];

function leaf(ctx, x, y, a, s, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
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
  ctx.strokeStyle = 'rgba(29,22,14,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-3.5 * s, 0);
  ctx.lineTo(3.5 * s, 0);
  ctx.stroke();
  ctx.restore();
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

function tileDecor(ctx, world, i, j, z, r, kind) {
  const x0 = i * T, y0 = j * T;
  const at = (u, v) => P([x0 + u * T, y0 + v * T, z]);
  if (kind === 'forest') {
    for (let k = 0; k < 5; k++) {
      const p = at(0.1 + r() * 0.8, 0.1 + r() * 0.8);
      leaf(ctx, p[0], p[1], r() * 3, 0.9, '#3a2c1c');
    }
    return;
  }
  // manchas de musgo
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
  // folhas secas (textura principal do chão)
  const n = 4 + Math.floor(r() * 7);
  for (let k = 0; k < n; k++) {
    const p = at(0.05 + r() * 0.9, 0.05 + r() * 0.9);
    leaf(ctx, p[0], p[1], r() * Math.PI, 0.7 + r() * 0.5, LEAF[Math.floor(r() * LEAF.length)]);
  }
  // raiz atravessando
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
    ctx.fillStyle = '#aaa48a';
    ctx.fillRect(p[0] - 2, p[1] - 2, 2, 1);
  }
}

function paintTile(ctx, world, i, j) {
  const h = world.h(i, j);
  const r = rng(i * 92821 + j * 68917 + 7);
  const x0 = i * T, y0 = j * T, x1 = x0 + T, y1 = y0 + T;
  const z = tileTopZ(world, i, j);
  const water = h < 0;

  // faces visíveis (leste e sul) onde o vizinho é mais baixo
  const ze = tileTopZ(world, i + 1, j), zs = tileTopZ(world, i, j + 1);
  if (zs < z) paintFace(ctx, [x0, y1], [x1, y1], z, zs, 'south', r, water);
  if (ze < z) paintFace(ctx, [x1, y1], [x1, y0], z, ze, 'east', r, water);

  // topo
  const top = [P([x0, y0, z]), P([x1, y0, z]), P([x1, y1, z]), P([x0, y1, z])];
  let col;
  const forest = world.isForest(i, j);
  const n = world.noise(i / 5, j / 5);
  if (water) {
    const deep = Math.min(1, (y0 + T / 2 - world.riverY(x0 + T / 2)) / 260);
    col = mix('#8a6a3a', '#4a3a22', deep);
  } else if (forest) col = mix('#2b3524', '#3a4630', r());
  else if (h > 0) col = mix('#5f7444', '#6d7c48', r());
  else col = mix(mix('#6e5634', '#4d6238', n), '#000000', r() * 0.08);
  quad(ctx, top);
  ctx.fillStyle = col;
  ctx.fill();
  // mesma cor no traço: fecha a fresta de antialiasing entre tiles vizinhos
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // emenda dos tiles bem suave (dá a "grade" do isométrico sem virar xadrez)
  if (!water) {
    ctx.strokeStyle = 'rgba(20,16,10,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (water) {
    // sombra do barranco sobre a água
    if (world.h(i, j - 1) >= 0 || world.h(i - 1, j) >= 0) {
      ctx.save();
      quad(ctx, top);
      ctx.clip();
      ctx.fillStyle = 'rgba(30,22,12,0.35)';
      if (world.h(i, j - 1) >= 0) quad(ctx, [top[0], top[1], P([x1, y0 + 18, z]), P([x0, y0 + 18, z])]), ctx.fill();
      if (world.h(i - 1, j) >= 0) quad(ctx, [top[0], P([x0 + 18, y0, z]), P([x0 + 18, y1, z]), top[3]]), ctx.fill();
      ctx.restore();
    }
    return;
  }
  tileDecor(ctx, world, i, j, z, r, forest ? 'forest' : h > 0 ? 'mound' : 'floor');
  // borda de cima de barranco: contorno + luz
  if (zs < z || ze < z) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(244,234,210,0.18)';
    ctx.beginPath();
    if (zs < z) { const a = P([x0, y1 - 2, z]), b = P([x1, y1 - 2, z]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    if (ze < z) { const a = P([x1 - 2, y1, z]), b = P([x1 - 2, y0, z]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
  }
}

// sombras de contato dos objetos (só no chão)
function paintPropShadows(ctx, world, clip) {
  for (const p of world.props) {
    const v = P([p.x, p.y, 0]);
    if (v[0] < clip.x0 - 200 || v[0] > clip.x1 + 200 || v[1] < clip.y0 - 120 || v[1] > clip.y1 + 120) continue;
    const s = p.shadow || 20;
    ctx.fillStyle = 'rgba(12,16,8,0.32)';
    ctx.beginPath();
    ctx.ellipse(v[0] + s * 0.35, v[1] + s * 0.18, s, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function paintTerrainChunk(world, cx, cy, rs) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(CHUNK * rs);
  c.height = Math.ceil(CHUNK * rs);
  const ctx = c.getContext('2d');
  ctx.scale(rs, rs);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = BG;
  ctx.fillRect(cx, cy, CHUNK, CHUNK);
  const clip = { x0: cx, y0: cy, x1: cx + CHUNK, y1: cy + CHUNK };

  // de trás para frente (i + j crescente)
  const tiles = world.tileOrder;
  for (const [i, j] of tiles) {
    const v = P([(i + 0.5) * T, (j + 0.5) * T, 0]);
    if (v[0] < clip.x0 - 60 || v[0] > clip.x1 + 60 || v[1] < clip.y0 - 80 || v[1] > clip.y1 + 220) continue;
    paintTile(ctx, world, i, j);
  }
  paintPropShadows(ctx, world, clip);
  if (world.bakeLight) world.bakeLight(ctx);
  return c;
}

// brilho animado da água (única parte do chão que muda)
export function drawWater(ctx, world, view, t) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#e8c98a';
  ctx.lineWidth = 2;
  for (const [i, j] of world.waterTiles) {
    const c = P([(i + 0.5) * T, (j + 0.5) * T, WATER_Z]);
    if (c[0] < view.x0 - 60 || c[0] > view.x1 + 60 || c[1] < view.y0 - 40 || c[1] > view.y1 + 40) continue;
    for (let k = 0; k < 3; k++) {
      const ph = Math.sin(i * 12.9898 + j * 78.233 + k * 3.1) * 43758.5453;
      const fr = ph - Math.floor(ph);
      const u = ((t * 0.12 + fr) % 1);
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
