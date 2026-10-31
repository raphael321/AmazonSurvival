import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, INK_MATERIAL } from './toon.js';

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
  shaft: toon('#2c5a3a'),
});

// Monta os objetos de um chunk a partir da lista do gerador.
export function buildProps(world, ci, cj) {
  const G = geometries(), M = MAT();
  const list = world.field.gen.props(ci, cj).filter((p) => p.kind !== 'forest' || p.variant < 4);
  const group = new THREE.Group();
  const meshes = [];
  const parts = {
    samauma: [['samaumaTrunk', M.bark, true], ['samaumaCanopy', M.leaf, true]],
    acai: [['acaiTrunk', M.bark, true], ['acaiCrown', M.frond, false], ['acaiFruit', M.acai, false]],
    bush: [['bush', M.bushLeaf, true]],
    rock: [['rock', M.stone, true]],
    forest: [['forestTrunk', M.darkBark, false], ['forestCanopy', M.darkLeaf, true]],
  };
  const byKind = {};
  for (const p of list) {
    (byKind[p.kind] ||= []).push(p);
    p.z = world.field.H(p.x, p.y);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const matrixOf = (p) => {
    const h = Math.sin(p.x * 0.13 + p.y * 0.07) * 0.5 + 0.5;
    const sc = p.kind === 'rock' ? p.size || 1 : p.kind === 'bush' ? 0.85 + (p.variant % 3) * 0.15 : 0.85 + h * 0.3;
    q.setFromAxisAngle(up, h * Math.PI * 2);
    s.set(sc, p.kind === 'acai' ? 0.8 + h * 0.4 : sc, sc);
    v.set(p.x, p.z - 4, p.y);
    return m4.compose(v, q, s);
  };
  for (const [kind, items] of Object.entries(byKind)) {
    for (const [geo, mat, ink] of parts[kind]) {
      const mesh = new THREE.InstancedMesh(G[geo], mat, items.length);
      items.forEach((p, k) => mesh.setMatrixAt(k, matrixOf(p)));
      mesh.castShadow = kind !== 'bush';
      mesh.receiveShadow = true;
      group.add(mesh);
      meshes.push(mesh);
      if (ink) {
        const o = new THREE.InstancedMesh(G.ink[geo], INK_MATERIAL, items.length);
        o.instanceMatrix = mesh.instanceMatrix; // mesmas posições do objeto
        group.add(o);
        meshes.push(o);
      }
    }
  }
  // frutos do camu-camu: malha própria para poder esconder ao colher
  const fruitBushes = (byKind.bush || []).filter((p) => p.fruit);
  let fruitMesh = null;
  if (fruitBushes.length) {
    fruitMesh = new THREE.InstancedMesh(G.fruit, M.fruit, fruitBushes.length);
    fruitBushes.forEach((p, k) => {
      p.fruitIndex = k;
      p.fruitMesh = fruitMesh;
      fruitMesh.setMatrixAt(k, world.picked.has(p.id) ? new THREE.Matrix4().makeScale(0, 0, 0) : matrixOf(p));
    });
    group.add(fruitMesh);
    meshes.push(fruitMesh);
  }
  for (const p of fruitBushes) p.matrix = matrixOf(p).clone();
  return {
    group,
    list,
    dispose() {
      // geometrias são compartilhadas; só os buffers de instância morrem
      for (const m of meshes) m.dispose();
    },
  };
}

export function setFruitVisible(p, visible) {
  if (!p.fruitMesh) return;
  p.fruitMesh.setMatrixAt(p.fruitIndex, visible ? p.matrix : new THREE.Matrix4().makeScale(0, 0, 0));
  p.fruitMesh.instanceMatrix.needsUpdate = true;
}
