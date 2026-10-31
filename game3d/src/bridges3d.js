// Pontes sobre os rios: em cada chunk o gerador procura a travessia MAIS CURTA (da margem
// à margem) e coloca uma ponte alinhada nela. Determinístico (mesma seed = mesmas pontes)
// e calculado sob demanda com cache, então funciona no mundo infinito.

const CH = 1024; // mesmo tamanho dos chunks do terreno
const DIRS = 8; // direções testadas (meia-volta, a cada 22,5°)

function hash2(i, j, s) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Bridges {
  constructor(world) {
    this.world = world;
    this.cache = new Map();
    this.halfWidth = 26; // meia largura do tabuleiro (para andar em cima)
  }

  clear() {
    this.cache.clear();
  }

  key(ci, cj) {
    return ci + ',' + cj;
  }

  has(ci, cj) {
    return this.cache.has(this.key(ci, cj));
  }

  forChunk(ci, cj) {
    const k = this.key(ci, cj);
    if (!this.cache.has(k)) this.cache.set(k, this.find(ci, cj));
    return this.cache.get(k);
  }

  find(ci, cj) {
    const f = this.world.field, p = f.p;
    // no máximo uma ponte por região de 2×2 chunks: escolhe um chunk da região pela seed
    const ri = Math.floor(ci / 2), rj = Math.floor(cj / 2);
    const pick = Math.floor(hash2(ri, rj, (p.seed | 0) + 771) * 4);
    if ((ci - ri * 2) + (cj - rj * 2) * 2 !== pick) return null;
    if (hash2(ri, rj, (p.seed | 0) + 777) > (p.bridges ?? 0.75)) return null;
    if (!(p.riverWidth > 0)) return null;
    const isRiver = (x, y) => f.gen.riverAt(x / 64, y / 64) < p.riverWidth * 1.4;
    const maxSpan = p.bridgeSpan ?? 520;
    let best = null;
    const march = (x, y, dx, dy) => {
      for (let d = 24; d <= maxSpan; d += 24) if (f.H(x + dx * d, y + dy * d) > 3) return d;
      return -1;
    };
    for (let gy = 48; gy < CH; gy += 96)
      for (let gx = 48; gx < CH; gx += 96) {
        const x = ci * CH + gx, y = cj * CH + gy;
        if (f.H(x, y) > -6 || !isRiver(x, y)) continue; // dentro do rio (não de lagoas)
        for (let k = 0; k < DIRS; k++) {
          const a = (k / DIRS) * Math.PI, dx = Math.cos(a), dy = Math.sin(a);
          const d1 = march(x, y, dx, dy);
          if (d1 < 0) continue;
          const d2 = march(x, y, -dx, -dy);
          if (d2 < 0) continue;
          const span = d1 + d2;
          if (span < 110 || span > maxSpan || (best && span >= best.span)) continue;
          const ax = x - dx * d2, ay = y - dy * d2, bx = x + dx * d1, by = y + dy * d1;
          // depois de cada margem precisa haver terra firme (não uma ilhota no meio do rio)
          const solid = (sx, sy, ux, uy) => [40, 80, 120].every((d) => f.H(sx + ux * d, sy + uy * d) > 3 && f.slope(sx + ux * d, sy + uy * d) < 0.8);
          if (!solid(ax, ay, -dx, -dy) || !solid(bx, by, dx, dy)) continue;
          const za = f.H(ax, ay), zb = f.H(bx, by);
          // margens parecidas e não íngremes, senão a ponte fica torta ou enterrada
          if (Math.abs(za - zb) > 35 || f.slope(ax, ay) > 0.7 || f.slope(bx, by) > 0.7) continue;
          best = { span, ax, ay, bx, by, dx, dy, za, zb };
        }
      }
    if (!best) return null;
    const b = best;
    const over = 60; // a ponte avança sobre as margens
    return {
      id: 'ponte@' + ci + ',' + cj,
      x: (b.ax + b.bx) / 2,
      y: (b.ay + b.by) / 2,
      dx: b.dx,
      dy: b.dy,
      length: b.span + over * 2,
      deckZ: Math.max(b.za, b.zb) + 6,
      ends: [[b.ax - b.dx * over, b.ay - b.dy * over], [b.bx + b.dx * over, b.by + b.dy * over]],
    };
  }

  // pontes dos chunks em volta de um ponto (as que estão no cache)
  near(x, y, r = 1) {
    const ci = Math.floor(x / CH), cj = Math.floor(y / CH), out = [];
    for (let j = cj - r; j <= cj + r; j++)
      for (let i = ci - r; i <= ci + r; i++) {
        const b = this.forChunk(i, j);
        if (b) out.push(b);
      }
    return out;
  }

  // tabuleiro sob o ponto (para andar por cima da água)
  deckAt(x, y) {
    for (const b of this.near(x, y)) {
      const rx = x - b.x, ry = y - b.y;
      const u = rx * b.dx + ry * b.dy, v = -rx * b.dy + ry * b.dx;
      if (Math.abs(u) <= b.length / 2 && Math.abs(v) <= this.halfWidth) return b;
    }
    return null;
  }

  // distância até o eixo da ponte mais próxima (segmento de ponta a ponta)
  distToDeck(x, y) {
    let best = Infinity;
    for (const b of this.near(x, y)) {
      const rx = x - b.x, ry = y - b.y;
      const u = Math.max(-b.length / 2, Math.min(b.length / 2, rx * b.dx + ry * b.dy));
      best = Math.min(best, Math.hypot(rx - b.dx * u, ry - b.dy * u));
    }
    return best;
  }

  // calcula pontes de uma área aos poucos (para o mapa), dentro do orçamento de ms
  prefetch(x0, y0, x1, y1, budgetMs = 3) {
    const t0 = performance.now();
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const todo = [];
    for (let j = Math.floor(y0 / CH); j <= Math.floor(y1 / CH); j++)
      for (let i = Math.floor(x0 / CH); i <= Math.floor(x1 / CH); i++)
        if (!this.has(i, j)) todo.push([i, j, Math.hypot((i + 0.5) * CH - cx, (j + 0.5) * CH - cy)]);
    todo.sort((a, b) => a[2] - b[2]);
    for (const [i, j] of todo) {
      if (performance.now() - t0 > budgetMs) return false;
      this.forChunk(i, j);
    }
    return true;
  }

  inRect(x0, y0, x1, y1) {
    const out = [];
    for (const b of this.cache.values()) if (b && b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) out.push(b);
    return out;
  }
}
