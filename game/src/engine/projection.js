// Projeção isométrica (losango a 45°), estilo Dunloc/Hades.
// Mundo: x (leste), y (sul), z (para cima). A câmera olha de (+x,+y) para o centro.
// Vista: pixels antes da câmera.

export const ISO_X = 0.7071; // multiplica (x - y)
export const ISO_Y = 0.41; // multiplica (x + y): ~35° de elevação
export const Z_K = 0.86;

export const P = (p) => [(p[0] - p[1]) * ISO_X, (p[0] + p[1]) * ISO_Y - p[2] * Z_K];
export const toView = (x, y, z = 0) => [(x - y) * ISO_X, (x + y) * ISO_Y - z * Z_K];

// vista -> chão (z = 0)
export function groundFromView(vx, vy) {
  const a = vx / ISO_X, b = vy / ISO_Y; // a = x - y, b = x + y
  return [(a + b) / 2, (b - a) / 2];
}

// quanto uma direção do chão aponta para a câmera (1 = de frente)
export const camDot = (dx, dy) => (dx + dy) * 0.7071;

// Profundidade (maior = mais perto da câmera).
export const depthOf = (p) => p[0] + p[1] + p[2] * 0.6;
export const sortKey = (x, y) => x + y;

// Direções de tela -> direções do mundo (WASD relativo à tela)
export function screenDirToWorld(sx, sy) {
  const x = (sx / ISO_X + sy / ISO_Y) / 2;
  const y = (sy / ISO_Y - sx / ISO_X) / 2;
  const l = Math.hypot(x, y);
  return l ? [x / l, y / l] : [0, 0];
}
