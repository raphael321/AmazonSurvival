import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, INK_MATERIAL } from './toon.js';
import { deckHeight } from './physics3d.js';
import { swaying } from './wind.js';

// Objetos da mata em 3D low-poly, gerados por código (sem arquivos).
// Cada tipo é um InstancedMesh por chunk: uma chamada de desenho para todos daquele tipo.
// Unidades do jogo; three: y para cima, z = y do jogo (sul).

const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296);
}

function clumps(r, n, R, y0, y1, rad, flat) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.6, d = k === 0 ? 0 : R * (0.45 + r() * 0.55);
    const g = new THREE.IcosahedronGeometry(rad * (0.75 + r() * 0.45), 1);
    g.scale(1, flat, 1);
    g.translate(Math.cos(a) * d, y0 + r() * (y1 - y0), Math.sin(a) * d);
    out.push(g);
  }
  return out;
}

// raiz tabular (sapopema): parede triangular extrudada, virada para fora do tronco
function fin(angle, len, height, thick) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(len, 0);
  s.quadraticCurveTo(len * 0.35, height * 0.2, 0, height);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 4 });
  g.translate(14, 0, -thick / 2);
  g.rotateY(-angle);
  return g;
}

let GEO = null;
function geometries() {
  if (GEO) return GEO;
  const r = seeded(7);
  const samaumaTrunk = merge([
    new THREE.CylinderGeometry(19, 30, 400, 10).translate(0, 200, 0),
    ...[0, 1, 2, 3, 4].map((k) => fin((k / 5) * Math.PI * 2 + 0.3, 95 + r() * 30, 110 + r() * 30, 9)),
    ...[-1, 1].map((s) => new THREE.CylinderGeometry(6, 11, 170, 6).rotateZ(s * 0.9).translate(s * 65, 420, 0)),
  ]);
  const samaumaCanopy = merge(clumps(r, 11, 150, 400, 470, 95, 0.42));
  const acaiTrunk = merge([
    new THREE.CylinderGeometry(3.5, 4.5, 225, 6).translate(0, 112, 0),
    new THREE.CylinderGeometry(5.5, 5.5, 34, 6).translate(0, 222, 0),
  ]);
  const fronds = [];
  for (let k = 0; k < 10; k++) {
    const g = new THREE.BoxGeometry(16, 1.5, 78);
    g.translate(0, 0, 39);
    g.rotateX(0.35 + r() * 0.25); // folhas pendentes
    g.rotateY((k / 10) * Math.PI * 2 + r() * 0.3);
    g.translate(0, 240, 0);
    fronds.push(g);
  }
  const acaiCrown = merge(fronds);
  const acaiFruit = merge([0, 1, 2, 3, 4, 5].map(() => new THREE.IcosahedronGeometry(4, 0).translate(8 + r() * 6, 200 + r() * 10, r() * 8 - 4)));
  const bush = merge(clumps(r, 6, 22, 14, 30, 20, 0.8));
  const fruit = merge([0, 1, 2, 3, 4, 5, 6].map(() => {
    const a = r() * Math.PI * 2;
    return new THREE.SphereGeometry(3.6, 6, 4).translate(Math.cos(a) * 24, 18 + r() * 16, Math.sin(a) * 24);
  }));
  const rockG = new THREE.DodecahedronGeometry(26, 0);
  const p = rockG.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + r() * 0.3), p.getY(i) * 0.6 + 6, p.getZ(i) * (0.85 + r() * 0.3));
  rockG.computeVertexNormals();
  const forestTrunk = new THREE.CylinderGeometry(9, 15, 300, 7).translate(0, 150, 0);
  const forestCanopy = merge(clumps(r, 7, 75, 280, 330, 70, 0.55));
  for (const g of [samaumaTrunk, samaumaCanopy, acaiTrunk, acaiCrown, bush, rockG, forestCanopy]) g.computeVertexNormals();
  GEO = { samaumaTrunk, samaumaCanopy, acaiTrunk, acaiCrown, acaiFruit, bush, fruit, rock: rockG, forestTrunk, forestCanopy };
  // cascos de contorno (inflados pela normal)
  GEO.ink = {};
  for (const k of ['samaumaTrunk', 'samaumaCanopy', 'bush', 'rock', 'forestCanopy', 'acaiTrunk']) {
    const g = GEO[k].clone();
    const pos = g.attributes.position, nor = g.attributes.normal;
    const t = k === 'acaiTrunk' ? 1.2 : 2.4;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * t, pos.getY(i) + nor.getY(i) * t, pos.getZ(i) + nor.getZ(i) * t);
    GEO.ink[k] = g;
  }
  return GEO;
}

