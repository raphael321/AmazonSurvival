import { INK, PAL } from './palette.js';
import { shaded, capsule, poly, blobPts, smooth, circle } from './ink.js';
import { makeSprite } from './sprite.js';
import { rng } from '../engine/math.js';

// Funções puras de pintura do cenário. Cada uma recebe uma seed e devolve sprites
// pintados uma única vez. Todas as medidas estão em unidades de vista (já projetadas).

const GREENS = ['#1f3d2b', '#2c5a3a', '#3f7a47', '#4f9a4a', '#6fb85a', '#9fd16b'];
const greenTones = (l) => {
  const i = Math.max(0, Math.min(3, Math.round(l * 3)));
  return [GREENS[i], GREENS[i + 1], GREENS[i + 2]];
};

// Um tufo de folhas: vários blobs sobrepostos de trás para frente.
function leafMass(ctx, r, { w, h, cx = 0, cy = 0, n, size, light = 0.5, dark = 0 }) {
  const clumps = [];
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;
    const top = Math.sqrt(1 - u * u);
    const x = cx + u * w * 0.5;
    const y = cy - r() * top * h;
    clumps.push({ x, y, s: size * (0.7 + r() * 0.5), u });
  }
  // de cima para baixo: os de baixo ficam na frente
  clumps.sort((a, b) => a.y - b.y);
  for (const c of clumps) {
    const height = (cy - c.y) / h; // 0 embaixo, 1 no topo
    const l = Math.max(0, Math.min(1, dark + height * light + (-c.u) * 0.15 + r() * 0.15));
    shaded(ctx, smooth(blobPts(r, c.x, c.y, c.s, c.s * 0.8, 8, 0.22)), greenTones(l), { off: c.s * 0.22, ink: 2 });
  }
}

// ---------- Samaúma (Ceiba pentandra): raízes tabulares + copa em guarda-chuva ----------
export function paintSamauma(seed, rs) {
  const r = rng(seed);
  const H = 330; // altura do tronco até a copa
  const fins = [];
  const nf = 6;
  for (let i = 0; i < nf; i++) {
    const a = (i / nf) * Math.PI * 2 + r() * 0.5;
    fins.push({ a, L: 80 + r() * 45, h: 70 + r() * 50, t: 7 + r() * 4 });
  }
  const fin = (ctx, f) => {
    const c = Math.cos(f.a), s = Math.sin(f.a);
    const px = -s * f.t, py = c * f.t * 0.72;
    const top = [c * 16, s * 16 * 0.72 - f.h];
    const tip = [c * f.L, s * f.L * 0.72];
    const ctl = [c * f.L * 0.45, s * f.L * 0.45 * 0.72 - f.h * 0.2];
    const base1 = [c * 18 + px, s * 18 * 0.72 + py];
    const base2 = [c * 18 - px, s * 18 * 0.72 - py];
    shaded(ctx, (g) => {
      g.moveTo(top[0] - px * 0.4, top[1]);
      g.quadraticCurveTo(ctl[0] - px, ctl[1] - py, tip[0], tip[1]);
      g.lineTo(base1[0], base1[1]);
      g.lineTo(base2[0], base2[1]);
      g.quadraticCurveTo(ctl[0] + px, ctl[1] + py, top[0] + px * 0.4, top[1]);
      g.closePath();
    }, PAL.bark, { off: 4, ink: 2.2 });
  };

  const trunk = makeSprite(360, 470, 180, 390, rs, (ctx) => {
    fins.filter((f) => Math.sin(f.a) < 0).forEach((f) => fin(ctx, f));
    // galhos que sobem para a copa
    const br = [[-120, -H - 50, 15], [110, -H - 60, 15], [-50, -H - 80, 12], [60, -H - 75, 11]];
    for (const [bx, by, w] of br) capsule(ctx, [bx * 0.2, -H + 10], [bx, by], w, PAL.bark, 2.2);
    // tronco
    const pts = [];
    const wob = r() * 6;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push([-(28 - t * 10) + Math.sin(t * 4 + wob) * 3, -t * H]);
    }
    for (let i = 8; i >= 0; i--) {
      const t = i / 8;
      pts.push([(28 - t * 10) + Math.sin(t * 4 + wob) * 3, -t * H]);
    }
    shaded(ctx, poly(pts), PAL.bark, { off: 7, ink: 2.5 });
    // textura de casca
    ctx.strokeStyle = 'rgba(29,26,18,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const x = -18 + r() * 34, y0 = -r() * H, len = 20 + r() * 40;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.quadraticCurveTo(x + 3, y0 - len / 2, x, y0 - len);
      ctx.stroke();
    }
    fins.filter((f) => Math.sin(f.a) >= 0).sort((a, b) => Math.sin(a.a) - Math.sin(b.a)).forEach((f) => fin(ctx, f));
  });

  const canopy = makeSprite(560, 300, 280, 240, rs, (ctx) => {
    leafMass(ctx, r, { w: 500, h: 170, cy: -10, n: 48, size: 42, light: 0.75, dark: 0.05 });
  });
  return { trunk, canopy, canopyY: -H + 40 };
}

