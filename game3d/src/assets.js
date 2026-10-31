import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { toonRamp } from './toon.js';

// Carrega os pacotes de objetos (já separados e comprimidos com meshopt + WebP) e devolve
// { nome: { geometry, material, inkGeometry, size } } com material toon (textura pintada + 3 tons).
export const MODEL_FILES = ['assets/floresta-1.glb', 'assets/floresta-2.glb', 'assets/construcoes.glb', 'assets/penhascos.glb'];
// versões de baixo detalhe (LOD), geradas offline com gltf-transform simplify
export const LOD_FILES = ['assets/floresta-1-lod.glb', 'assets/floresta-2-lod.glb', 'assets/construcoes-lod.glb', 'assets/penhascos-lod.glb'];

export async function loadModels(base = '') {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  const mats = new Map();
  for (const f of [...MODEL_FILES, ...LOD_FILES]) {
    const lod = LOD_FILES.includes(f);
    const gltf = await loadOne(loader, base, f);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      if (!mats.has(src)) {
        // textura pintada do modelo + rampa de toon do jogo = mesmo estilo dos objetos procedurais
        mats.set(src, new THREE.MeshToonMaterial({ map: src.map, gradientMap: toonRamp() }));
      }
      const geometry = toFloat(o.geometry, o.matrixWorld);
      geometry.computeBoundingBox();
      const name = o.name || o.parent.name;
      if (lod) { if (out[name]) out[name].lod = { geometry, material: mats.get(src) }; }
      else out[name] = { geometry, material: mats.get(src), size: geometry.boundingBox.getSize(new THREE.Vector3()) };
    });
  }
  return out;
}

// Build publicado como página única: os modelos vêm embutidos em base64 (window.__EMBEDDED_ASSETS).
// No dev local e no app desktop, baixa o arquivo normalmente.
async function loadOne(loader, base, f) {
  const b64 = typeof window !== 'undefined' && window.__EMBEDDED_ASSETS && window.__EMBEDDED_ASSETS[f];
  if (!b64) return loader.loadAsync(base + f);
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return loader.parseAsync(bin.buffer, '');
}

// A compressão meshopt quantiza (inteiros de 16 bits + escala no nó). Para instanciar
// e inflar o contorno, convertemos para float já com a transformação do nó aplicada.
function toFloat(src, matrix) {
  const g = new THREE.BufferGeometry();
  const copy = (name, n) => {
    const a = src.attributes[name];
    if (!a) return;
    const arr = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) {
      arr[i * n] = a.getX(i);
      if (n > 1) arr[i * n + 1] = a.getY(i);
      if (n > 2) arr[i * n + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(arr, n));
  };
  copy('position', 3);
  copy('normal', 3);
  copy('uv', 2);
  if (src.index) g.setIndex(new THREE.BufferAttribute(new Uint32Array(src.index.array), 1));
  g.applyMatrix4(matrix);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// casco de contorno: cópia inflada pela normal (espessura em unidades do modelo)
export function inflate(geometry, t) {
  const g = new THREE.BufferGeometry();
  const pos = geometry.attributes.position, nor = geometry.attributes.normal;
  const p = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    p[i * 3] = pos.getX(i) + nor.getX(i) * t;
    p[i * 3 + 1] = pos.getY(i) + nor.getY(i) * t;
    p[i * 3 + 2] = pos.getZ(i) + nor.getZ(i) * t;
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  if (geometry.index) g.setIndex(geometry.index);
  return g;
}
