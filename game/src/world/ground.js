import { INK, PAL } from '../art/palette.js';
import { shaded, smooth, blobPts } from '../art/ink.js';
import { rng, makeNoise } from '../engine/math.js';
import { GROUND_K } from '../engine/projection.js';

// Chão estático: gerado como lista de "pinceladas" e pintado UMA vez em chunks offscreen.
export const CHUNK = 512;

export function buildGroundFeatures(world, seed) {
  const r = rng(seed);
  const noise = makeNoise(seed + 7);
  const VW = world.W, VH = world.H * GROUND_K;
  const f = [];

  // manchas de capim e terra (ruído): blobs grandes que se fundem em regiões
  for (let vy = 0; vy < VH; vy += 34) {
    for (let vx = 0; vx < VW; vx += 40) {
      const x = vx + r() * 24, y = vy + r() * 18;
      const wy = y / GROUND_K;
      if (wy > world.riverY(x) - 80) continue;
      const n = noise(x / 260, y / 190) * 0.75 + noise(x / 70, y / 55) * 0.25;
      const rx = 34 + r() * 16;
      if (n > 0.66) f.push({ t: 'patch', layer: 2, x, y, rx, seed: r() * 1e9 });
      if (n > 0.5) f.push({ t: 'patch', layer: 1, x, y, rx, seed: r() * 1e9 });
      else if (n < 0.32) f.push({ t: 'patch', layer: 0, x, y, rx: rx * 0.9, seed: r() * 1e9 });
    }
  }
  // tufos de capim
  for (let i = 0; i < 500; i++) {
    const x = r() * VW, y = r() * VH;
    if (y / GROUND_K > world.riverY(x) - 40) continue;
    f.push({ t: 'tuft', x, y, s: 0.7 + r() * 0.6, seed: r() * 1e9 });
  }
  // folhas secas e pedrinhas
  for (let i = 0; i < 700; i++) {
    const x = r() * VW, y = r() * VH;
    if (y / GROUND_K > world.riverY(x) - 10) continue;
    f.push({ t: r() < 0.75 ? 'leaf' : 'pebble', x, y, a: r() * Math.PI, c: r() });
  }
  return f;
}

function paintRiver(ctx, world, x0, x1) {
  const VH = world.H * GROUND_K;
  const yAt = (x, off = 0) => (world.riverY(x) + off) * GROUND_K;
  const band = (off, fill) => {
    ctx.beginPath();
    ctx.moveTo(x0, VH + 10);
    for (let x = x0; x <= x1 + 8; x += 8) ctx.lineTo(x, yAt(x, off));
    ctx.lineTo(x1 + 8, VH + 10);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  // barranco de lama
  ctx.beginPath();
  ctx.moveTo(x0, VH + 10);
  for (let x = x0; x <= x1 + 8; x += 8) ctx.lineTo(x, yAt(x, -60 - Math.sin(x * 0.02) * 12 - Math.sin(x * 0.007) * 14));
  ctx.lineTo(x1 + 8, VH + 10);
  ctx.closePath();
  ctx.fillStyle = PAL.mud[1];
  ctx.fill();
  band(-26 - 0, PAL.mud[0]);
  // água barrenta (Solimões)
  band(0, PAL.river[1]);
  band(16, PAL.river[0]);
  band(110, '#7d6038');
  // linha d'água
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = x0; x <= x1 + 8; x += 8) (x === x0 ? ctx.moveTo : ctx.lineTo).call(ctx, x, yAt(x));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintForestEdge(ctx, world, seed, clip) {
  const r = rng(seed);
  const VW = world.W;
  const { N, Wb, E } = world.border;
  const blobs = [];
  const add = (x, y, inner) => blobs.push({ x, y, s: 34 + r() * 26, inner });
  for (let x = -40; x < VW + 40; x += 34) {
    for (let k = 0; k < 5; k++) add(x + r() * 20, (N - 30 - k * 40 - r() * 20) * GROUND_K, k === 0);
  }
  const maxY = (world.riverY(0) + 60) * GROUND_K;
  for (let y = N * GROUND_K - 30; y < maxY; y += 30) {
    for (let k = 0; k < 4; k++) {
      add(Wb - 20 - k * 44 - r() * 20, y + r() * 14, k === 0);
      add(VW - E + 20 + k * 44 + r() * 20, y + r() * 14, k === 0);
    }
  }
  // troncos escuros na borda norte (dão profundidade à parede de mata)
  for (let x = 0; x < VW; x += 46 + r() * 30) {
    const y = N * GROUND_K + 6;
    if (x < clip.x0 - 40 || x > clip.x1 + 40) continue;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 5, y - 70, 10, 74);
    ctx.fillStyle = '#2e2a1f';
    ctx.fillRect(x - 3, y - 70, 5, 72);
  }
  blobs.sort((a, b) => (a.inner - b.inner) || a.y - b.y);
  for (const b of blobs) {
    if (b.x < clip.x0 - 80 || b.x > clip.x1 + 80 || b.y < clip.y0 - 80 || b.y > clip.y1 + 80) continue;
    const tones = b.inner ? ['#1f3d2b', '#2c5a3a', '#3f7a47'] : ['#16301f', '#1f3d2b', '#2c5a3a'];
    shaded(ctx, smooth(blobPts(rng(b.x * 7 + b.y * 13), b.x, b.y, b.s, b.s * 0.75, 8, 0.2)), tones, { off: b.s * 0.2, ink: 2 });
  }
}

