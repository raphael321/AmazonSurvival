import { makePerlin, hash2 } from '../engine/perlin.js';

export const T = 64; // lado do tile no mundo
export const BLOCK = 16; // tiles por bloco (objetos e cache de tiles)

export const HL = 30; // altura de um nível de bloco (unidades de mundo)

// Parâmetros editáveis no debugger. Escalas em tiles (1 tile = 64 unidades).
export const DEFAULTS = {
  seed: 2026,
  // ruído do relevo (mapa de altura)
  frequency: 0.045, // ciclos por tile: menor = montanhas maiores
  octaves: 5,
  persistence: 0.45,
  lacunarity: 2.1,
  // forma
  maxHeight: 9, // altura máxima em níveis de bloco
  heightExponent: 1.6, // >1 achata os vales e afia os picos
  waterLevel: 2.2, // abaixo disso (em níveis) vira água
  rockLine: 0.62, // a partir desta fração da altura a mata dá lugar à rocha
  // rios (ruído "ridged" só nas terras baixas)
  riverScale: 55,
  riverWidth: 0.035,
  // mata fechada
  forestScale: 20,
  forestAmount: 0.28,
  // luz
  sunScale: 9,
  sunSize: 1,
  // objetos
  acai: 0.02,
  bush: 0.025,
  camu: 0.3,
  rock: 0.012,
  samauma: 0.0015,
  forestTrees: 0.4,
  // câmera e desempenho
  zoom: 1,
  loadRadius: 1,
};

