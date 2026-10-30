// Ruído Perlin 2D clássico (gradientes em grade) + fBm. Determinístico pela seed.

export function makePerlin(seed) {
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  };

  // valor em ~[-1, 1]
  function noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 0.7071 * 1.41;
  }

  // fBm: soma de oitavas. Devolve ~[-1, 1].
  function fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq + o * 17.3, y * freq - o * 9.1) * amp;
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  return { noise, fbm };
}

// hash inteiro rápido -> [0, 1) (para decidir objetos por tile sem guardar nada)
export function hash2(i, j, seed) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
