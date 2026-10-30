// Projeção 3/4: mundo (x leste, y sul, z para cima) -> "vista" (pixels antes da câmera).
// O chão é achatado (GROUND_K) e a altura sobe na tela (Z_K).

export const GROUND_K = 0.72;
export const Z_K = 0.92;

export const toView = (x, y, z = 0) => [x, y * GROUND_K - z * Z_K];
export const P = (p) => [p[0], p[1] * GROUND_K - p[2] * Z_K];
export const groundFromView = (vx, vy) => [vx, vy / GROUND_K];

// Profundidade para ordenar partes do mesmo corpo (maior = mais perto da câmera).
export const depthOf = (p) => p[1] + p[2] * 0.3;
