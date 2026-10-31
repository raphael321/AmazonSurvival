// Prepara um modelo de UMA peça da Tripo: corta a placa fina do "chão" que vem embaixo
// (triângulos inteiros abaixo de CUT × altura), põe a base em y=0, centraliza em x/z
// e dá nome ao nó. Uso: node trim-base.mjs entrada.glb saida.glb nome [cut=0.015] [giroY°]
// giroY: gira em volta do eixo vertical antes (ex.: 90 põe a cabeça que olha para +Z em +X)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [, , input, output, name, cutArg, rotArg] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray(), idx = prim.getIndices().getArray();
const rot = (Number(rotArg || 0) * Math.PI) / 180;
if (rot) {
  const c = Math.cos(rot), s = Math.sin(rot), N = prim.getAttribute('NORMAL')?.getArray();
  for (const A of [P, N]) if (A) for (let i = 0; i < A.length; i += 3) { const x = A[i], z = A[i + 2]; A[i] = x * c + z * s; A[i + 2] = -x * s + z * c; }
}
let y0 = Infinity, y1 = -Infinity;
for (let i = 1; i < P.length; i += 3) { y0 = Math.min(y0, P[i]); y1 = Math.max(y1, P[i]); }
const cut = y0 + (y1 - y0) * Number(cutArg ?? 0.015);
const keep = [];
for (let t = 0; t < idx.length / 3; t++) {
  const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
  if (Math.max(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]) < cut) continue;
  keep.push(a, b, c);
}
// nova caixa só com o que ficou
const used = new Set(keep), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const v of used) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[v * 3 + k]); max[k] = Math.max(max[k], P[v * 3 + k]); }
const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
const out = new Float32Array(P.length);
for (let v = 0; v < P.length / 3; v++) { out[v * 3] = P[v * 3] - cx; out[v * 3 + 1] = P[v * 3 + 1] - min[1]; out[v * 3 + 2] = P[v * 3 + 2] - cz; }
prim.getAttribute('POSITION').setArray(out);
prim.getIndices().setArray(new Uint32Array(keep));
// só a cor: o estilo toon não usa os outros mapas
const mat = prim.getMaterial();
mat.setName(name).setMetallicFactor(0).setRoughnessFactor(1);
for (const ext of mat.listExtensions()) ext.dispose();
const mesh = doc.getRoot().listMeshes()[0].setName(name);
const scene = doc.getRoot().listScenes()[0];
for (const n of [...scene.listChildren()]) scene.removeChild(n);
scene.addChild(doc.createNode(name).setMesh(mesh));
await io.write(output, doc);
console.log(JSON.stringify({ name, w: +(max[0] - min[0]).toFixed(3), d: +(max[2] - min[2]).toFixed(3), h: +(max[1] - min[1]).toFixed(3), tris: keep.length / 3, cortados: idx.length / 3 - keep.length / 3 }));
