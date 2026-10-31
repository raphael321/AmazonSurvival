import { Gen, T, HL, BLOCK, DEFAULTS } from '../../game/src/world/gen.js';

// Campo de altura contínuo para o 3D, a partir do MESMO gerador do 2D (Perlin + fBm).
// Unidades de mundo do jogo: x leste, y sul, z para cima. Água na altura 0.

export { T, BLOCK };

export const DEFAULTS3D = {
  ...DEFAULTS,
  heightScale: 1.8, // multiplica a altura (1 nível = 30 unidades); alto = vistas com verticalidade
  terrace: 0, // 0 = encosta suave, 1 = degraus de bloco (estilo 2D)
  maxSlope: 1.5, // inclinação máxima que dá para SUBIR (tangente); descer é livre
  deco: 0.02, // troncos, tocos, ouriços de castanha
  build: 0.01, // construções espalhadas (pré-visualização)
  bridges: 0.75, // chance de ponte em cada trecho de rio (por chunk)
  bridgeSpan: 520, // vão máximo de uma ponte
};

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Field {
  constructor(params) {
    this.p = { ...DEFAULTS3D, ...params };
    this.gen = new Gen(this.p);
  }

  // altura em unidades do jogo (negativa = abaixo d'água)
  H(x, y) {
    const p = this.p, g = this.gen;
    const i = x / T, j = y / T;
    let e = g.elevation(i, j) - p.waterLevel; // em níveis, relativo à água
    if (p.terrace > 0) e += (Math.round(e) - e) * p.terrace;
    let h = e * HL * p.heightScale;
    // rios: escavam as terras baixas
    if (p.riverWidth > 0 && e < 1.5) {
      const rv = g.riverAt(i, j);
      const k = 1 - smooth(p.riverWidth * 0.6, p.riverWidth * 1.6, rv);
      h = h * (1 - k) + Math.min(h, -14) * k;
    }
    return h;
  }

  slope(x, y) {
    const d = 12;
    return Math.hypot(this.H(x + d, y) - this.H(x - d, y), this.H(x, y + d) - this.H(x, y - d)) / (2 * d);
  }

  forest(x, y) {
    return this.gen.forestAt(x / T, y / T) > this.gen.forestTh && this.H(x, y) < this.rockH;
  }

  get rockH() {
    return this.gen.rockLevel * HL * this.p.heightScale;
  }
}
