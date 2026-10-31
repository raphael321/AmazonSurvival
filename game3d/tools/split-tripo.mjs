// Separa um GLB "tudo numa malha" (Tripo) em objetos: componentes conectados (vértices
// soldados por posição) + junta peças pequenas ao objeto cuja área (vista de cima) contém.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [, , input, mode] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION').getArray(), idx = prim.getIndices().getArray();
const nv = pos.length / 3, nt = idx.length / 3;
// solda vértices de mesma posição (malhas da Tripo duplicam vértices nas costuras de UV)
const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
const weld = new Int32Array(nv), seen = new Map();
for (let i = 0; i < nv; i++) { const k = key(i); if (!seen.has(k)) seen.set(k, i); weld[i] = seen.get(k); }
const parent = new Int32Array(nv).map((_, i) => i);
const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
for (let t = 0; t < nt; t++) { const a = weld[idx[t * 3]], b = weld[idx[t * 3 + 1]], c = weld[idx[t * 3 + 2]]; uni(a, b); uni(b, c); }
const comps = new Map();
for (let t = 0; t < nt; t++) {
  const r = find(weld[idx[t * 3]]);
  let c = comps.get(r);
  if (!c) comps.set(r, (c = { tris: [], min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }));
  c.tris.push(t);
  for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k]; for (let a = 0; a < 3; a++) { c.min[a] = Math.min(c.min[a], pos[v * 3 + a]); c.max[a] = Math.max(c.max[a], pos[v * 3 + a]); } }
}
let list = [...comps.values()].sort((a, b) => b.tris.length - a.tris.length);
const area = (c) => (c.max[0] - c.min[0]) * (c.max[2] - c.min[2]);
const overlapXY = (a, b, m = 0.005) => !(a.max[0] < b.min[0] - m || a.min[0] > b.max[0] + m || a.max[1] < b.min[1] - m || a.min[1] > b.max[1] + m);
const grow = (g, c) => { g.parts.push(c); for (let k = 0; k < 3; k++) { g.min[k] = Math.min(g.min[k], c.min[k]); g.max[k] = Math.max(g.max[k], c.max[k]); } };
const clusterByOverlap = (items) => {
  const gs = [];
  for (const c of items) { const g = gs.find((g) => overlapXY(c, g)); if (g) grow(g, c); else gs.push({ parts: [c], min: [...c.min], max: [...c.max] }); }
  for (let again = true; again; ) {
    again = false;
    for (let i = 0; i < gs.length && !again; i++) for (let j = i + 1; j < gs.length && !again; j++)
      if (overlapXY(gs[i], gs[j], 0)) { for (const p of gs[j].parts) grow(gs[i], p); gs.splice(j, 1); again = true; }
  }
  return gs;
};
let groups;
const strategy = process.env.SPLIT || 'overlap';
if (strategy === 'overlap') groups = clusterByOverlap(list);
else {
  // cada componente grande é um objeto; pequenas dentro de um grande entram nele;
  // as que sobram (ex.: cogumelos feitos de peças) se agrupam entre si
  const BIG = Math.max(800, list[0].tris.length * 0.08);
  groups = list.filter((c) => c.tris.length >= BIG).map((c) => ({ parts: [c], min: [...c.min], max: [...c.max] }));
  const ctr = (c) => [0, 1, 2].map((k) => (c.min[k] + c.max[k]) / 2);
  const loose = [];
  for (const c of list.filter((c) => c.tris.length < BIG)) {
    const p = ctr(c);
    const g = groups.find((g) => [0, 1, 2].every((k) => p[k] >= g.parts[0].min[k] - 0.005 && p[k] <= g.parts[0].max[k] + 0.005));
    if (g) grow(g, c); else loose.push(c);
  }
  groups.push(...clusterByOverlap(loose));
}
groups.sort((a, b) => (Math.round((b.min[1] + b.max[1]) * 5) - Math.round((a.min[1] + a.max[1]) * 5)) || (a.min[0] - b.min[0]));
// linhas (por altura do centro) e colunas (por x) para dar nome a cada objeto
const NAMES = JSON.parse(process.env.NAMES || '[]');
const rows = [];
for (const g of [...groups].sort((a, b) => (b.min[1] + b.max[1]) - (a.min[1] + a.max[1]))) {
  const cy = (g.min[1] + g.max[1]) / 2;
  const r = rows.find((r) => Math.abs(r.cy - cy) < 0.12);
  if (r) r.items.push(g); else rows.push({ cy, items: [g] });
}
const ordered = rows.flatMap((r) => r.items.sort((a, b) => (a.min[0] + a.max[0]) - (b.min[0] + b.max[0])));
if (process.env.OUT) {
  const { Document, NodeIO: IO2 } = await import('@gltf-transform/core');
  const out = new Document();
  const buf = out.createBuffer();
  const mat0 = prim.getMaterial();
  const srcTex = mat0.getBaseColorTexture();
  const tex = out.createTexture('cor').setImage(srcTex.getImage()).setMimeType(srcTex.getMimeType());
  const mat = out.createMaterial('cor').setBaseColorTexture(tex).setRoughnessFactor(1).setMetallicFactor(0);
  const scene = out.createScene('objetos');
  const N = prim.getAttribute('NORMAL').getArray(), UV = prim.getAttribute('TEXCOORD_0').getArray();
  const meta = [];
  ordered.forEach((g, n) => {
    const name = NAMES[n] || 'obj_' + n;
    const tris = g.parts.flatMap((p) => p.tris);
    const remap = new Map(), P = [], NN = [], T = [], I = [];
    const cx = (g.min[0] + g.max[0]) / 2, cz = (g.min[2] + g.max[2]) / 2, by = g.min[1];
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k];
      let m = remap.get(v);
      if (m === undefined) {
        m = remap.size; remap.set(v, m);
        P.push(pos[v * 3] - cx, pos[v * 3 + 1] - by, pos[v * 3 + 2] - cz);
        NN.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        T.push(UV[v * 2], UV[v * 2 + 1]);
      }
      I.push(m);
    }
    const acc = (arr, type, C) => out.createAccessor().setArray(new C(arr)).setType(type).setBuffer(buf);
    const pr = out.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', acc(P, 'VEC3', Float32Array)).setAttribute('NORMAL', acc(NN, 'VEC3', Float32Array))
      .setAttribute('TEXCOORD_0', acc(T, 'VEC2', Float32Array)).setIndices(acc(I, 'SCALAR', Uint32Array));
    const mesh = out.createMesh(name).addPrimitive(pr);
    scene.addChild(out.createNode(name).setMesh(mesh));
    meta.push({ name, w: +(g.max[0] - g.min[0]).toFixed(3), d: +(g.max[2] - g.min[2]).toFixed(3), h: +(g.max[1] - g.min[1]).toFixed(3), tris: tris.length });
  });
  await new IO2().write(process.env.OUT, out);
  console.log(JSON.stringify(meta));
  process.exit(0);
}
const out = groups.map((g, i) => ({ i, tris: g.parts.reduce((s, p) => s + p.tris.length, 0), parts: g.parts.length, cx: +((g.min[0] + g.max[0]) / 2).toFixed(3), cy: +((g.min[1] + g.max[1]) / 2).toFixed(3), w: +(g.max[0] - g.min[0]).toFixed(3), d: +(g.max[2] - g.min[2]).toFixed(3), h: +(g.max[1] - g.min[1]).toFixed(3) }));
if (mode === 'json') { console.log(JSON.stringify({ comps: comps.size, groups: out })); }
else { console.log('componentes:', comps.size, 'objetos:', groups.length); console.table(out); }
