import * as THREE from 'three';

// Estilo HQ em 3D: sombreamento chapado em 3 tons (rampa de toon) + contorno de tinta.
// Mesma regra do 2D: luz do topo-esquerda, sombra em blocos, contorno escuro (#1d1a12).

export const INK = new THREE.Color('#1d1a12');

// rampa de 3 degraus (sombra / base / luz), sem gradiente
let ramp = null;
export function toonRamp() {
  if (ramp) return ramp;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

const cache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts }));
  return cache.get(key);
}

// Contorno por casco invertido: cópia da malha um pouco inflada, só faces de trás, em tinta.
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
export function inkHull(geometry, thickness) {
  const g = geometry.clone();
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * thickness, pos.getY(i) + nor.getY(i) * thickness, pos.getZ(i) + nor.getZ(i) * thickness);
  }
  return new THREE.Mesh(g, inkMat);
}

export const INK_MATERIAL = inkMat;