// ---------- Açaizeiro (Euterpe oleracea): touceira de estipes finos, folhas pendentes ----------
export function paintAcai(seed, rs) {
  const r = rng(seed);
  const n = 1 + Math.floor(r() * 3);
  const stems = [];
  for (let i = 0; i < n; i++) {
    stems.push({ x: (i - (n - 1) / 2) * 14 + r() * 6, h: 170 + r() * 70, lean: (r() - 0.5) * 50 });
  }
  const tops = stems.map((s) => [s.x + s.lean, -s.h]);
  const minTop = Math.min(...tops.map((t) => t[1]));

  const trunk = makeSprite(200, 340, 100, 320, rs, (ctx) => {
    for (const s of stems) {
      // raízes avermelhadas
      for (let k = -1; k <= 1; k++) capsule(ctx, [s.x, -14], [s.x + k * 9, 2], 3, PAL.fire, 1.2);
      const top = [s.x + s.lean, -s.h];
      const mid = [s.x + s.lean * 0.3, -s.h * 0.5];
      ctx.lineCap = 'round';
      for (const [w, c] of [[9, INK], [6, PAL.bark[0]], [3.5, PAL.bark[1]]]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(s.x, 0);
        ctx.quadraticCurveTo(mid[0], mid[1], top[0], top[1] + 30);
        ctx.stroke();
      }
      // anéis
      ctx.strokeStyle = 'rgba(29,26,18,0.5)';
      ctx.lineWidth = 1;
      for (let y = -12; y > -s.h + 34; y -= 11) {
        const t = -y / s.h;
        const x = s.x + s.lean * 0.6 * t * (1 - t) + s.lean * t * t;
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x + 3, y);
        ctx.stroke();
      }
      // palmito (bainha verde)
      capsule(ctx, [top[0] - s.lean * 0.05, top[1] + 32], [top[0], top[1] + 2], 8, PAL.forestDeep, 1.8);
    }
  });

  const crown = makeSprite(320, 260, 160, 70, rs, (ctx) => {
    for (let si = 0; si < stems.length; si++) {
      const [tx, ty0] = tops[si];
      const ty = ty0 - minTop; // relativo ao pivô (topo mais alto)
      // cacho de açaí
      const bx = tx + 6, by = ty + 22;
      capsule(ctx, [tx, ty + 12], [bx + 6, by], 2.5, PAL.fire, 1);
      for (let k = 0; k < 14; k++) {
        const fx = bx + (r() - 0.3) * 14, fy = by + r() * 16;
        shaded(ctx, circle(fx, fy, 2.6), PAL.acai, { off: 0.8, ink: 1 });
      }
      const fronds = 9 + Math.floor(r() * 3);
      const order = [];
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * Math.PI * 2 + r() * 0.4;
        order.push({ a, L: 62 + r() * 28 });
      }
      // folhas de trás primeiro
      order.sort((p, q) => Math.sin(p.a) - Math.sin(q.a));
      for (const f of order) {
        const dx = Math.cos(f.a), dy = Math.sin(f.a) * 0.45;
        const end = [tx + dx * f.L, ty + dy * f.L + 30];
        const ctl = [tx + dx * f.L * 0.5, ty + dy * f.L * 0.5 - 26];
        const front = Math.sin(f.a) > 0;
        const tone = front ? '#4f9a4a' : '#3f7a47';
        const dark = front ? '#2c5a3a' : '#1f3d2b';
        // folíolos pendentes
        for (let k = 1; k <= 14; k++) {
          const t = k / 15;
          const px = (1 - t) * (1 - t) * tx + 2 * (1 - t) * t * ctl[0] + t * t * end[0];
          const py = (1 - t) * (1 - t) * ty + 2 * (1 - t) * t * ctl[1] + t * t * end[1];
          const len = 18 * (1 - t * 0.5);
          for (const [w, c] of [[3, INK], [1.6, k % 3 ? tone : dark]]) {
            ctx.strokeStyle = c;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + dx * 3, py + len);
            ctx.stroke();
          }
        }
        for (const [w, c] of [[3.4, INK], [1.6, dark]]) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.quadraticCurveTo(ctl[0], ctl[1], end[0], end[1]);
          ctx.stroke();
        }
      }
    }
  });
  return { trunk, crown, crownY: minTop };
}

