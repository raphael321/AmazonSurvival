import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Física de personagem contra a forma REAL dos modelos (three-mesh-bvh):
// - corpo = cápsula, empurrada para fora dos triângulos (paredes, estacas, bancada...)
// - chão = raio vertical: pisa no tabuleiro da ponte, sobe degraus baixos sozinho
// - gravidade e pulo
// Coordenadas three: (x, altura, y do jogo). Os modelos estão instanciados com uma matriz
// (posição + giro + escala uniforme); a colisão é feita no espaço local de cada um.

export const STEP = 20; // degrau que o personagem sobe sem pular
const GRAVITY = 1500;

const bvhCache = new Map();
function bvhFor(model) {
  let b = bvhCache.get(model);
  if (!b) {
    b = new MeshBVH(model.geometry);
    bvhCache.set(model, b);
  }
  return b;
}

const _inv = new THREE.Matrix4();
const _seg = new THREE.Line3();
const _box = new THREE.Box3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _ray = new THREE.Ray();
const _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class Physics {
  constructor(world) {
    this.world = world;
  }

  // corpos com malha perto de um ponto: { model, matrix, inverse, scale }
  bodiesNear(x, y, r = 260) {
    const w = this.world, out = [];
    const models = w.pool.models;
    if (!models) return out;
    const take = (p) => {
      if (!p.phys || Math.abs(p.x - x) > r + (p.phys.reach || 0) || Math.abs(p.y - y) > r + (p.phys.reach || 0)) return;
      const model = models[p.phys.name];
      if (!model) return;
      if (!p.phys.inverse) {
        p.phys.inverse = new THREE.Matrix4().copy(p.phys.m).invert();
        p.phys.scale = new THREE.Vector3().setFromMatrixScale(p.phys.m).x;
      }
      out.push({ model, bvh: bvhFor(model), m: p.phys.m, inv: p.phys.inverse, s: p.phys.scale });
    };
    for (const p of w.streamer.propsNear(x, y, r + 400)) take(p);
    for (const p of w.extras) take(p);
    for (const b of w.bridges.near(x, y)) if (b.prop) take(b.prop);
    return out;
  }

  // maior superfície de malha sob (x, y) que esteja abaixo de zTop
  meshGround(x, y, zTop, bodies) {
    let best = -Infinity;
    for (const b of bodies) {
      _o.set(x, zTop, y).applyMatrix4(b.inv);
      _d.set(0, -1, 0).transformDirection(b.inv);
      _ray.set(_o, _d);
      const hit = b.bvh.raycastFirst(_ray, THREE.DoubleSide);
      if (!hit) continue;
      const wy = hit.point.applyMatrix4(b.m).y;
      if (wy > best) best = wy;
    }
    return best;
  }

  // chão sob o ponto para quem está na altura z: terreno ou malha (até um degrau acima)
  groundAt(x, y, z, bodies = this.bodiesNear(x, y)) {
    const h = this.world.field.H(x, y);
    const terrain = Math.max(0, h); // superfície da água conta como chão (nado raso)
    const mesh = bodies.length ? this.meshGround(x, y, z + STEP, bodies) : -Infinity;
    return Math.max(terrain, mesh);
  }

  // há malha para pisar perto da altura z? (tabuleiro sobre o rio, por exemplo)
  hasFooting(x, y, z, bodies) {
    return this.meshGround(x, y, z + STEP, bodies) > z - STEP * 2;
  }

  // empurra a cápsula para fora dos triângulos; só o deslocamento horizontal é aplicado
  pushOut(e, rad, height, bodies) {
    for (let pass = 0; pass < 2; pass++) {
      for (const b of bodies) {
        const r = rad / b.s;
        // a base da cápsula começa acima do degrau: tábuas e pisos baixos não empurram
        _seg.start.set(e.x, e.z + STEP + rad, e.y).applyMatrix4(b.inv);
        _seg.end.set(e.x, e.z + Math.max(STEP + rad, height - rad), e.y).applyMatrix4(b.inv);
        const start0 = _seg.start.clone();
        _box.makeEmpty();
        _box.expandByPoint(_seg.start);
        _box.expandByPoint(_seg.end);
        _box.min.addScalar(-r);
        _box.max.addScalar(r);
        b.bvh.shapecast({
          intersectsBounds: (box) => box.intersectsBox(_box),
          intersectsTriangle: (tri) => {
            const dist = tri.closestPointToSegment(_seg, _a, _b);
            if (dist < r) {
              const dir = _b.sub(_a).normalize();
              _seg.start.addScaledVector(dir, r - dist);
              _seg.end.addScaledVector(dir, r - dist);
            }
          },
        });
        // deslocamento de volta ao mundo, só no plano do chão
        const moved = _seg.start.clone().applyMatrix4(b.m).sub(start0.applyMatrix4(b.m));
        e.x += moved.x;
        e.y += moved.z;
      }
    }
  }

  // integra a altura: gravidade, pouso, sobe degraus suavemente, pulo
  stepZ(e, dt) {
    if (e.vz === undefined) e.vz = 0;
    const g = this.groundAt(e.x, e.y, e.z);
    if (e.wantJump && e.grounded) e.vz = 360;
    e.wantJump = false;
    // descendo encosta andando: acompanha o chão (sem "pulinhos"); queda maior vira queda de verdade
    if (e.vz <= 0 && e.grounded && e.z > g && e.z - g < STEP * 1.2) {
      e.z = g;
      return e.z;
    }
    if (e.vz > 0 || e.z > g + 2) {
      e.vz -= GRAVITY * dt;
      e.z += e.vz * dt;
      if (e.z <= g) { e.z = g; e.vz = 0; e.grounded = true; } else e.grounded = false;
    } else {
      e.z += (g - e.z) * (1 - Math.exp(-dt * 22)); // degrau: sobe suave, sem teleporte
      e.vz = 0;
      e.grounded = true;
    }
    return e.z;
  }
}

// mede a altura do tabuleiro de um modelo de ponte (raios de cima ao longo do eixo)
export function deckHeight(model) {
  const bvh = bvhFor(model);
  const bb = model.geometry.boundingBox;
  const ys = [];
  for (let k = 1; k < 10; k++) {
    const x = bb.min.x + ((bb.max.x - bb.min.x) * k) / 10;
    _ray.set(new THREE.Vector3(x, bb.max.y + 1, (bb.min.z + bb.max.z) / 2), new THREE.Vector3(0, -1, 0));
    const hit = bvh.raycastFirst(_ray, THREE.DoubleSide);
    if (hit) ys.push(hit.point.y);
  }
  ys.sort((a, b) => a - b);
  return ys.length ? ys[Math.floor(ys.length / 2)] - bb.min.y : (bb.max.y - bb.min.y) * 0.5;
}