const MAT = () => ({
  bark: toon('#8f866a'),
  leaf: toon('#3f7a47'),
  frond: toon('#4f8a45', { side: THREE.DoubleSide }),
  acai: toon('#4a2340'),
  bushLeaf: toon('#2f5a33'),
  fruit: toon('#c0392b'),
  stone: toon('#807b65'),
  darkBark: toon('#3c3524'),
  darkLeaf: toon('#2c4a30'),
});

// Modelos da Tripo por categoria do gerador. Altura alvo em unidades do jogo (jogador ≈ 85).
const MODEL_SETS = {
  forest: ['arvore_redonda', 'arvore_raizes'],
  bush: ['moita', 'samambaia', 'samambaia_fruto', 'moita_flores', 'cogumelos', 'muda_folha', 'muda_fina', 'galho_cogumelo'],
  camu: ['moita_folhas'],
  colhido: ['moita'],
  rock: ['pedra_capim', 'pedra_achatada', 'pedra_musgo', 'pedras_grupo', 'menir', 'pedra_musgo2'],
  build: ['bancada', 'ponte', 'portao', 'sela'],
  deco: ['tronco_caido', 'tronco_musgo', 'tronco', 'toco_raizes', 'toco_cortado', 'toco_a', 'toco_b', 'arco_raiz', 'ouricos_castanha'],
};
const TARGET_H = {
  arvore_redonda: 540, arvore_raizes: 500, muda_folha: 150, muda_fina: 140, moita: 70, moita_folhas: 78, samambaia: 85,
  samambaia_fruto: 80, moita_flores: 55, cogumelos: 45, galho_cogumelo: 60, pedra_capim: 62, pedra_achatada: 45,
  pedra_musgo: 60, pedras_grupo: 50, menir: 140, pedra_musgo2: 65, tronco_caido: 62, tronco_musgo: 56, tronco: 46,
  toco_raizes: 58, toco_cortado: 46, toco_a: 40, toco_b: 44, arco_raiz: 85, ouricos_castanha: 30,
  // construções (modelos do Raphael)
  bancada: 82, ponte: 105, portao: 230, sela: 58,
};
// distância máxima de desenho por tamanho (além disso a neblina já esconde)
const FAR = { big: 3400, mid: 2200, small: 1400 };
const LOD_NEAR = 850; // além disso usa a versão de baixo detalhe
const SIZE = (name) => (TARGET_H[name] || 0) >= 130 ? 'big' : (TARGET_H[name] || 0) >= 58 ? 'mid' : 'small';
// objetos que colidem pela forma real da malha (física), e não por um círculo
const MESH_PHYS = new Set(['bancada', 'portao', 'sela', 'tronco_caido', 'tronco_musgo', 'tronco', 'toco_raizes', 'toco_cortado', 'toco_a', 'toco_b', 'arco_raiz',
  'pedra_capim', 'pedra_achatada', 'pedra_musgo', 'pedras_grupo', 'menir', 'pedra_musgo2']);
const SOLID = new Set(['bancada', 'portao', 'sela', 'tronco_caido', 'tronco_musgo', 'tronco', 'toco_raizes', 'toco_cortado', 'toco_a', 'toco_b', 'arco_raiz']);

