import * as THREE from 'three';
import { toonRamp } from './toon.js';
import { T, BLOCK } from './field.js';
import { buildProps } from './props3d.js';

// Terreno 3D em chunks (um chunk = um bloco do gerador = 16×16 tiles = 1024 unidades).
// Coordenadas: jogo (x, y sul, z cima) -> three (x, z, y).
export const CHUNK = BLOCK * T;
const SEG = 48;

const terrainMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });

const C = (hex) => new THREE.Color(hex);
const MUD = C('#6e5634'), BANK = C('#5a4a32'), GRASS_LO = C('#5d6a38'), GRASS_HI = C('#4a6a3a');
const FOREST = C('#33472c'), ROCK = C('#8a8470'), ROCK_DK = C('#6b6656'), BED = C('#4a3a22');

function hash(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function buildChunkGeometry(field, cx, cy) {
  const n = SEG + 1, step = CHUNK / SEG;
  const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const rockH = field.rockH;
  const c = new THREE.Color();
  // amostra uma faixa a mais em volta para derivadas sem costura entre chunks
  const hs = new Float32Array((n + 2) * (n + 2));
  for (let j = -1; j <= n; j++)
    for (let i = -1; i <= n; i++) hs[(j + 1) * (n + 2) + (i + 1)] = field.H(cx + i * step, cy + j * step);
  const Hs = (i, j) => hs[(j + 1) * (n + 2) + (i + 1)];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i, x = cx + i * step, y = cy + j * step, h = Hs(i, j);
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = y;
      const dx = (Hs(i + 1, j) - Hs(i - 1, j)) / (2 * step), dy = (Hs(i, j + 1) - Hs(i, j - 1)) / (2 * step);
      const l = Math.hypot(dx, 1, dy);
      nor[k * 3] = -dx / l;
      nor[k * 3 + 1] = 1 / l;
      nor[k * 3 + 2] = -dy / l;
      const slope = Math.hypot(dx, dy);
      // cor por altitude, inclinação e bioma
      if (h < -4) c.copy(BED);
      else if (h < 6) c.copy(BANK).lerp(MUD, Math.max(0, (h + 4) / 10));
      else if (h > rockH || slope > 0.95) c.copy(ROCK_DK).lerp(ROCK, hash(x, y));
      else if (field.forest(x, y)) c.copy(FOREST);
      else c.copy(GRASS_LO).lerp(GRASS_HI, Math.min(1, h / Math.max(1, rockH)));
      const v = 0.94 + hash(x * 0.37, y * 0.37) * 0.12;
      col[k * 3] = c.r * v;
      col[k * 3 + 1] = c.g * v;
      col[k * 3 + 2] = c.b * v;
    }
  const idx = new Uint32Array(SEG * SEG * 6);
  let t = 0;
  for (let j = 0; j < SEG; j++)
    for (let i = 0; i < SEG; i++) {
      const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
      // ordem que deixa a face virada para cima no three (y para cima)
      idx[t++] = a; idx[t++] = d; idx[t++] = b;
      idx[t++] = b; idx[t++] = d; idx[t++] = e;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// Streaming: chunks dentro do raio existem; os mais próximos são gerados primeiro,
// com orçamento de milissegundos por quadro; os que ficam longe são descartados.
export class TerrainStreamer {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.chunks = new Map();
    this.radius = 3;
    this.stats = { built: 0, disposed: 0, ms: 0, queue: 0 };
  }

  key(i, j) {
    return i + ',' + j;
  }

  update(x, y, budgetMs = 5) {
    const ci = Math.floor(x / CHUNK), cj = Math.floor(y / CHUNK), R = this.radius;
    const want = [];
    for (let j = cj - R; j <= cj + R; j++)
      for (let i = ci - R; i <= ci + R; i++) {
        const d = Math.hypot(i - ci, j - cj);
        if (d > R + 0.5 || this.chunks.has(this.key(i, j))) continue;
        want.push({ i, j, d });
      }
    want.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    for (const w of want) {
      // o chunk sob o jogador sempre sai na hora; o resto respeita o orçamento
      if (w.d > 1.5 && performance.now() - t0 > budgetMs) break;
      const s = performance.now();
      this.build(w.i, w.j);
      this.stats.ms = this.stats.ms * 0.8 + (performance.now() - s) * 0.2;
      this.stats.built++;
    }
    this.stats.queue = want.length;
    for (const [k, c] of this.chunks) {
      if (Math.hypot(c.i - ci, c.j - cj) > R + 1.6) this.dispose(k);
    }
  }

  build(i, j) {
    const field = this.world.field;
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(buildChunkGeometry(field, i * CHUNK, j * CHUNK), terrainMat);
    mesh.receiveShadow = true;
    group.add(mesh);
    const props = buildProps(this.world, i, j);
    group.add(props.group);
    this.scene.add(group);
    this.chunks.set(this.key(i, j), { i, j, group, mesh, props });
  }

  dispose(k) {
    const c = this.chunks.get(k);
    this.scene.remove(c.group);
    c.mesh.geometry.dispose();
    c.props.dispose();
    this.chunks.delete(k);
    this.stats.disposed++;
  }

  clear() {
    for (const k of [...this.chunks.keys()]) this.dispose(k);
  }

  propsNear(x, y, r) {
    const out = [];
    const ci = Math.floor(x / CHUNK), cj = Math.floor(y / CHUNK);
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) {
        const c = this.chunks.get(this.key(i, j));
        if (!c) continue;
        for (const p of c.props.list) if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) out.push(p);
      }
    return out;
  }
}