// Pastas do painel. `folder` agrupa; `sub` é a subpasta (como no Tweakpane).
export const SCHEMA = [
  { folder: 'Terreno', sub: 'Ruído', key: 'frequency', label: 'frequência', min: 0.005, max: 0.2, step: 0.001 },
  { folder: 'Terreno', sub: 'Ruído', key: 'octaves', label: 'oitavas', min: 1, max: 8, step: 1 },
  { folder: 'Terreno', sub: 'Ruído', key: 'persistence', label: 'persistência', min: 0.1, max: 0.9, step: 0.01 },
  { folder: 'Terreno', sub: 'Ruído', key: 'lacunarity', label: 'lacunaridade', min: 1.2, max: 3.5, step: 0.05 },
  { folder: 'Terreno', sub: 'Forma', key: 'maxHeight', label: 'altura máx.', min: 1, max: 16, step: 1, unit: 'níveis' },
  { folder: 'Terreno', sub: 'Forma', key: 'heightExponent', label: 'expoente', min: 0.4, max: 4, step: 0.05 },
  { folder: 'Terreno', sub: 'Forma', key: 'waterLevel', label: 'nível da água', min: 0, max: 8, step: 0.1, unit: 'níveis' },
  { folder: 'Terreno', sub: 'Forma', key: 'rockLine', label: 'linha da rocha', min: 0.2, max: 1, step: 0.01 },
  { folder: 'Terreno', sub: 'Rios', key: 'riverScale', label: 'tamanho das curvas', min: 10, max: 160, step: 1, unit: 'tiles' },
  { folder: 'Terreno', sub: 'Rios', key: 'riverWidth', label: 'largura', min: 0, max: 0.2, step: 0.005 },
  { folder: 'Bioma', sub: 'Mata fechada', key: 'forestScale', label: 'tamanho das manchas', min: 4, max: 80, step: 1, unit: 'tiles' },
  { folder: 'Bioma', sub: 'Mata fechada', key: 'forestAmount', label: 'quantidade', min: 0, max: 0.7, step: 0.01 },
  { folder: 'Bioma', sub: 'Luz', key: 'sunScale', label: 'distância das clareiras', min: 3, max: 30, step: 1, unit: 'tiles' },
  { folder: 'Bioma', sub: 'Luz', key: 'sunSize', label: 'tamanho das poças', min: 0.3, max: 2.5, step: 0.05 },
  { folder: 'Bioma', sub: 'Objetos', key: 'samauma', label: 'samaúmas', min: 0, max: 0.03, step: 0.001 },
  { folder: 'Bioma', sub: 'Objetos', key: 'acai', label: 'açaizeiros', min: 0, max: 0.2, step: 0.005 },
  { folder: 'Bioma', sub: 'Objetos', key: 'bush', label: 'moitas', min: 0, max: 0.25, step: 0.005 },
  { folder: 'Bioma', sub: 'Objetos', key: 'camu', label: 'camu-camu', min: 0, max: 0.8, step: 0.01 },
  { folder: 'Bioma', sub: 'Objetos', key: 'rock', label: 'pedras', min: 0, max: 0.15, step: 0.005 },
  { folder: 'Bioma', sub: 'Objetos', key: 'forestTrees', label: 'árvores na mata', min: 0, max: 1, step: 0.05 },
  { folder: 'Mundo', sub: 'Geral', key: 'seed', label: 'seed', min: 1, max: 99999, step: 1 },
  { folder: 'Mundo', sub: 'Câmera', key: 'zoom', label: 'zoom', min: 0.35, max: 1.6, step: 0.05 },
  { folder: 'Mundo', sub: 'Câmera', key: 'loadRadius', label: 'pré-carregar', min: 0, max: 3, step: 1, unit: 'chunks' },
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
    // maior nível de terra possível (para margens de pintura e oclusão)
    this.maxLand = Math.max(1, Math.ceil(this.p.maxHeight - this.p.waterLevel));
    this.rockLevel = Math.max(1, Math.round(this.maxLand * this.p.rockLine));
  }

  // altura contínua em níveis (antes de cortar pela água): fbm -> [0,1] -> expoente -> escala
  elevation(i, j) {
    const p = this.p;
    const n = this.relief.fbm(i * p.frequency, j * p.frequency, p.octaves, p.persistence, p.lacunarity);
    // o fBm raramente passa de ±0.55: estica para usar a faixa toda de alturas
    const n01 = Math.max(0, Math.min(1, 0.5 + n * 1.5));
    return Math.pow(n01, p.heightExponent) * p.maxHeight;
  }
  riverAt(i, j) {
    const p = this.p;
    // ruído "ridged": o rio corre onde o valor cruza zero
    return Math.abs(this.river.fbm(i / p.riverScale, j / p.riverScale, 3, 0.45));
  }
  forestAt(i, j) {
    const p = this.p;
    return this.forest.fbm(i / p.forestScale, j / p.forestScale, 4, 0.5);
  }
  get forestTh() {
    return 0.55 - this.p.forestAmount;
  }

  // classifica um bloco de tiles e guarda (nível, mata, profundidade da água)
  block(bi, bj) {
    const k = bi + ',' + bj;
    let b = this.cache.get(k);
    if (b) return b;
    const n = BLOCK * BLOCK;
    b = { h: new Int8Array(n), forest: new Uint8Array(n), deep: new Float32Array(n) };
    const p = this.p;
    const W = p.waterLevel;
    for (let y = 0; y < BLOCK; y++)
      for (let x = 0; x < BLOCK; x++) {
        const i = bi * BLOCK + x, j = bj * BLOCK + y, idx = y * BLOCK + x;
        const e = this.elevation(i + 0.5, j + 0.5);
        const rv = p.riverWidth > 0 ? this.riverAt(i + 0.5, j + 0.5) : 1;
        const river = rv < p.riverWidth && e - W < 1.5;
        if (e < W || river) {
          b.h[idx] = -1;
          b.deep[idx] = river && e >= W ? 1 - rv / p.riverWidth : Math.min(1, (W - e) / Math.max(0.5, W));
          continue;
        }
        const h = Math.min(120, Math.floor(e - W));
        b.h[idx] = h;
        b.forest[idx] = h < this.rockLevel && this.forestAt(i + 0.5, j + 0.5) > this.forestTh ? 1 : 0;
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
        if (h < 0) continue;
        const z = h * HL;
        const rocky = h >= this.rockLevel;
        const r = hash2(i, j, s + 11);
        const v = hash2(i, j, s + 23);
        const jx = (hash2(i, j, s + 37) - 0.5) * 0.5, jy = (hash2(i, j, s + 41) - 0.5) * 0.5;
        const px = (i + 0.5 + jx) * T, py = (j + 0.5 + jy) * T;
        const id = i + ',' + j;
        if (this.isForest(i, j)) {
          if (r < p.forestTrees) out.push({ id, kind: 'forest', x: px, y: py, z, variant: Math.floor(v * 6), shadow: 24 });
          continue;
        }
        if (rocky) {
          if (r < p.rock * 4) {
            const size = 0.8 + hash2(i, j, s + 53) * 0.8;
            out.push({ id, kind: 'rock', x: px, y: py, z, variant: Math.floor(v * 6), size, shadow: 26 * size, collider: 26 * size });
          }
          continue;
        }
        let acc = p.samauma;
        if (r < acc) {
          out.push({ id, kind: 'samauma', x: px, y: py, z, variant: Math.floor(v * 2), shadow: 70, collider: 62, canopy: 300 });
          continue;
        }
        if (this.nearWater(i, j)) {
          acc += p.camu * 0.3;
          if (r < acc) { out.push({ id, kind: 'bush', fruit: true, x: px, y: py, z, variant: Math.floor(v * 4), shadow: 30, collider: 18 }); continue; }
        }
        if (r < (acc += p.acai)) { out.push({ id, kind: 'acai', x: px, y: py, z, variant: Math.floor(v * 6), shadow: 22, collider: 14, canopy: 110 }); continue; }
        if (r < (acc += p.bush)) { out.push({ id, kind: 'bush', fruit: false, x: px, y: py, z, variant: Math.floor(v * 6), shadow: 30, collider: 18 }); continue; }
        if (r < (acc += p.rock)) {
          const size = 0.7 + hash2(i, j, s + 53) * 0.7;
          out.push({ id, kind: 'rock', x: px, y: py, z, variant: Math.floor(v * 6), size, shadow: 26 * size, collider: 26 * size });
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
