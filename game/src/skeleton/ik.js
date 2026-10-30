import { v3 } from '../engine/math.js';

// IK analítico de dois ossos (lei dos cossenos).
// root: ombro/quadril · target: mão/pé desejado · l1, l2: comprimentos · pole: direção para onde o joelho/cotovelo aponta.
// Devolve { joint, end } — end é o alvo limitado ao alcance do membro.
export function solveTwoBone(root, target, l1, l2, pole) {
  const d = v3.sub(target, root);
  let dist = v3.len(d) || 0.0001;
  const dir = v3.scale(d, 1 / dist);
  dist = Math.min(Math.max(dist, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);

  const along = (l1 * l1 + dist * dist - l2 * l2) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));

  // componente do pole perpendicular ao membro
  let p = v3.sub(pole, v3.scale(dir, v3.dot(pole, dir)));
  if (v3.len(p) < 1e-4) p = [0, 0, 1];
  p = v3.norm(p);

  return {
    joint: v3.add(root, v3.add(v3.scale(dir, along), v3.scale(p, h))),
    end: v3.add(root, v3.scale(dir, dist)),
  };
}