function hash2(i, j, s) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Lista de objetos de um chunk: os do gerador + decoração (troncos, tocos, ouriços).
// A renderização fica com o PropPool (instâncias globais), aqui só dados.
export function buildProps(world, ci, cj) {
  const field = world.field, gen = field.gen, p = field.p;
  const list = gen.props(ci, cj).filter((q) => q.kind !== 'forest' || q.variant < 4);
  const T = 64, B = 16, seed = p.seed | 0;
  for (let y = 0; y < B; y++)
    for (let x = 0; x < B; x++) {
      const i = ci * B + x, j = cj * B + y;
      if (hash2(i, j, seed + 401) >= (p.deco ?? 0.02)) continue;
      const px = (i + 0.3 + hash2(i, j, seed + 403) * 0.4) * T, py = (j + 0.3 + hash2(i, j, seed + 409) * 0.4) * T;
      if (!world.walkable(px, py) || field.H(px, py) < 4) continue;
      list.push({ id: i + ',' + j + 'd', kind: 'deco', x: px, y: py, variant: Math.floor(hash2(i, j, seed + 419) * 9), shadow: 24 });
    }
  // construções espalhadas (por enquanto só para ver no mundo)
  for (let y = 0; y < B; y += 2)
    for (let x = 0; x < B; x += 2) {
      const i = ci * B + x, j = cj * B + y;
      if (hash2(i, j, seed + 503) >= (p.build ?? 0.01)) continue;
      const px = (i + 0.5) * T, py = (j + 0.5) * T;
      if (!world.walkable(px, py) || field.slope(px, py) > 0.35) continue;
      // pontes não entram aqui: elas são colocadas sobre os rios (bridges3d.js)
      const variant = [0, 2, 3][Math.floor(hash2(i, j, seed + 509) * 3)];
      list.push({ id: i + ',' + j + 'b', kind: 'build', x: px, y: py, variant, shadow: 40 });
    }
  // nada nasce na água (o rio 3D é escavado depois da grade do gerador) nem sobre pontes
  // objetos com colisão também ficam longe do caminho da ponte (cabeceiras livres)
  const keep = list.filter((q) => field.H(q.x, q.y) > 1.5 && world.bridges.distToDeck(q.x, q.y) > world.bridges.halfWidth + (q.collider || 0) + 8);
  for (const q of keep) {
    if (q.kind === 'bush') q.collider = 0; // moitas, samambaias e flores: dá para atravessar
    q.z = field.H(q.x, q.y);
    q.picked = world.picked.has(q.id);
  }
  list.length = 0;
  list.push(...keep);
  return { group: new THREE.Group(), list, dispose() {} };
}

// Pool global de instâncias: um InstancedMesh por tipo de objeto para o mundo todo
// (≈ 60 chamadas de desenho em vez de uma por tipo por chunk).
export class PropPool {
  constructor(scene) {
    this.scene = scene;
    this.entries = new Map();
    this.models = null;
    this.dirty = true;
    const G = geometries(), M = MAT();
    const proc = (name, geo, mat, ink, cast = true, sway = false) => this.define(name, G[geo], sway ? swaying(mat) : mat, ink ? G.ink[geo] : null, cast, sway);
    proc('samaumaTrunk', 'samaumaTrunk', M.bark, true);
    proc('samaumaCanopy', 'samaumaCanopy', M.leaf, true, true, true);
    proc('acaiTrunk', 'acaiTrunk', M.bark, true);
    proc('acaiCrown', 'acaiCrown', M.frond, false, true, true);
    proc('acaiFruit', 'acaiFruit', M.acai, false, true, true);
    proc('bush', 'bush', M.bushLeaf, true, false, true);
    proc('rock', 'rock', M.stone, true);
    proc('forestTrunk', 'forestTrunk', M.darkBark, false);
    proc('forestCanopy', 'forestCanopy', M.darkLeaf, true, true, true);
    proc('fruit', 'fruit', M.fruit, false, false, true);
  }