// ---------- Arbusto (camu-camu quando tem frutos) ----------
export function paintBush(seed, rs, { fruit = false, scale = 1 } = {}) {
  const r = rng(seed);
  const w = (60 + r() * 30) * scale, h = (40 + r() * 20) * scale;
  const sprite = makeSprite(w + 40, h + 60, (w + 40) / 2, h + 30, rs, (ctx) => {
    leafMass(ctx, r, { w, h, cy: 6, n: Math.round(10 * scale) + 4, size: 15 * scale, light: 0.6, dark: fruit ? 0.12 : 0.05 });
  });
  const fruits = [];
  if (fruit) {
    for (let i = 0; i < 6; i++) {
      const u = r() * 1.6 - 0.8;
      fruits.push([u * w * 0.45, -r() * Math.sqrt(1 - u * u * 0.8) * h * 0.8 - 2]);
    }
  }
  return { sprite, fruits, w, h };
}

export function drawFruit(ctx, x, y, s = 1) {
  shaded(ctx, circle(x, y, 3.6 * s), PAL.camu, { off: 1.1 * s, ink: 1.4 });
}

// ---------- Pedra ----------
export function paintRock(seed, rs, size = 1) {
  const r = rng(seed);
  const w = (34 + r() * 30) * size, h = (20 + r() * 18) * size;
  return makeSprite(w * 2 + 20, h * 2 + 20, w + 10, h + 12, rs, (ctx) => {
    const pts = blobPts(r, 0, -h * 0.45, w * 0.5, h * 0.6, 7, 0.18).map(([x, y]) => [x, Math.min(y, 4)]);
    shaded(ctx, poly(pts), PAL.stone, { off: h * 0.18, ink: 2.2 });
    // musgo no topo
    if (r() < 0.7) {
      const mx = (r() - 0.6) * w * 0.4, my = -h * 0.85;
      shaded(ctx, smooth(blobPts(r, mx, my, w * 0.22, h * 0.14, 6, 0.3)), ['#2c5a3a', '#3f7a47', '#4f9a4a'], { off: 1.5, ink: 1.2 });
    }
    ctx.strokeStyle = 'rgba(29,26,18,0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, -h * 0.7);
    ctx.lineTo(w * 0.18, -h * 0.4);
    ctx.lineTo(w * 0.1, -h * 0.15);
    ctx.stroke();
  });
}
