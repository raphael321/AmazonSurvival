import * as THREE from 'three';
import { toon, INK_MATERIAL } from './toon.js';

// Personagens 3D montados a cada quadro a partir da pose do esqueleto (mesmo IK do 2D).
// Cada osso vira um cilindro e cada junta uma esfera, em toon com contorno de tinta.
// Pose em coordenadas do jogo (x, y sul, z cima) relativa à base; three = (x, z + base, y).

const CYL = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
const CYL_INK = new THREE.CylinderGeometry(1.18, 1.18, 1, 10, 1, true);
const BALL = new THREE.SphereGeometry(1, 14, 10);
const BALL_INK = new THREE.SphereGeometry(1.14, 14, 10);
const UP = new THREE.Vector3(0, 1, 0);

class Body {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.parts = [];
    this.used = 0;
  }

  begin(base) {
    this.base = base;
    this.used = 0;
  }

  get(kind, mat, ink) {
    let p = this.parts[this.used];
    if (!p || p.kind !== kind || p.mat !== mat) {
      if (p) this.group.remove(p.mesh);
      const mesh = new THREE.Mesh(kind === 'seg' ? CYL : BALL, mat);
      mesh.castShadow = true;
      if (ink) mesh.add(new THREE.Mesh(kind === 'seg' ? CYL_INK : BALL_INK, INK_MATERIAL));
      this.group.add(mesh);
      p = { kind, mat, mesh };
      this.parts[this.used] = p;
    }
    p.mesh.visible = true;
    this.used++;
    return p.mesh;
  }

  v(p) {
    return new THREE.Vector3(p[0], p[2] + this.base, p[1]);
  }

  seg(a, b, r, mat, ink = true) {
    const A = this.v(a), B = this.v(b);
    const m = this.get('seg', mat, ink);
    const d = B.clone().sub(A);
    const len = d.length() || 0.001;
    m.position.copy(A).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
    m.scale.set(r, len, r);
  }

  ball(c, r, mat, ink = true, sy = 1) {
    const m = this.get('ball', mat, ink);
    m.position.copy(this.v(c));
    m.quaternion.identity();
    m.scale.set(r, r * sy, r);
  }

  end() {
    for (let k = this.used; k < this.parts.length; k++) this.parts[k].mesh.visible = false;
  }
}

const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

const M = () => ({
  skin: toon('#b07a52'),
  shirt: toon('#d0643a'),
  pants: toon('#5a4a32'),
  boot: toon('#3a2a1c'),
  hair: toon('#2e2219'),
  eye: new THREE.MeshBasicMaterial({ color: '#1d1a12' }),
  steel: toon('#b9c2b0'),
  handle: toon('#6b4a2e'),
  belt: toon('#3a2a1c'),
  capy: toon('#8a6239'),
  capyDark: toon('#5e3f27'),
});

