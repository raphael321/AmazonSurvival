import { INK, PAL } from './palette.js';
import { capsule, shaded, circle, hull, poly, ellipse } from './ink.js';
import { P, depthOf, camDot, ISO_X, ISO_Y } from '../engine/projection.js';
import { v3 } from '../engine/math.js';

// Pinta o sobrevivente a partir da pose do esqueleto (pontos 3D no mundo).
// Cada parte vira uma camada com profundidade; ordenamos e pintamos de trás para frente.

export function groundShadow(ctx, p, rx, ry) {
  const v = P([p[0], p[1], 0]);
  ctx.fillStyle = 'rgba(29,26,18,0.3)';
  ctx.beginPath();
  ctx.ellipse(v[0] + rx * 0.25, v[1] + ry * 0.35, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function paintPlayer(ctx, pose, trail) {
  const parts = [];
  const add = (depth, fn) => parts.push({ depth, fn });
  const mid = (a, b) => v3.lerp(a, b, 0.5);

  groundShadow(ctx, pose.pelvis, 17, 7);

  // pernas
  for (const [hip, kn, ft] of [[pose.hipL, pose.knL, pose.ftL], [pose.hipR, pose.knR, pose.ftR]]) {
    add(depthOf(kn) - 0.5, (g) => {
      const toe = v3.add(ft, [pose.fwd[0] * 6, pose.fwd[1] * 6, 0]);
      capsule(g, P(ft), P(toe), 6, ['#1d1510', '#3a2a1c', '#5a4a32'], 1.8);
      capsule(g, P(kn), P(ft), 8, PAL.pants, 2);
      capsule(g, P(hip), P(kn), 9.5, PAL.pants, 2);
    });
  }

  // tronco (contorno convexo de pontos do quadril e do peito)
  add(depthOf(mid(pose.pelvis, pose.chest)), (g) => {
    const fw = [pose.fwd[0], pose.fwd[1], 0];
    const pts = [
      pose.hipL, pose.hipR, pose.shL, pose.shR,
      v3.add(pose.chest, v3.scale(fw, 5.5)), v3.add(pose.chest, v3.scale(fw, -5.5)),
      v3.add(pose.pelvis, v3.scale(fw, 5)), v3.add(pose.pelvis, v3.scale(fw, -5)),
      v3.add(pose.shL, [0, 0, 2]), v3.add(pose.shR, [0, 0, 2]),
    ].map(P);
    shaded(g, poly(hull(pts)), PAL.shirt, { off: 3.2, ink: 2.2 });
    // cinto
    capsule(g, P(v3.add(pose.hipL, [0, 0, 2])), P(v3.add(pose.hipR, [0, 0, 2])), 3, ['#1d1510', '#3a2a1c', '#5a4a32'], 1);
    // pescoço
    capsule(g, P(pose.neck), P(v3.add(pose.chest, [0, 0, 3])), 6, PAL.skin, 1.6);
  });

  // braços
  const arm = (sh, el, h) => (g) => {
    capsule(g, P(el), P(h), 6, PAL.skin, 1.8);
    capsule(g, P(sh), P(el), 7.5, PAL.shirt, 2);
    shaded(g, circle(...P(h), 3.4), PAL.skin, { off: 1, ink: 1.6 });
  };
  add(depthOf(pose.elL), arm(pose.shL, pose.elL, pose.hL));
  add(depthOf(pose.elR), arm(pose.shR, pose.elR, pose.hR));

  // facão
  add(depthOf(mid(pose.bladeBase, pose.bladeTip)) + 0.3, (g) => paintMachete(g, pose));

  // cabeça
  add(depthOf(pose.head) + 4, (g) => paintHead(g, pose));

  parts.sort((a, b) => a.depth - b.depth);
  for (const p of parts) p.fn(ctx);

  paintTrail(ctx, trail);
}

function paintMachete(g, pose) {
  const d = pose.bladeDir;
  const h0 = P(v3.add(pose.bladeBase, v3.scale(d, -5)));
  const h1 = P(v3.add(pose.bladeBase, v3.scale(d, 3)));
  const tip = P(pose.bladeTip);
  const dx = tip[0] - h1[0], dy = tip[1] - h1[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const at = (t, w) => [h1[0] + dx * t + nx * w, h1[1] + dy * t + ny * w];
  // lâmina larga na ponta, como um facão de mato
  const pts = [at(0, -1.6), at(0.75, -2.6), at(1, 0.4), at(0.85, 3.2), at(0, 2)];
  shaded(g, poly(pts), PAL.steel, { off: 1, ink: 1.6 });
  capsule(g, h0, h1, 3.6, ['#3a2a1c', '#6b4a2e', '#8a6239'], 1.4);
  // mão por cima do cabo
  shaded(g, circle(...P(pose.hR), 3.4), PAL.skin, { off: 1, ink: 1.6 });
}

function paintHead(g, pose) {
  const hp = P(pose.head);
  const R = 9.2;
  const f = pose.headFwd, r = pose.headRight;
  // cabeça
  shaded(g, circle(hp[0], hp[1], R), PAL.skin, { off: 2.2, ink: 0 });
  // cabelo: círculo deslocado para trás e para cima, recortado na cabeça
  g.save();
  g.beginPath();
  g.arc(hp[0], hp[1], R + 0.6, 0, Math.PI * 2);
  g.clip();
  const back = [(-f[0] + f[1]) * 4.2 * ISO_X, (-f[0] - f[1]) * 4.2 * ISO_Y - 3.6];
  shaded(g, circle(hp[0] + back[0], hp[1] + back[1], R * 0.98), PAL.hair, { off: 1.6, ink: 0 });
  g.restore();

  // olhos e nariz só quando o rosto está virado para a câmera
  const toCam = camDot(f[0], f[1]);
  if (toCam > -0.25) {
    for (const side of [-1, 1]) {
      const dir = [f[0] * 0.88 + r[0] * side * 0.42, f[1] * 0.88 + r[1] * side * 0.42];
      if (camDot(dir[0], dir[1]) < -0.15) continue;
      const e = P(v3.add(pose.head, [dir[0] * 8.2, dir[1] * 8.2, -0.5]));
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(e[0], e[1], 1.3, 2, 0, 0, Math.PI * 2);
      g.fill();
    }
    const n = P(v3.add(pose.head, [f[0] * 9.3, f[1] * 9.3, -3]));
    g.fillStyle = PAL.skin[0];
    g.beginPath();
    g.ellipse(n[0], n[1], 1.4, 1, 0, 0, Math.PI * 2);
    g.fill();
  }
  // orelha do lado visível
  for (const side of [-1, 1]) {
    const sx = r[0] * side, sy = r[1] * side;
    if (camDot(sx, sy) < 0.25) continue;
    const e = P(v3.add(pose.head, [sx * 8.5 - f[0] * 1, sy * 8.5 - f[1] * 1, -1]));
    shaded(g, ellipse(e[0], e[1], 2, 2.8), PAL.skin, { off: 0.8, ink: 1.3 });
  }
  g.beginPath();
  g.arc(hp[0], hp[1], R, 0, Math.PI * 2);
  g.lineWidth = 2.2;
  g.strokeStyle = INK;
  g.stroke();
}

function paintTrail(ctx, trail) {
  if (trail.length < 2) return;
  for (let i = 0; i < trail.length - 1; i++) {
    const a = trail[i], b = trail[i + 1];
    const alpha = Math.max(0, 1 - b.age / 0.16) * 0.8;
    const pts = [P(a.tip), P(b.tip), P(b.base), P(a.base)];
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#f7dc9a';
    ctx.beginPath();
    poly(pts)(ctx);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // contorno da borda externa do rastro
  ctx.strokeStyle = 'rgba(29,26,18,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  trail.forEach((p, i) => {
    const v = P(p.tip);
    if (i) ctx.lineTo(v[0], v[1]);
    else ctx.moveTo(v[0], v[1]);
  });
  ctx.stroke();
}