  // sway: folhagem que balança com o vento (o contorno de tinta balança junto)
  define(name, geo, mat, inkGeo, cast, sway = false) {
    this.entries.set(name, { name, geo, mat, inkGeo, cast, sway, mesh: null, ink: null, cap: 0, mats: [] });
  }

  setModels(models, inflate) {
    this.models = models;
    for (const [name, m] of Object.entries(models)) {
      const scale = (TARGET_H[name] || 60) / Math.max(0.001, m.size.y);
      m.scale = scale;
      // sombra só de objetos médios/grandes: os pequenos dobrariam o custo do passe de sombra à toa
      // pedras, troncos, tocos e construções ficam firmes; árvores, moitas, samambaias balançam
      const sway = !MESH_PHYS.has(name) && name !== 'ponte' && name !== 'ouricos_castanha';
      this.define('m:' + name, m.geometry, sway ? swaying(m.material) : m.material, inflate(m.geometry, 1.6 / scale), SIZE(name) !== 'small' && !name.startsWith('moita') && !name.startsWith('samambaia'), sway);
      this.entries.get('m:' + name).far = FAR[SIZE(name)];
      if (m.lod) {
        this.define('m:' + name + '@lod', m.lod.geometry, sway ? swaying(m.lod.material) : m.lod.material, inflate(m.lod.geometry, 1.6 / scale), false, sway);
        this.entries.get('m:' + name + '@lod').far = FAR[SIZE(name)];
      }
    }
    this.dirty = true;
  }

  // escolhe as peças (tipo de render + matriz) de cada objeto
  partsOf(p, out) {
    const h = Math.sin(p.x * 0.13 + p.y * 0.07) * 0.5 + 0.5;
    const rot = h * Math.PI * 2;
    const push = (entry, sc, sy = sc) => out.push([entry, compose(p.x, p.z - 3, p.y, rot, sc, sy)]);
    const model = (set) => {
      if (!this.models) return null;
      const names = MODEL_SETS[set];
      const name = names[p.variant % names.length];
      const m = this.models[name];
      return m ? { name, m } : null;
    };
    if (p.kind === 'bridge') {
      // ponte esticada até as margens e girada na direção da travessia
      const m = this.models && this.models.ponte;
      if (!m) return;
      const b = p.bridge, sc = b.length / m.size.x;
      const ang = Math.atan2(-b.dy, b.dx);
      // o tabuleiro (medido no próprio modelo) fica exatamente na altura das margens
      if (m.deck === undefined) m.deck = deckHeight(m) + m.geometry.boundingBox.min.y;
      const mat = compose(b.x, b.deckZ - m.deck * sc, b.y, ang, sc, sc);
      out.push(['m:ponte', mat]);
      if (!p.phys) p.phys = { name: 'ponte', m: mat.clone(), reach: b.length / 2 };
      return;
    }
    if (p.kind === 'samauma') { push('samaumaTrunk', 0.85 + h * 0.3); push('samaumaCanopy', 0.85 + h * 0.3); return; }
    if (p.kind === 'acai') { const sy = 0.8 + h * 0.4; push('acaiTrunk', 1, sy); push('acaiCrown', 1, sy); push('acaiFruit', 1, sy); return; }
    // camu-camu com fruto usa o modelo com frutinhas; colhido, vira moita lisa até rebrotar
    const set = p.kind === 'bush' ? (p.fruit && !p.picked ? 'camu' : p.fruit ? 'colhido' : 'bush') : p.kind;
    const got = model(set);
    const v = 0.85 + h * 0.3;
    if (got) {
      push('m:' + got.name, got.m.scale * v);
      if (MESH_PHYS.has(got.name)) {
        // colisão pela malha: guarda a matriz do objeto e desliga o círculo
        if (!p.phys) p.phys = { name: got.name, m: out[out.length - 1][1].clone(), reach: Math.max(got.m.size.x, got.m.size.z) * got.m.scale * v };
        p.collider = 0;
      } else if (SOLID.has(got.name) && !p.collider) p.collider = Math.max(got.m.size.x, got.m.size.z) * got.m.scale * v * 0.35;
    } else if (p.kind === 'samauma' || p.kind === 'forest') { push('forestTrunk', v); push('forestCanopy', v); }
    // árvores da mata: colisão só no tronco, para dar para andar entre elas
    if (p.kind === 'forest' && !p.collider) p.collider = 20 * v;
    else if (p.kind === 'bush') push('bush', 0.85 + (p.variant % 3) * 0.15);
    else if (p.kind === 'rock') push('rock', p.size || 1);
    // frutinhas procedurais só enquanto os modelos não chegaram
    if (!got && p.kind === 'bush' && p.fruit && !p.picked) push('fruit', 0.85 + (p.variant % 3) * 0.15);
  }