export class PlayerMesh {
  constructor(scene) {
    this.body = new Body(scene);
    this.m = M();
    // rastro do facão: faixa de triângulos atualizada a cada quadro
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6 * 3), 3));
    this.trail = new THREE.Mesh(this.trailGeo, new THREE.MeshBasicMaterial({ color: '#f7dc9a', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
  }

  update(player) {
    const p = player.pose, b = this.body, m = this.m;
    if (!p) return;
    b.begin(player.z);
    // pernas
    for (const [hip, kn, ft] of [[p.hipL, p.knL, p.ftL], [p.hipR, p.knR, p.ftR]]) {
      b.seg(hip, kn, 4.6, m.pants);
      b.ball(kn, 4.2, m.pants, false);
      b.seg(kn, ft, 4, m.pants);
      b.seg(ft, add(ft, [p.fwd[0], p.fwd[1], 0], 6), 3.2, m.boot);
    }
    // tronco: duas esferas achatadas + cilindro, e cinto
    b.seg(add(p.pelvis, [0, 0, 2]), add(p.chest, [0, 0, 1]), 9.5, m.shirt);
    b.ball(p.chest, 10, m.shirt, true, 0.75);
    b.ball(add(p.pelvis, [0, 0, 3]), 8.5, m.pants, true, 0.7);
    b.seg(add(p.pelvis, [0, 0, 5]), add(p.pelvis, [0, 0, 7]), 9, m.belt, false);
    b.seg(p.neck, add(p.chest, [0, 0, 4]), 3.2, m.skin, false);
    // braços
    for (const [sh, el, h] of [[p.shL, p.elL, p.hL], [p.shR, p.elR, p.hR]]) {
      b.ball(sh, 4.6, m.shirt, false);
      b.seg(sh, el, 3.8, m.shirt);
      b.seg(el, h, 3.1, m.skin);
      b.ball(h, 3.4, m.skin);
    }
    // arma da mão (o golpe usa a mesma linha base → ponta do facão)
    const dir = p.bladeDir, base = p.bladeBase;
    // lado da lâmina: perpendicular ao cabo, no plano horizontal
    const sl = Math.hypot(dir[0], dir[1]) || 1, side = [-dir[1] / sl, dir[0] / sl, 0];
    const wpn = player.weapon || 'facao';
    if (wpn === 'machado') {
      const top = add(base, dir, 30);
      b.seg(add(base, dir, -8), top, 1.7, m.handle, false);
      b.seg(add(top, dir, -7), add(add(top, dir, -3), side, 9), 4.2, m.steel); // lâmina larga
      b.seg(add(top, dir, -6), add(top, side, -4), 2.2, m.steel); // contrapeso
    } else if (wpn === 'espada') {
      b.seg(add(base, dir, -6), add(base, dir, 2), 1.5, m.handle, false);
      b.seg(add(add(base, dir, 2), side, -6), add(add(base, dir, 2), side, 6), 1.3, m.belt, false); // guarda
      b.seg(add(base, dir, 3), add(base, dir, 42), 1.6, m.steel);
    } else if (wpn === 'arco') {
      // arco na mão esquerda: arco de pedaços + corda
      const h = p.hL, up = [0, 0, 1], f = p.fwd || [Math.cos(player.angle), Math.sin(player.angle), 0];
      let prev = null;
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6 - 0.5) * 2.2, q = add(add(h, up, Math.sin(a) * 26), f, Math.cos(a) * 9 - 6);
        if (prev) b.seg(prev, q, 1.4, m.handle, false);
        prev = q;
      }
      b.seg(add(add(h, up, 25), f, -4), add(add(h, up, -25), f, -4), 0.35, m.steel, false);
    } else {
      b.seg(add(base, dir, -5), add(base, dir, 3), 1.6, m.handle, false);
      b.seg(add(base, dir, 3), p.bladeTip, 1.5, m.steel);
    }
    // cabeça, cabelo, olhos
    const f = p.headFwd, r = p.headRight;
    b.ball(p.head, 9, m.skin);
    b.ball(add(p.head, [-f[0] * 2.2, -f[1] * 2.2, 2.6]), 9.3, m.hair, false);
    for (const s of [-1, 1]) b.ball(add(p.head, [f[0] * 8 + r[0] * s * 3.4, f[1] * 8 + r[1] * s * 3.4, -0.5]), 1.3, m.eye, false, 1.5);
    b.end();
    // rastro
    const pos = this.trailGeo.attributes.position;
    let n = 0;
    const tr = player.trail;
    for (let k = 0; k < tr.length - 1 && n < 64; k++, n++) {
      const a = tr[k], c = tr[k + 1];
      const pts = [a.tip, c.tip, c.base, a.tip, c.base, a.base].map((q) => b.v(q));
      pts.forEach((q, t) => pos.setXYZ(n * 6 + t, q.x, q.y, q.z));
    }
    this.trailGeo.setDrawRange(0, n * 6);
    pos.needsUpdate = true;
  }
}

export class CapybaraMesh {
  constructor(scene) {
    this.body = new Body(scene);
    this.m = M();
  }

  update(capy) {
    const p = capy.pose, b = this.body, m = this.m;
    if (!p) return;
    b.begin(capy.z);
    const f = p.fwd, r = p.right;
    for (const leg of p.legs) {
      b.seg(leg.hip, leg.knee, 4.4, m.capy);
      b.seg(leg.knee, leg.foot, 3.4, m.capy);
      b.ball(leg.foot, 3.2, m.capyDark, false);
    }
    // corpo em barril
    b.seg(p.rump, p.chest, 15.5, m.capy);
    b.ball(p.rump, 18, m.capy);
    b.ball(p.chest, 15.5, m.capy);
    // cabeça quadradona e focinho rombudo
    b.seg(p.chest, p.cranium, 9, m.capy, false);
    b.ball(p.cranium, 9, m.capy);
    b.seg(p.cranium, p.muzzle, 7.5, m.capy);
    b.ball(p.muzzle, 7.2, m.capyDark);
    for (const s of [-1, 1]) {
      b.ball(add(p.cranium, [r[0] * s * 4.5 - f[0] * 3, r[1] * s * 4.5 - f[1] * 3, 7.5]), 2.8, m.capyDark);
      b.ball(add(p.cranium, [r[0] * s * 6.5 + f[0] * 3, r[1] * s * 6.5 + f[1] * 3, 3]), p.blink ? 0.4 : 1.6, m.eye, false);
    }
    b.end();
  }
}
