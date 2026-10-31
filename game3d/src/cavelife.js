import * as THREE from 'three';
import { SPECIES } from './dinos.js';
import { toon, INK_MATERIAL } from './toon.js';

// Bichos da caverna. Usam a mesma IA dos outros animais (avisar → rodear → bote → recuar),
// presos ao salão da caverna. A cobra é o modelo rigado do Raphael (rigs.js); aranha e
// morcego são desenhados por código aqui.

const CYL = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true);
const CYL_INK = new THREE.CylinderGeometry(1.15, 1.15, 1, 7, 1, true);
const BALL = new THREE.SphereGeometry(1, 12, 8);
const BALL_INK = new THREE.SphereGeometry(1.1, 12, 8);
const UP = new THREE.Vector3(0, 1, 0);
const T3 = (p, v = new THREE.Vector3()) => v.set(p[0], p[2], p[1]);
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

// peças reaproveitadas a cada quadro (cilindros e bolas com contorno)
class Parts {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.list = [];
    this.n = 0;
  }
  get(kind, mat, ink) {
    let p = this.list[this.n];
    if (!p) {
      const mesh = new THREE.Mesh(kind === 'seg' ? CYL : BALL, mat);
      mesh.castShadow = true;
      if (ink) mesh.add(new THREE.Mesh(kind === 'seg' ? CYL_INK : BALL_INK, INK_MATERIAL));
      this.group.add(mesh);
      p = this.list[this.n] = mesh;
    }
    p.material = mat;
    p.visible = true;
    this.n++;
    return p;
  }
  seg(a, b, r, mat, ink = true) {
    const A = T3(a), B = T3(b), m = this.get('seg', mat, ink), d = B.clone().sub(A), l = d.length() || 0.01;
    m.position.copy(A).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l));
    m.scale.set(r, l, r);
  }
  ball(c, rx, mat, ink = true, ry = rx, rz = rx, yaw = 0) {
    const m = this.get('ball', mat, ink);
    T3(c, m.position);
    m.quaternion.setFromAxisAngle(UP, yaw);
    m.scale.set(rx, ry, rz);
  }
  begin() { this.n = 0; }
  end() { for (let k = this.n; k < this.list.length; k++) this.list[k].visible = false; }
  dispose(scene) { scene.remove(this.group); }
}

const M = {
  aranha: toon('#2b2420'), aranhaPelo: toon('#4a3a2e'), olho: new THREE.MeshBasicMaterial({ color: '#d63a2a' }),
  morcego: toon('#3a2e2a'), asa: new THREE.MeshToonMaterial({ color: '#4d3b34', side: THREE.DoubleSide }),
};

// ---------- aranha-caranguejeira gigante: 8 patas em dois grupos alternados ----------
class SpiderBody {
  constructor(scene, d) {
    this.scene = scene;
    this.p = new Parts(scene);
  }
  dispose() { this.p.dispose(this.scene); }
  update(d, world, visible, dt) {
    this.p.group.visible = visible;
    if (!visible) return;
    const k = d.scale * 1.2, p = this.p;
    p.begin();
    const f = [Math.cos(d.a), Math.sin(d.a), 0], s = [-f[1], f[0], 0];
    const v = d.speed / d.scale, moving = Math.min(1, v / 10);
    const dead = d.dead ? Math.min(1, d.deadT * 2) : 0;
    const crouch = d.crouch || 0;
    const base = [d.x, d.y, d.z + (d.jz || 0)];
    const bodyZ = 16 * k * (1 - crouch * 0.35) * (1 - dead * 0.6);
    const thorax = add(base, [0, 0, bodyZ]);
    const abd = add(add(thorax, f, -20 * k), [0, 0, 4 * k]);
    // patas: raiz no tórax, joelho alto, pé no chão; grupos A/B alternam
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? 1 : -1, j = i % 4;
      const along = [9, 4, -2, -8][j] * k, spread = [0.55, 0.2, -0.2, -0.55][j];
      const root = add(add(thorax, f, along * 0.5), s, side * 6 * k);
      const group = (j + (side > 0 ? 0 : 1)) % 2;
      const ph = d.t * (6 + v * 0.04) + group * Math.PI;
      const step = Math.sin(ph) * 9 * k * moving, lift = Math.max(0, Math.cos(ph)) * 7 * k * moving;
      const out = [f[0] * Math.sin(spread) + s[0] * side * Math.cos(spread), f[1] * Math.sin(spread) + s[1] * side * Math.cos(spread), 0];
      let foot = add(add(root, out, 30 * k * (1 - dead * 0.4)), f, step);
      foot[2] = d.z + lift + (d.jz || 0) * 0.6;
      if (dead) foot = add(root, out, 12 * k);
      const knee = add(add(root, out, 14 * k), [0, 0, 14 * k * (1 - dead)]);
      p.seg(root, knee, 1.8 * k, M.aranhaPelo, false);
      p.seg(knee, foot, 1.4 * k, M.aranha, false);
    }
    p.ball(thorax, 8 * k, M.aranha, true, 6 * k, 8 * k, -d.a);
    p.ball(abd, 13 * k, M.aranhaPelo, true, 10 * k, 11 * k, -d.a);
    // olhos e quelíceras
    const head = add(thorax, f, 8 * k);
    for (const sg of [-1, 1]) p.ball(add(add(head, s, sg * 2.5 * k), [0, 0, 3 * k]), 1.3 * k, M.olho, false);
    p.end();
    d.pelvis = abd;
    d.chest = thorax;
    d.mouth = add(head, f, 4 * k);
    d.bodyR = 14 * k;
  }
}