export function paintGroundChunk(world, features, cx, cy, rs) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(CHUNK * rs);
  c.height = Math.ceil(CHUNK * rs);
  const ctx = c.getContext('2d');
  ctx.scale(rs, rs);
  ctx.translate(-cx, -cy);
  const clip = { x0: cx, y0: cy, x1: cx + CHUNK, y1: cy + CHUNK };
  const inside = (x, y, m) => x > clip.x0 - m && x < clip.x1 + m && y > clip.y0 - m && y < clip.y1 + m;

  ctx.fillStyle = '#665638';
  ctx.fillRect(cx, cy, CHUNK, CHUNK);

  // cada camada em duas passadas (sombra, depois base deslocada) -> regiões fundidas, sem "escamas"
  const LAYERS = [
    ['#5e4630', '#6f5236'], // terra
    ['#3a5232', '#4a6639'], // capim ralo
    ['#2f4a2e', '#3c5c37'], // capim denso
  ];
  for (let layer = 0; layer < 3; layer++) {
    for (const pass of [0, 1]) {
      ctx.fillStyle = LAYERS[layer][pass];
      ctx.beginPath();
      for (const p of features) {
        if (p.t !== 'patch' || p.layer !== layer || !inside(p.x, p.y, 70)) continue;
        const pr = rng(p.seed);
        const o = pass ? -3 : 0;
        smooth(blobPts(pr, p.x + o, p.y + o, p.rx + (pass ? 0 : 2), (p.rx + (pass ? 0 : 2)) * 0.62, 9, 0.28))(ctx);
      }
      ctx.fill();
    }
  }
  paintRiver(ctx, world, clip.x0 - 16, clip.x1 + 16);
  for (const p of features) {
    if (!inside(p.x, p.y, 30)) continue;
    if (p.t === 'leaf') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c < 0.5 ? PAL.earth[2] : p.c < 0.8 ? '#8f5a2e' : '#a8862f';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (p.t === 'pebble') {
      ctx.fillStyle = PAL.stone[0];
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.stone[2];
      ctx.fillRect(p.x - 2, p.y - 1.5, 2, 1);
    } else if (p.t === 'tuft') {
      const tr = rng(p.seed);
      const blades = 3 + Math.floor(tr() * 3);
      ctx.lineCap = 'round';
      for (const [w, col] of [[3.2, '#1f3d2b'], [1.6, null]]) {
        for (let i = 0; i < blades; i++) {
          const a = -Math.PI / 2 + (i / (blades - 1) - 0.5) * 1.6;
          const L = (8 + ((i * 37) % 7)) * p.s;
          ctx.strokeStyle = col || (i % 2 ? '#4a7a3e' : '#5f8f48');
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(p.x + Math.cos(a) * L * 0.4, p.y + Math.sin(a) * L * 0.6, p.x + Math.cos(a) * L, p.y + Math.sin(a) * L);
          ctx.stroke();
        }
      }
    }
  }
  paintForestEdge(ctx, world, 99, clip);
  return c;
}