  // refaz todas as instâncias a partir dos objetos carregados (só quando algo muda)
  // objetos escondidos (ex.: árvore entre a câmera e o personagem)
  setHidden(ids) {
    const old = this.hidden || new Set();
    if (ids.size === old.size && [...ids].every((i) => old.has(i))) return;
    this.hidden = ids;
    this.dirty = true;
  }

  rebuild(allProps, cx, cy) {
    const buckets = new Map();
    const hidden = this.hidden || new Set();
    const parts = [];
    this.center = [cx, cy];
    for (const p of allProps) {
      if (hidden.has(p.id)) continue;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d > FAR.big) continue;
      parts.length = 0;
      this.partsOf(p, parts);
      for (let [name, m] of parts) {
        if (d > LOD_NEAR && this.entries.has(name + '@lod')) name += '@lod';
        const far = this.entries.get(name).far || (name === 'bush' || name === 'fruit' ? FAR.small : FAR.big);
        if (d > far) continue;
        if (!buckets.has(name)) buckets.set(name, []);
        buckets.get(name).push(m);
      }
    }
    for (const e of this.entries.values()) {
      const list = buckets.get(e.name) || [];
      if (list.length > e.cap) this.grow(e, Math.max(64, Math.ceil(list.length * 1.5)));
      if (!e.mesh) continue;
      list.forEach((m, k) => e.mesh.setMatrixAt(k, m));
      e.mesh.count = list.length;
      e.mesh.instanceMatrix.needsUpdate = true;
      if (e.ink) e.ink.count = list.length;
    }
    this.dirty = false;
  }

  grow(e, cap) {
    if (e.mesh) { this.scene.remove(e.mesh); e.mesh.dispose(); }
    if (e.ink) { this.scene.remove(e.ink); }
    e.mesh = new THREE.InstancedMesh(e.geo, e.mat, cap);
    e.mesh.frustumCulled = false; // instâncias espalhadas pela área carregada
    e.mesh.castShadow = e.cast;
    e.mesh.receiveShadow = true;
    this.scene.add(e.mesh);
    if (e.inkGeo) {
      e.ink = new THREE.InstancedMesh(e.inkGeo, e.sway ? swaying(INK_MATERIAL) : INK_MATERIAL, cap);
      e.ink.instanceMatrix = e.mesh.instanceMatrix; // mesmas posições do objeto
      e.ink.frustumCulled = false;
      this.scene.add(e.ink);
    }
    e.cap = cap;
  }

  get drawCalls() {
    let n = 0;
    for (const e of this.entries.values()) if (e.mesh && e.mesh.count) n += e.ink ? 2 : 1;
    return n;
  }
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function compose(x, y, z, rot, sc, sy) {
  _q.setFromAxisAngle(_up, rot);
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(sc, sy, sc));
}