// ---------- morcego: asas batendo, voa em volta e dá rasantes ----------
class BatBody {
  constructor(scene, d) {
    this.scene = scene;
    this.p = new Parts(scene);
    // asas: dois triângulos que giram em volta do corpo
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -6, 0, 0, 8, 30, 0, 2, 30, 0, 2, 0, 0, 8, 22, 0, 14], 3));
    g.computeVertexNormals();
    this.wings = [1, -1].map((sg) => {
      const m = new THREE.Mesh(g, M.asa);
      m.scale.set(sg, 1, 1);
      scene.add(m);
      return m;
    });
    this.alt = 160;
  }
  dispose() { this.p.dispose(this.scene); for (const w of this.wings) this.scene.remove(w); }
  update(d, world, visible, dt) {
    this.p.group.visible = visible;
    for (const w of this.wings) w.visible = visible;
    if (!visible) return;
    const p = this.p, k = d.scale;
    // altura: alto rodeando, mergulha no ataque, caído quando morre
    const want = d.dead ? 0 : d.state === 'charge' || d.state === 'leap' ? 55 : d.state === 'rest' ? 210 : 150 + Math.sin(d.t * 1.3 + d.id) * 30;
    this.alt += (want - this.alt) * (1 - Math.exp(-dt * (d.dead ? 6 : 3)));
    const c = [d.x, d.y, d.z + this.alt];
    p.begin();
    p.ball(c, 5 * k, M.morcego, true, 4.5 * k, 7 * k, -d.a);
    const f = [Math.cos(d.a), Math.sin(d.a), 0];
    const head = add(c, f, 6 * k);
    p.ball(head, 3.5 * k, M.morcego);
    for (const sg of [-1, 1]) {
      const s = [-f[1] * sg, f[0] * sg, 0];
      p.seg(add(head, s, 1.5 * k), add(add(head, s, 3 * k), [0, 0, 5 * k]), 1 * k, M.morcego, false);
    }
    p.end();
    const flap = d.dead ? 0.2 : Math.sin(d.t * 18 + d.id) * 0.9;
    this.wings.forEach((w, i) => {
      T3(c, w.position);
      w.rotation.set(0, -d.a + Math.PI / 2, 0, 'YZX');
      w.rotateOnAxis(new THREE.Vector3(0, 0, 1), (i ? -1 : 1) * flap);
      w.scale.set((i ? -1 : 1) * k, k, k);
    });
    d.pelvis = add(c, f, -4 * k);
    d.chest = c;
    d.mouth = head;
    d.bodyR = 12 * k;
  }
}

// espécies da caverna
Object.assign(SPECIES, {
  cobra: {
    nome: 'Sucuri', biped: false, rig: 'cobra', rigOnly: true, serpent: true, cave: true, length: 300,
    walk: 45, run: 170, freq: 0.6, aggressive: true, habitat: 'caverna', bite: 14, ring: 200, turn: 2.2, hp: 70, carne: 5,
    hip: 10, torso: 60, bodyW: 14, bodyH: 14, cor: {},
  },
  aranha: {
    nome: 'Aranha-caranguejeira', biped: false, rigOnly: true, cave: true, makeBody: (scene, d) => new SpiderBody(scene, d),
    walk: 60, run: 280, freq: 1.4, aggressive: true, habitat: 'caverna', bite: 8, ring: 150, leap: true, crouch: true, turn: 5, hp: 30, carne: 1,
    hip: 10, torso: 20, bodyW: 12, bodyH: 10, cor: {},
  },
  morcego: {
    nome: 'Morcego', biped: false, rigOnly: true, cave: true, makeBody: (scene, d) => new BatBody(scene, d),
    walk: 160, run: 360, freq: 2, aggressive: true, habitat: 'caverna', bite: 4, ring: 170, turn: 4, hp: 10, carne: 0,
    hip: 10, torso: 10, bodyW: 8, bodyH: 8, cor: {},
  },
});

// povoa o salão: cobras no chão, aranhas pelos cantos, morcegos voando
export function populateCave(dinos, cave) {
  const h = cave.hall, out = [];
  const put = (kind, n, rMin, rMax) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = h.r * (rMin + Math.random() * (rMax - rMin));
      const d = dinos.spawn(kind, h.x + Math.cos(a) * r, h.y + Math.sin(a) * r);
      d.z = h.floor;
      d.home = [h.x, h.y];
      out.push(d);
    }
  };
  put('cobra', 2, 0.2, 0.55);
  put('aranha', 4, 0.3, 0.65);
  put('morcego', 6, 0.1, 0.5);
  return out;
}
