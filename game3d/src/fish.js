import * as THREE from 'three';
import { toonRamp, INK_MATERIAL } from './toon.js';
import { windUniforms } from './wind.js';
import { makePerlin } from '../../game/src/engine/perlin.js';

// Peixes no rio: cardumes pequenos (tambaquis/piabas estilizados) e, raramente, um pirarucu.
// Nadam um pouco abaixo da superfície, a favor da correnteza (tangente ao traçado do rio),
// com volteios de ruído; ficam sempre na água funda; de vez em quando um salta (arco +
// respingo). A cauda ondula no shader. Tudo instanciado: um desenho por espécie.

const noise = makePerlin(77);
const SMALL = 46, BIG = 4;

// corpo fusiforme + cauda (eixo x = frente), com "t" no atributo para a ondulação
function fishGeometry() {
  const body = new THREE.SphereGeometry(1, 12, 8);
  body.scale(1, 0.42, 0.28);
  const tail = new THREE.ConeGeometry(0.42, 0.55, 4);
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 0.25);
  tail.translate(-1.15, 0, 0);
  const fin = new THREE.ConeGeometry(0.22, 0.4, 3);
  fin.translate(-0.1, 0.45, 0);
  const parts = [body, tail, fin].map((g) => g.toNonIndexed());
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [];
  for (const p of parts) {
    pos.push(...p.attributes.position.array);
    nor.push(...p.attributes.normal.array);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// material toon com ondulação da cauda (quanto mais para trás, mais balança)
function fishMaterial(color) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3][0] * 0.05 + instanceMatrix[3][2] * 0.07;
        #else
          float ph = 0.0;
        #endif
        float back = clamp(-transformed.x, 0.0, 1.6);
        transformed.z += sin(uTime * 9.0 + ph - transformed.x * 2.2) * 0.22 * back * back;`);
  };
  m.customProgramCacheKey = () => 'peixe';
  return m;
}

export class Fish {
  constructor(scene, world) {
    this.world = world;
    const g = fishGeometry();
    const inkG = g.clone();
    const pos = inkG.attributes.position, nor = inkG.attributes.normal;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * 0.06, pos.getY(i) + nor.getY(i) * 0.06, pos.getZ(i) + nor.getZ(i) * 0.06);
    const make = (n, color) => {
      const mesh = new THREE.InstancedMesh(g, fishMaterial(color), n);
      const ink = new THREE.InstancedMesh(inkG, INK_MATERIAL, n);
      ink.instanceMatrix = mesh.instanceMatrix;
      for (const m of [mesh, ink]) { m.frustumCulled = false; scene.add(m); }
      return { mesh, ink };
    };
    this.small = make(SMALL, '#c98a3a'); // tambaqui/pacu: dourado
    this.big = make(BIG, '#7a4a3a'); // pirarucu: escuro avermelhado
    this.fish = [];
    for (let k = 0; k < SMALL + BIG; k++) this.fish.push({ big: k >= SMALL, alive: false });
    this.splashes = [];
    const ringG = new THREE.RingGeometry(0.75, 1, 24).rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#eef8f4', transparent: true, depthWrite: false });
    this.rings = Array.from({ length: 8 }, () => {
      const m = new THREE.Mesh(ringG, this.ringMat.clone());
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      return m;
    });
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
  }

  // direção do rio no ponto (tangente à linha onde o ruído de rio cruza zero)
  flowAt(x, y) {
    const f = this.world.field, p = f.p, g = f.gen, sc = p.riverScale, e = 0.4;
    const F = (a, b) => g.river.fbm(a / sc, b / sc, 3, 0.45);
    const i = x / 64, j = y / 64;
    const gx = F(i + e, j) - F(i - e, j), gy = F(i, j + e) - F(i, j - e);
    const l = Math.hypot(gx, gy) || 1;
    return [-gy / l, gx / l];
  }

  spawn(f, px, py) {
    const H = (x, y) => this.world.field.H(x, y);
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 1100;
      const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
      if (H(x, y) > (f.big ? -14 : -8)) continue; // só na água funda
      Object.assign(f, { alive: true, x, y, ang: Math.random() * Math.PI * 2, depth: f.big ? 9 : 4 + Math.random() * 3, seed: Math.random() * 100, jump: -1, jt: 0, size: f.big ? 34 + Math.random() * 10 : 8 + Math.random() * 5 });
      return;
    }
  }

  update(dt, t, px, py) {
    const H = (x, y) => this.world.field.H(x, y);
    let si = 0, bi = 0;
    for (const f of this.fish) {
      if (!f.alive || Math.hypot(f.x - px, f.y - py) > 1500) this.spawn(f, px, py);
      if (!f.alive) continue;
      // a favor da correnteza, com volteios; pirarucu nada devagar
      const [fx, fy] = this.flowAt(f.x, f.y);
      const want = Math.atan2(fy, fx) + noise.noise(f.seed, t * 0.25) * 1.4;
      let d = ((want - f.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      f.ang += d * Math.min(1, dt * 1.5);
      const sp = f.big ? 45 : 70 + noise.noise(f.seed + 9, t) * 30;
      let nx = f.x + Math.cos(f.ang) * sp * dt, ny = f.y + Math.sin(f.ang) * sp * dt;
      // margem à frente: vira
      if (H(nx + Math.cos(f.ang) * 30, ny + Math.sin(f.ang) * 30) > -6) { f.ang += Math.PI * (0.6 + Math.random() * 0.5); nx = f.x; ny = f.y; }
      f.x = nx;
      f.y = ny;
      // salto de vez em quando (só os pequenos): arco acima da água e respingo
      let z = -f.depth, pitch = 0;
      if (!f.big && f.jump < 0 && Math.random() < dt * 0.04) { f.jump = 0; this.splash(f.x, f.y, f.size * 2.5); }
      if (f.jump >= 0) {
        f.jump += dt / 0.8;
        const s = Math.sin(Math.PI * f.jump);
        z = -f.depth + s * (f.depth + 38);
        pitch = Math.cos(Math.PI * f.jump) * 0.9;
        if (f.jump >= 1) { f.jump = -1; this.splash(f.x, f.y, f.size * 2.5); }
      }
      this.e.set(0, -f.ang, pitch);
      this.q.setFromEuler(this.e);
      this.m4.compose(new THREE.Vector3(f.x, z, f.y), this.q, new THREE.Vector3(f.size, f.size, f.size));
      if (f.big) this.big.mesh.setMatrixAt(bi++, this.m4);
      else this.small.mesh.setMatrixAt(si++, this.m4);
    }
    for (const [o, n] of [[this.small, si], [this.big, bi]]) {
      o.mesh.count = o.ink.count = n;
      o.mesh.instanceMatrix.needsUpdate = true;
    }
    // respingos: anéis brancos que abrem e somem
    for (const s of this.splashes) {
      s.age += dt;
      const k = s.age / 0.9;
      s.ring.visible = k < 1;
      s.ring.scale.setScalar(s.r * (0.4 + k * 1.4));
      s.ring.material.opacity = (1 - k) * 0.85;
    }
    this.splashes = this.splashes.filter((s) => s.age < 0.9);
  }

  splash(x, y, r) {
    const ring = this.rings.find((m) => !this.splashes.some((s) => s.ring === m));
    if (!ring) return;
    ring.position.set(x, 0.8, y);
    this.splashes.push({ ring, age: 0, r });
  }
}
