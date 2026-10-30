import { INK, PAL } from './palette.js';
import { capsule, shaded, hull, poly, circle } from './ink.js';
import { P, depthOf } from '../engine/projection.js';
import { groundShadow } from './player-art.js';
import { v3 } from '../engine/math.js';

// Volume esférico projetado: pontos do contorno de uma "bola" no mundo.
function ball(c, r, n = 10) {
  const v = P(c);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([v[0] + Math.cos(a) * r, v[1] + Math.sin(a) * r * 0.88]);
  }
  return pts;
}

export function paintCapybara(ctx, pose) {
  const parts = [];
  const add = (depth, fn) => parts.push({ depth, fn });
  const f = pose.fwd, rt = pose.right;

  groundShadow(ctx, pose.center, 30, 12);

  // pernas
  pose.legs.forEach((leg) => {
    // patas sempre por baixo do barril (vista de cima)
    add(depthOf(leg.knee) - 1000, (g) => {
      capsule(g, P(leg.foot), P(v3.add(leg.foot, [f[0] * 3, f[1] * 3, 0])), 5, ['#2a1d14', '#3a2a1c', '#5a4a32'], 1.5);
      capsule(g, P(leg.knee), P(leg.foot), 6.5, PAL.capy, 1.8);
      capsule(g, P(leg.hip), P(leg.knee), 9, PAL.capy, 1.8);
    });
  });

  // corpo em barril (contorno de duas bolas: anca e peito)
  add(depthOf(pose.center) + 2, (g) => {
    const pts = hull([...ball(pose.rump, 18.5), ...ball(pose.chest, 15.5), ...ball(v3.add(pose.rump, [0, 0, 3]), 16)]);
    shaded(g, poly(pts), PAL.capy, { off: 4, ink: 2.2 });
    // pelagem: alguns traços na anca
    g.strokeStyle = 'rgba(29,26,18,0.35)';
    g.lineWidth = 1.2;
    const c = P(pose.rump);
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(c[0] - 6 + i * 4, c[1] - 2 + (i % 2) * 3);
      g.lineTo(c[0] - 3 + i * 4, c[1] + 4 + (i % 2) * 3);
      g.stroke();
    }
  });

  // cabeça quadradona
  add(depthOf(pose.cranium) + 3, (g) => {
    // orelhas atrás
    for (const s of [-1, 1]) {
      const e = P(v3.add(pose.cranium, [rt[0] * s * 4.5 - f[0] * 3, rt[1] * s * 4.5 - f[1] * 3, 7.5]));
      shaded(g, circle(e[0], e[1], 2.8), ['#3a2a1c', PAL.capy[0], PAL.capy[1]], { off: 0.8, ink: 1.4 });
    }
    const snoutLow = v3.add(pose.muzzle, [f[0] * 2, f[1] * 2, -3]);
    const pts = hull([...ball(pose.cranium, 9), ...ball(pose.muzzle, 7.2), ...ball(snoutLow, 5.5)]);
    shaded(g, poly(pts), PAL.capy, { off: 2.6, ink: 2 });
    // focinho mais escuro
    const m = P(v3.add(pose.muzzle, [f[0] * 3, f[1] * 3, 0]));
    g.fillStyle = PAL.capy[0];
    g.beginPath();
    g.ellipse(m[0], m[1] + 1, 4.5, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    // narinas
    if (f[1] > -0.2) {
      for (const s of [-1, 1]) {
        const n = P(v3.add(pose.muzzle, [f[0] * 6.8 + rt[0] * s * 2.4, f[1] * 6.8 + rt[1] * s * 2.4, 1]));
        g.fillStyle = INK;
        g.fillRect(n[0] - 1, n[1] - 0.7, 2, 1.4);
      }
    }
    // olhos (lado visível)
    for (const s of [-1, 1]) {
      const sideY = rt[1] * s;
      if (sideY < -0.2 && f[1] < 0.5) continue;
      const e = P(v3.add(pose.cranium, [rt[0] * s * 6 + f[0] * 3, rt[1] * s * 6 + f[1] * 3, 3]));
      g.fillStyle = INK;
      g.beginPath();
      if (pose.blink) g.rect(e[0] - 1.8, e[1] - 0.4, 3.6, 0.9);
      else g.arc(e[0], e[1], 1.6, 0, Math.PI * 2);
      g.fill();
    }
  });

  parts.sort((a, b) => a.depth - b.depth);
  for (const p of parts) p.fn(ctx);
}

