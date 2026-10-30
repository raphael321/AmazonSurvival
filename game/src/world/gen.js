import { makePerlin, hash2 } from '../engine/perlin.js';

export const T = 64; // lado do tile no mundo
export const BLOCK = 16; // tiles por bloco (objetos e cache de tiles)

// Parâmetros editáveis no debugger. Escalas em tiles (1 tile = 64 unidades).
export const DEFAULTS = {
  seed: 2026,
  octaves: 4,
  persistence: 0.5,
  reliefScale: 9, // tamanho dos morrotes
  reliefAmount: 0.3, // quantidade de morrotes
  highAmount: 0.35, // quanto dos morrotes sobe mais um nível
  riverScale: 55, // tamanho das curvas dos rios
  riverWidth: 0.05, // largura dos rios
  forestScale: 20, // tamanho das manchas de mata fechada
  forestAmount: 0.28, // quantidade de mata fechada
  sunScale: 9, // distância entre clareiras de sol
  sunSize: 1, // tamanho das poças de luz
  acai: 0.02,
  bush: 0.025,
  camu: 0.3,
  rock: 0.012,
  samauma: 0.0015,
  forestTrees: 0.4,
  loadRadius: 1, // anel extra de chunks pré-carregados
};

export const SCHEMA = [
  { group: 'Mundo', key: 'seed', label: 'Seed', min: 1, max: 99999, step: 1 },
  { group: 'Mundo', key: 'octaves', label: 'Oitavas', min: 1, max: 6, step: 1 },
  { group: 'Mundo', key: 'persistence', label: 'Persistência', min: 0.2, max: 0.8, step: 0.05 },
  { group: 'Relevo', key: 'reliefScale', label: 'Tamanho dos morrotes', min: 2, max: 40, step: 1, unit: 'tiles' },
  { group: 'Relevo', key: 'reliefAmount', label: 'Quantidade de morrotes', min: 0, max: 0.6, step: 0.01 },
  { group: 'Relevo', key: 'highAmount', label: 'Morrotes altos', min: 0, max: 1, step: 0.05 },
  { group: 'Rios', key: 'riverScale', label: 'Tamanho das curvas', min: 10, max: 160, step: 1, unit: 'tiles' },
  { group: 'Rios', key: 'riverWidth', label: 'Largura', min: 0, max: 0.25, step: 0.005 },
  { group: 'Mata fechada', key: 'forestScale', label: 'Tamanho das manchas', min: 4, max: 80, step: 1, unit: 'tiles' },
  { group: 'Mata fechada', key: 'forestAmount', label: 'Quantidade', min: 0, max: 0.7, step: 0.01 },
  { group: 'Luz', key: 'sunScale', label: 'Distância entre clareiras', min: 3, max: 30, step: 1, unit: 'tiles' },
  { group: 'Luz', key: 'sunSize', label: 'Tamanho das poças de sol', min: 0.3, max: 2.5, step: 0.05 },
  { group: 'Objetos', key: 'samauma', label: 'Samaúmas', min: 0, max: 0.03, step: 0.001 },
  { group: 'Objetos', key: 'acai', label: 'Açaizeiros', min: 0, max: 0.2, step: 0.005 },
  { group: 'Objetos', key: 'bush', label: 'Moitas', min: 0, max: 0.25, step: 0.005 },
  { group: 'Objetos', key: 'camu', label: 'Camu-camu (beira-rio)', min: 0, max: 0.8, step: 0.01 },
  { group: 'Objetos', key: 'rock', label: 'Pedras', min: 0, max: 0.15, step: 0.005 },
  { group: 'Objetos', key: 'forestTrees', label: 'Árvores na mata', min: 0, max: 1, step: 0.05 },
  { group: 'Desempenho', key: 'loadRadius', label: 'Pré-carregar (chunks)', min: 0, max: 3, step: 1 },
];

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Gen {
  constructor(params) {
    this.p = { ...DEFAULTS, ...params };
    const s = this.p.seed | 0;
    this.relief = makePerlin(s * 3 + 1);
    this.river = makePerlin(s * 3 + 2);
    this.forest = makePerlin(s * 3 + 3);
    this.cache = new Map();
  }

  // campos crus (coordenadas em tiles)
  reliefAt(i, j) {
    const p = this.p;
    return this.relief.fbm(i / p.reliefScale, j / p.reliefScale, p.octaves, p.persistence);
  }
  riverAt(i, j) {
    const p = this.p;
    // ruído "ridged": o rio corre onde o valor cruza zero
    return Math.abs(this.river.fbm(i / p.riverScale, j / p.riverScale, Math.min(3, p.octaves), 0.45));
  }
  forestAt(i, j) {
    const p = this.p;
    return this.forest.fbm(i / p.forestScale, j / p.forestScale, p.octaves, p.persistence);
  }
  get forestTh() {
    return 0.55 - this.p.forestAmount;
  }

  // classifica um bloco de tiles e guarda (altura, mata, profundidade da água)
  block(bi, bj) {
    const k = bi + ',' + bj;
    let b = this.cache.get(k);
    if (b) return b;
    const n = BLOCK * BLOCK;
    b = { h: new Int8Array(n), forest: new Uint8Array(n), deep: new Float32Array(n) };
    const p = this.p;
    const relTh = 0.6 - p.reliefAmount;
    for (let y = 0; y < BLOCK; y++)
      for (let x = 0; x < BLOCK; x++) {
        const i = bi * BLOCK + x, j = bj * BLOCK + y, idx = y * BLOCK + x;
        const rv = this.riverAt(i + 0.5, j + 0.5);
        if (rv < p.riverWidth) {
          b.h[idx] = -1;
          b.deep[idx] = 1 - rv / p.riverWidth;
          continue;
        }
        const nearRiver = rv < p.riverWidth * 2.6;
        const r = this.reliefAt(i + 0.5, j + 0.5);
        let h = 0;
        if (!nearRiver && r > relTh) h = r > relTh + 0.22 * (1 - p.highAmount) + 0.04 && p.highAmount > 0 ? 2 : 1;
        b.h[idx] = h;
        b.forest[idx] = this.forestAt(i + 0.5, j + 0.5) > this.forestTh ? 1 : 0;
      }
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(k, b);
    return b;
  }

  tile(i, j) {
    const bi = Math.floor(i / BLOCK), bj = Math.floor(j / BLOCK);
    return [this.block(bi, bj), (j - bj * BLOCK) * BLOCK + (i - bi * BLOCK)];
  }
  h(i, j) {
    const [b, k] = this.tile(i, j);
    return b.h[k];
  }
  isForest(i, j) {
    const [b, k] = this.tile(i, j);
    return b.forest[k] === 1;
  }
  deep(i, j) {
    const [b, k] = this.tile(i, j);
    return b.deep[k];
  }
  nearWater(i, j, r = 2) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (this.h(i + x, j + y) < 0) return true;
    return false;
  }

  // objetos de um bloco: decididos por hash, sem guardar estado
  props(bi, bj) {
    const p = this.p, s = p.seed | 0;
    const out = [];
    for (let y = 0; y < BLOCK; y++)
      for (let x = 0; x < BLOCK; x++) {
        const i = bi * BLOCK + x, j = bj * BLOCK + y;
        const h = this.h(i, j);
        if (h !== 0) continue;
        const r = hash2(i, j, s + 11);
        const v = hash2(i, j, s + 23);
        const jx = (hash2(i, j, s + 37) - 0.5) * 0.5, jy = (hash2(i, j, s + 41) - 0.5) * 0.5;
        const px = (i + 0.5 + jx) * T, py = (j + 0.5 + jy) * T;
        const id = i + ',' + j;
        if (this.isForest(i, j)) {
          if (r < p.forestTrees) out.push({ id, kind: 'forest', x: px, y: py, variant: Math.floor(v * 6), shadow: 24 });
          continue;
        }
        let acc = p.samauma;
        if (r < acc) {
          out.push({ id, kind: 'samauma', x: px, y: py, variant: Math.floor(v * 2), shadow: 70, collider: 62, canopy: 300 });
          continue;
        }
        if (this.nearWater(i, j)) {
          acc += p.camu * 0.3;
          if (r < acc) { out.push({ id, kind: 'bush', fruit: true, x: px, y: py, variant: Math.floor(v * 4), shadow: 30, collider: 18 }); continue; }
        }
        if (r < (acc += p.acai)) { out.push({ id, kind: 'acai', x: px, y: py, variant: Math.floor(v * 6), shadow: 22, collider: 14, canopy: 110 }); continue; }
        if (r < (acc += p.bush)) { out.push({ id, kind: 'bush', fruit: false, x: px, y: py, variant: Math.floor(v * 6), shadow: 30, collider: 18 }); continue; }
        if (r < (acc += p.rock)) {
          const size = 0.7 + hash2(i, j, s + 53) * 0.7;
          out.push({ id, kind: 'rock', x: px, y: py, variant: Math.floor(v * 6), size, shadow: 26 * size, collider: 26 * size });
        }
      }
    return out;
  }

  // clareiras de sol: uma por célula (com chance), longe da mata fechada
  sunSpot(ci, cj) {
    const p = this.p, s = p.seed | 0;
    if (hash2(ci, cj, s + 71) > 0.7) return null;
    const i = (ci + 0.2 + hash2(ci, cj, s + 73) * 0.6) * p.sunScale;
    const j = (cj + 0.2 + hash2(ci, cj, s + 79) * 0.6) * p.sunScale;
    if (this.forestAt(i, j) > this.forestTh - 0.05) return null;
    return { x: i * T, y: j * T, r: (150 + hash2(ci, cj, s + 83) * 110) * p.sunSize };
  }

  spotsNear(x0, y0, x1, y1) {
    const c = this.p.sunScale * T;
    const out = [];
    for (let cj = Math.floor(y0 / c) - 1; cj <= Math.floor(y1 / c) + 1; cj++)
      for (let ci = Math.floor(x0 / c) - 1; ci <= Math.floor(x1 / c) + 1; ci++) {
        const sp = this.sunSpot(ci, cj);
        if (sp) out.push(sp);
      }
    return out;
  }

  // luz no chão (0..~1.05) e parcela de sol (para o brilho dourado)
  lightAt(x, y, spots) {
    const f = this.forestAt(x / T, y / T);
    const th = this.forestTh;
    const shade = 1 - 0.5 * smooth(th - 0.25, th + 0.04, f);
    let sun = 0;
    for (const sp of spots) {
      const d = Math.hypot(x - sp.x, y - sp.y) / sp.r;
      if (d < 2) sun = Math.max(sun, Math.exp(-d * d * 2.2));
    }
    return { L: Math.min(1.05, 0.78 * shade + 0.3 * sun), sun };
  }
}
